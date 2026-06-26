"""End-to-end tests for the CAVI single-level referral feature.

Covers:
- GET /api/referrals returns stable code + link, zeroed stats
- /api/auth/register stores referralCode on pending_registrations
- Claim math (10% of completed-month ROI), idempotency, balance gating
- Separate referral pocket withdrawal, main balance unaffected
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# --- Config ---------------------------------------------------------------
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://cavi-instructions.preview.emergentagent.com"
API = f"{BASE_URL}/api"

# Read backend env directly (we are running on the same container)
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TEST_USER_EMAIL = "hajraanwar157@gmail.com"
TEST_USER_PASSWORD = "NewCavi@2026"

PAST_MONTH = "2025-10"   # strictly past in PKT (Jan 2026)
PAST_DATE_1 = "2025-10-10"
PAST_DATE_2 = "2025-10-20"

# --- Mongo loop helper ----------------------------------------------------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="module")
def db(event_loop):
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]

def run(coro, event_loop):
    return event_loop.run_until_complete(coro)


# --- HTTP fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="module")
def auth_token(session):
    r = session.post(f"{API}/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# --- Seed cleanup --------------------------------------------------------
REFEREE_ID = "test-referee-" + uuid.uuid4().hex[:8]

@pytest.fixture(scope="module", autouse=True)
def cleanup_seed(event_loop, db, auth_token, session):
    # Pull test user
    r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {auth_token}"})
    assert r.status_code == 200
    referrer = r.json()["user"]
    referrer_id = referrer["id"]

    # Pre-clean any prior test data
    async def pre():
        await db.users.delete_many({"id": {"$regex": "^test-referee-"}})
        await db.users.delete_many({"referredBy": referrer_id, "email": {"$regex": "^TEST_"}})
        await db.roi.delete_many({"userId": {"$regex": "^test-referee-"}})
        await db.withdrawals.delete_many({"userId": {"$regex": "^test-referee-"}})
        await db.referral_claims.delete_many({"referrerId": referrer_id})
        await db.withdrawals.delete_many({"userId": referrer_id, "source": "referral"})
        await db.pending_registrations.delete_many({"email": {"$regex": "^TEST_ref"}})
    run(pre(), event_loop)

    yield {"referrer_id": referrer_id, "referrer": referrer}

    # Teardown
    async def post():
        await db.users.delete_many({"id": {"$regex": "^test-referee-"}})
        await db.roi.delete_many({"userId": {"$regex": "^test-referee-"}})
        await db.withdrawals.delete_many({"userId": {"$regex": "^test-referee-"}})
        await db.referral_claims.delete_many({"referrerId": referrer_id})
        await db.withdrawals.delete_many({"userId": referrer_id, "source": "referral"})
        await db.pending_registrations.delete_many({"email": {"$regex": "^TEST_ref"}})
    run(post(), event_loop)


# ==========================================================================
# 1) GET /api/referrals — code + link + zeroed stats (before seeding)
# ==========================================================================
class TestReferralOverviewBasic:
    def test_get_referrals_returns_code_and_link(self, session, auth_headers):
        r = session.get(f"{API}/referrals", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "referralCode" in data and isinstance(data["referralCode"], str) and len(data["referralCode"]) >= 6
        assert data["referralLink"].endswith(f"/signup?ref={data['referralCode']}")
        assert data["rate"] == 0.10
        # Zeroed referral pocket prior to any claims
        assert data["earned"] == 0
        assert data["balance"] == 0
        assert data["claimable"] == 0
        assert isinstance(data["referees"], list)
        assert isinstance(data["claims"], list)

    def test_get_referrals_code_is_stable(self, session, auth_headers):
        r1 = session.get(f"{API}/referrals", headers=auth_headers).json()
        r2 = session.get(f"{API}/referrals", headers=auth_headers).json()
        assert r1["referralCode"] == r2["referralCode"]


# ==========================================================================
# 2) Register with referralCode stores it on pending_registrations
# ==========================================================================
class TestRegisterStoresReferralCode:
    def test_register_stores_referralCode(self, session, auth_headers, event_loop, db):
        # Get the referrer's code from /api/referrals
        ov = session.get(f"{API}/referrals", headers=auth_headers).json()
        code = ov["referralCode"]
        new_email = f"TEST_ref_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/auth/register", json={
            "username": "TestReferee", "email": new_email,
            "password": "Cavi@Test123", "referralCode": code.lower(),  # ensure case-insensitive store
        })
        # We don't care if email sends; we care the pending_registrations got it
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("otpRequired") is True

        async def fetch():
            return await db.pending_registrations.find_one({"email": new_email.lower()})
        pending = run(fetch(), event_loop)
        assert pending is not None, "pending_registrations row not created"
        assert pending.get("referralCode") == code.upper(), \
            f"Expected referralCode stored uppercase {code.upper()} got {pending.get('referralCode')}"


# ==========================================================================
# 3) Claim math + idempotency + balance gating
# ==========================================================================
class TestReferralClaimMath:
    @pytest.fixture(scope="class", autouse=True)
    def seed_referee(self, request, event_loop, db, session, auth_token, cleanup_seed):
        referrer_id = cleanup_seed["referrer_id"]
        referee_id = "test-referee-" + uuid.uuid4().hex[:8]
        request.cls.referee_id = referee_id
        request.cls.referrer_id = referrer_id

        async def seed():
            await db.users.insert_one({
                "id": referee_id,
                "username": "SeededReferee",
                "email": f"TEST_referee_{referee_id}@example.com",
                "password": "x", "loginType": "email", "walletAddress": None,
                "role": "user", "roiAllowed": True, "wdAllowed": True,
                "depositBase": 1000.0, "depositCount": 1, "securityFlag": False,
                "emailVerified": True,
                "referralCode": "TESTRRR" + uuid.uuid4().hex[:3].upper(),
                "referredBy": referrer_id,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            # PAST month ROI: 100 + 50 = 150
            await db.roi.insert_many([
                {"id": str(uuid.uuid4()), "userId": referee_id, "amount": 100.0, "cycleDate": PAST_DATE_1, "createdAt": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "userId": referee_id, "amount": 50.0, "cycleDate": PAST_DATE_2, "createdAt": datetime.now(timezone.utc).isoformat()},
            ])
        run(seed(), event_loop)

    def test_overview_shows_claimable_15(self, session, auth_headers):
        r = session.get(f"{API}/referrals", headers=auth_headers).json()
        assert r["referredCount"] >= 1
        assert r["activeCount"] >= 1
        # 10% of 150 = 15.0
        assert r["claimable"] == 15.0, f"Expected claimable=15.0, got {r['claimable']}"

    def test_claim_returns_15(self, session, auth_headers, event_loop, db):
        r = session.post(f"{API}/referrals/claim", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["claimed"] == 15.0, f"Expected claimed=15.0, got {body['claimed']}"
        assert body["count"] >= 1
        # A referral_claims row exists
        async def find():
            return await db.referral_claims.find_one({"referrerId": self.referrer_id, "refereeId": self.referee_id, "month": PAST_MONTH})
        claim = run(find(), event_loop)
        assert claim is not None
        assert abs(claim["amount"] - 15.0) < 1e-6

    def test_second_claim_returns_400(self, session, auth_headers):
        r = session.post(f"{API}/referrals/claim", headers=auth_headers)
        assert r.status_code == 400
        assert "Nothing to claim" in r.text or "nothing to claim" in r.text.lower()

    def test_overview_after_claim(self, session, auth_headers):
        r = session.get(f"{API}/referrals", headers=auth_headers).json()
        assert r["earned"] == 15.0
        assert r["balance"] == 15.0
        assert r["claimable"] == 0


# ==========================================================================
# 4) Balance-gating: drain referee balance -> claimable drops to 0
# ==========================================================================
class TestBalanceGating:
    @pytest.fixture(scope="class", autouse=True)
    def seed(self, request, event_loop, db, cleanup_seed):
        referrer_id = cleanup_seed["referrer_id"]
        referee_id = "test-referee-" + uuid.uuid4().hex[:8]
        request.cls.referee_id = referee_id
        request.cls.referrer_id = referrer_id
        prev_past = "2025-09"
        prev_date = "2025-09-15"

        async def seed_data():
            await db.users.insert_one({
                "id": referee_id, "username": "DrainedReferee",
                "email": f"TEST_referee2_{referee_id}@example.com",
                "password": "x", "loginType": "email", "walletAddress": None,
                "role": "user", "roiAllowed": True, "wdAllowed": True,
                "depositBase": 200.0, "depositCount": 1, "securityFlag": False,
                "emailVerified": True,
                "referralCode": "TDRN" + uuid.uuid4().hex[:4].upper(),
                "referredBy": referrer_id,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            # PAST month ROI: 80 (=> would yield 8.0 referral)
            await db.roi.insert_one({
                "id": str(uuid.uuid4()), "userId": referee_id, "amount": 80.0,
                "cycleDate": prev_date, "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            # Approved withdrawal that drains balance (200 + 80 = 280) -> netAmount 300
            await db.withdrawals.insert_one({
                "id": str(uuid.uuid4()), "userId": referee_id, "amount": 300.0,
                "netAmount": 300.0, "penaltyAmount": 0.0,
                "network": "trc20", "destinationAddress": "Ttest", "status": "approved",
                "requestedAt": datetime.now(timezone.utc).isoformat(),
                "processedAt": datetime.now(timezone.utc).isoformat(),
            })
        run(seed_data(), event_loop)
        request.cls.prev_past = prev_past

    def test_drained_referee_not_claimable(self, session, auth_headers):
        r = session.get(f"{API}/referrals", headers=auth_headers).json()
        # Find this referee row
        rows = [x for x in r["referees"] if x.get("username") == "DrainedReferee"]
        assert rows, "Drained referee not in referees list"
        assert rows[0]["active"] is False
        # The 2025-09 month should NOT contribute to claimable
        # (Other tests have a claimable=0 already, but verify no extra)
        # Claim should fail with 400
        rr = session.post(f"{API}/referrals/claim", headers=auth_headers)
        assert rr.status_code == 400


# ==========================================================================
# 5) Referral pocket withdrawal — main balance unaffected
# ==========================================================================
class TestReferralPocketWithdrawal:
    def test_main_balance_unaffected_by_referral_withdrawal(self, session, auth_headers, event_loop, db, cleanup_seed):
        # Get main balance before
        me_before = session.get(f"{API}/auth/me", headers=auth_headers).json()
        main_balance_before = me_before["financials"]["balance"]

        # Withdraw $5 from referral pocket
        r = session.post(f"{API}/referrals/withdraw", headers=auth_headers, json={
            "amount": 5.0, "network": "trc20", "destinationAddress": "TtestAddr1234567890",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["withdrawal"]["source"] == "referral"
        assert body["withdrawal"]["status"] == "pending"

        # Main balance unchanged
        me_after = session.get(f"{API}/auth/me", headers=auth_headers).json()
        main_balance_after = me_after["financials"]["balance"]
        assert main_balance_after == main_balance_before, \
            f"Main balance changed by referral withdrawal: {main_balance_before} -> {main_balance_after}"

        # Referral balance reduced
        ov = session.get(f"{API}/referrals", headers=auth_headers).json()
        assert ov["balance"] == 10.0, f"Expected referral balance 10.0 after $5 withdrawal of $15, got {ov['balance']}"

    def test_over_withdraw_returns_400(self, session, auth_headers):
        r = session.post(f"{API}/referrals/withdraw", headers=auth_headers, json={
            "amount": 9999.0, "network": "trc20", "destinationAddress": "TtestAddr",
        })
        assert r.status_code == 400
        assert "Insufficient" in r.text or "insufficient" in r.text.lower()

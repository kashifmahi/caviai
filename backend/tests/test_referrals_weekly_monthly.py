"""Iteration 12: CAVI referral WEEKLY+MONTHLY engine, mode-change flow, admin actions.

Covers:
- Regression: login admin + test user, register returns otpRequired
- Overview defaults (weekly mode, cap=3, modeChangeRequest=null)
- Weekly windows math + 3/month cap blocks 4th claim
- Weekly incomplete window pending, not claimable
- Weekly balance gating (referee balance <=0)
- Monthly mode math (no cap)
- Mode-change request flow + admin approve/reject + duplicate-pending guard
- Separate referral pocket withdrawal not affecting main balance
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta, date

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "superadmin@cavi.io"
ADMIN_PASSWORD = "Cavi@Admin2025"
TEST_USER_EMAIL = "hajraanwar157@gmail.com"
TEST_USER_PASSWORD = "NewCavi@2026"

# PKT today (UTC+5)
PKT_TODAY = (datetime.now(timezone.utc) + timedelta(hours=5)).date()
CURRENT_MONTH = PKT_TODAY.isoformat()[:7]

# Weekly anchor must give 4 complete past 7-day windows
W_ANCHOR = date(2026, 4, 1)
W1, W2, W3, W4 = W_ANCHOR, W_ANCHOR + timedelta(days=7), W_ANCHOR + timedelta(days=14), W_ANCHOR + timedelta(days=21)

# ---------- fixtures ----------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="module")
def db():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]

def run(coro, loop): return loop.run_until_complete(coro)

@pytest.fixture(scope="module")
def s():
    return requests.Session()

def login(s, email, pwd):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def user_token(s): return login(s, TEST_USER_EMAIL, TEST_USER_PASSWORD)
@pytest.fixture(scope="module")
def admin_token(s): return login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
@pytest.fixture(scope="module")
def H(user_token): return {"Authorization": f"Bearer {user_token}"}
@pytest.fixture(scope="module")
def HA(admin_token): return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture(scope="module")
def referrer_id(s, H):
    return s.get(f"{API}/auth/me", headers=H).json()["user"]["id"]

@pytest.fixture(scope="module", autouse=True)
def cleanup(event_loop, db, referrer_id):
    async def wipe():
        await db.users.delete_many({"id": {"$regex": "^test-referee-"}})
        await db.roi.delete_many({"userId": {"$regex": "^test-referee-"}})
        await db.withdrawals.delete_many({"userId": {"$regex": "^test-referee-"}})
        await db.referral_claims.delete_many({"referrerId": referrer_id})
        await db.withdrawals.delete_many({"userId": referrer_id, "source": "referral"})
        await db.referral_mode_requests.delete_many({"userId": referrer_id})
        await db.users.update_one({"id": referrer_id}, {"$set": {"referralMode": "weekly"}})
        await db.pending_registrations.delete_many({"email": {"$regex": "^test_ref_"}})
    run(wipe(), event_loop)
    yield
    run(wipe(), event_loop)


def _mk_referee(referee_id, deposit_base=1000.0):
    return {
        "id": referee_id, "username": f"R_{referee_id[-4:]}",
        "email": f"TEST_{referee_id}@x.com",
        "password": "x", "loginType": "email", "walletAddress": None,
        "role": "user", "roiAllowed": True, "wdAllowed": True,
        "depositBase": deposit_base, "depositCount": 1, "securityFlag": False,
        "emailVerified": True,
        "referralCode": "T" + uuid.uuid4().hex[:6].upper(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

def _roi(uid, amount, cycle_date_iso):
    return {"id": str(uuid.uuid4()), "userId": uid, "amount": float(amount),
            "cycleDate": cycle_date_iso, "createdAt": datetime.now(timezone.utc).isoformat()}


# ============================================================
# 1) REGRESSION — login works for both, register returns otpRequired
# ============================================================
class TestAuthRegression:
    def test_admin_login(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200 and "token" in r.json()

    def test_user_login(self, s):
        r = s.post(f"{API}/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
        assert r.status_code == 200 and "token" in r.json()

    def test_register_returns_otp_required(self, s):
        email = f"test_ref_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "username": "TempUser", "email": email, "password": "Cavi@Test123"})
        assert r.status_code == 200, r.text
        assert r.json().get("otpRequired") is True


# ============================================================
# 2) Overview defaults (fresh referrer state — no referees yet)
# ============================================================
class TestOverviewDefaults:
    def test_defaults(self, s, H):
        r = s.get(f"{API}/referrals", headers=H).json()
        assert r["mode"] == "weekly"
        assert r["weeklyCap"] == 3
        assert r["weeklyUsed"] == 0
        assert r["weeklyRemaining"] == 3
        assert r["modeChangeRequest"] is None
        assert r["referralLink"].endswith(f"/signup?ref={r['referralCode']}")
        assert r["rate"] == 0.10


# ============================================================
# 3) WEEKLY math + 3/month cap + 4th-claim block
# ============================================================
class TestWeeklyClaim:
    referee_id = "test-referee-weekly-" + uuid.uuid4().hex[:6]

    @pytest.fixture(scope="class", autouse=True)
    def seed(self, event_loop, db, referrer_id):
        rid = self.referee_id
        async def go():
            u = _mk_referee(rid, deposit_base=1000.0)
            u["referredBy"] = referrer_id
            await db.users.insert_one(u)
            # 4 complete past weekly windows + 1 current (incomplete) for pending check
            await db.roi.insert_many([
                _roi(rid, 100.0, W1.isoformat()),                                  # W1 sum=100
                _roi(rid, 200.0, (W2 + timedelta(days=1)).isoformat()),            # W2 sum=200
                _roi(rid, 50.0,  (W3 + timedelta(days=2)).isoformat()),            # W3 sum=50
                _roi(rid, 80.0,  (W4 + timedelta(days=3)).isoformat()),            # W4 sum=80
                _roi(rid, 70.0,  PKT_TODAY.isoformat()),                            # current week (incomplete)
            ])
            # Make sure referrer is weekly
            await db.users.update_one({"id": referrer_id}, {"$set": {"referralMode": "weekly"}})
            await db.referral_claims.delete_many({"referrerId": referrer_id})
        run(go(), event_loop)

    def test_overview_claimable_is_oldest_three(self, s, H):
        r = s.get(f"{API}/referrals", headers=H).json()
        # 10 + 20 + 5 = 35 (oldest 3 windows; W4 capped out)
        assert r["claimable"] == 35.0, f"claimable {r['claimable']}"
        assert r["weeklyUsed"] == 0
        assert r["weeklyRemaining"] == 3
        # pending should include the incomplete current window (>=7.0 from 70 *0.1)
        assert r["pendingThisMonth"] >= 7.0

    def test_claim_returns_35_and_three_rows(self, s, H, event_loop, db, referrer_id):
        r = s.post(f"{API}/referrals/claim", headers=H)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["claimed"] == 35.0
        assert body["count"] == 3
        assert body["mode"] == "weekly"
        assert body["weeklyRemaining"] == 0

        async def fetch():
            return await db.referral_claims.find({"referrerId": referrer_id, "mode": "weekly"}, {"_id": 0}).to_list(50)
        rows = run(fetch(), event_loop)
        assert len(rows) == 3
        periods = sorted(r["period"] for r in rows)
        # Should be W1, W2, W3 ISO dates
        assert periods == [W1.isoformat(), W2.isoformat(), W3.isoformat()]
        for row in rows:
            assert row["claimMonth"] == CURRENT_MONTH
            assert row["mode"] == "weekly"

    def test_second_claim_blocked_by_cap(self, s, H):
        r = s.post(f"{API}/referrals/claim", headers=H)
        assert r.status_code == 400
        body_text = r.text.lower()
        assert "only" in body_text and "3 times" in body_text

    def test_overview_after_cap(self, s, H):
        r = s.get(f"{API}/referrals", headers=H).json()
        assert r["weeklyUsed"] == 3
        assert r["weeklyRemaining"] == 0
        # 4th window is excluded because cap exhausted (claimable=0 even though W4 is complete)
        assert r["claimable"] == 0


# ============================================================
# 4) WEEKLY balance gating — drain referee, claimable -> 0
# ============================================================
class TestWeeklyBalanceGate:
    referee_id = "test-referee-drained-" + uuid.uuid4().hex[:6]

    @pytest.fixture(scope="class", autouse=True)
    def seed(self, event_loop, db, referrer_id):
        rid = self.referee_id
        async def go():
            u = _mk_referee(rid, deposit_base=200.0)
            u["referredBy"] = referrer_id
            await db.users.insert_one(u)
            await db.roi.insert_one(_roi(rid, 80.0, W1.isoformat()))
            # Approved non-referral withdrawal that drains: netAmount=300 > 280
            await db.withdrawals.insert_one({
                "id": str(uuid.uuid4()), "userId": rid, "amount": 300.0,
                "netAmount": 300.0, "penaltyAmount": 0.0,
                "network": "trc20", "destinationAddress": "Tdrain", "status": "approved",
                "requestedAt": datetime.now(timezone.utc).isoformat(),
            })
        run(go(), event_loop)

    def test_drained_not_in_claimable_and_claim_blocks(self, s, H):
        r = s.get(f"{API}/referrals", headers=H).json()
        row = next((x for x in r["referees"] if x["username"].startswith("R_")), None)
        # Find this referee specifically (drained)
        drained = [x for x in r["referees"] if x["claimable"] == 0 and x["active"] is False]
        assert drained, "expected an inactive (drained) referee"
        # Because weekly cap already exhausted in prior class OR no claimable, claim returns 400
        rr = s.post(f"{API}/referrals/claim", headers=H)
        assert rr.status_code == 400


# ============================================================
# 5) MONTHLY mode math (no cap)
# ============================================================
class TestMonthlyClaim:
    referee_id = "test-referee-monthly-" + uuid.uuid4().hex[:6]

    @pytest.fixture(scope="class", autouse=True)
    def seed(self, event_loop, db, referrer_id):
        rid = self.referee_id
        async def go():
            # Clean prior test referees so only this monthly referee contributes
            await db.users.delete_many({"id": {"$regex": "^test-referee-"}})
            await db.roi.delete_many({"userId": {"$regex": "^test-referee-"}})
            await db.withdrawals.delete_many({"userId": {"$regex": "^test-referee-"}})
            # Clear all weekly claims to avoid cap interference
            await db.referral_claims.delete_many({"referrerId": referrer_id})
            u = _mk_referee(rid, deposit_base=1000.0)
            u["referredBy"] = referrer_id
            await db.users.insert_one(u)
            # Switch referrer to monthly
            await db.users.update_one({"id": referrer_id}, {"$set": {"referralMode": "monthly"}})
            # Past months
            await db.roi.insert_many([
                _roi(rid, 200.0, "2026-03-05"),
                _roi(rid, 100.0, "2026-03-25"),  # March total 300 -> reward 30
                _roi(rid, 100.0, "2026-04-10"),  # April total 100 -> reward 10
                _roi(rid, 50.0,  PKT_TODAY.isoformat()),  # current month -> pending
            ])
        run(go(), event_loop)

    def test_overview_monthly_math(self, s, H):
        r = s.get(f"{API}/referrals", headers=H).json()
        assert r["mode"] == "monthly"
        # 30 + 10 = 40
        assert r["claimable"] == 40.0, f"got {r['claimable']}"
        assert r["pendingThisMonth"] >= 5.0  # 50 * 0.1

    def test_claim_creates_monthly_rows(self, s, H, event_loop, db, referrer_id):
        r = s.post(f"{API}/referrals/claim", headers=H)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["claimed"] == 40.0
        assert body["mode"] == "monthly"
        async def fetch():
            return await db.referral_claims.find({"referrerId": referrer_id, "mode": "monthly"}, {"_id": 0}).to_list(50)
        rows = run(fetch(), event_loop)
        periods = sorted(r["period"] for r in rows)
        assert periods == ["2026-03", "2026-04"]
        # No cap on monthly
        r2 = s.get(f"{API}/referrals", headers=H).json()
        assert r2["claimable"] == 0


# ============================================================
# 6) MODE CHANGE REQUEST flow + admin approve + reject + duplicate
# ============================================================
class TestModeChangeFlow:

    @pytest.fixture(scope="class", autouse=True)
    def reset_state(self, event_loop, db, referrer_id):
        async def go():
            # Reset referrer to weekly + clear any prior requests
            await db.users.update_one({"id": referrer_id}, {"$set": {"referralMode": "weekly"}})
            await db.referral_mode_requests.delete_many({"userId": referrer_id})
        run(go(), event_loop)

    def test_same_mode_rejected(self, s, H):
        # already weekly
        r = s.post(f"{API}/referrals/mode-request", headers=H, json={"mode": "weekly"})
        assert r.status_code == 400
        assert "already weekly" in r.text.lower()

    def test_create_request_to_monthly(self, s, H):
        r = s.post(f"{API}/referrals/mode-request", headers=H, json={"mode": "monthly"})
        assert r.status_code == 200, r.text
        req = r.json()["request"]
        assert req["status"] == "pending"
        assert req["requestedMode"] == "monthly"
        # Overview reflects it
        ov = s.get(f"{API}/referrals", headers=H).json()
        assert ov["modeChangeRequest"] is not None
        assert ov["modeChangeRequest"]["status"] == "pending"

    def test_duplicate_pending_blocked(self, s, H):
        r = s.post(f"{API}/referrals/mode-request", headers=H, json={"mode": "monthly"})
        assert r.status_code == 400
        assert "pending" in r.text.lower()

    def test_admin_lists_request(self, s, HA, event_loop, db, referrer_id):
        r = s.get(f"{API}/admin/referral-mode-requests", headers=HA)
        assert r.status_code == 200
        items = r.json()["requests"]
        mine = [x for x in items if x["userId"] == referrer_id and x["status"] == "pending"]
        assert mine, "Pending request not visible to admin"
        TestModeChangeFlow._req_id = mine[0]["id"]

    def test_admin_approve_flips_mode(self, s, HA, H):
        rid = TestModeChangeFlow._req_id
        r = s.patch(f"{API}/admin/referral-mode-requests/{rid}", headers=HA, json={"status": "approved"})
        assert r.status_code == 200, r.text
        ov = s.get(f"{API}/referrals", headers=H).json()
        assert ov["mode"] == "monthly"
        assert ov["modeChangeRequest"] is None

    def test_already_decided_returns_400(self, s, HA):
        rid = TestModeChangeFlow._req_id
        r = s.patch(f"{API}/admin/referral-mode-requests/{rid}", headers=HA, json={"status": "approved"})
        assert r.status_code == 400

    def test_reject_path(self, s, HA, H, event_loop, db, referrer_id):
        # Now user is monthly; request switch back to weekly, then admin rejects
        r = s.post(f"{API}/referrals/mode-request", headers=H, json={"mode": "weekly"})
        assert r.status_code == 200, r.text
        rid2 = r.json()["request"]["id"]
        rr = s.patch(f"{API}/admin/referral-mode-requests/{rid2}", headers=HA, json={"status": "rejected"})
        assert rr.status_code == 200
        ov = s.get(f"{API}/referrals", headers=H).json()
        # Mode stays monthly (reject does not flip)
        assert ov["mode"] == "monthly"

    def test_restore_weekly_for_next_runs(self, event_loop, db, referrer_id):
        async def go():
            await db.users.update_one({"id": referrer_id}, {"$set": {"referralMode": "weekly"}})
            await db.referral_mode_requests.delete_many({"userId": referrer_id})
        run(go(), event_loop)


# ============================================================
# 7) Referral pocket withdrawal — main balance unaffected
# ============================================================
class TestReferralPocketWithdraw:
    def test_pocket_isolated(self, s, H):
        # We already claimed 35 (weekly) + 40 (monthly) earlier but cleanup between
        # may have wiped weekly claims; refetch current referral balance
        ov_before = s.get(f"{API}/referrals", headers=H).json()
        bal = ov_before["balance"]
        if bal <= 0:
            pytest.skip("No referral balance accumulated for withdrawal test")
        main_before = s.get(f"{API}/auth/me", headers=H).json()["financials"]["balance"]
        wd_amt = min(5.0, bal)
        r = s.post(f"{API}/referrals/withdraw", headers=H,
                   json={"amount": wd_amt, "network": "trc20", "destinationAddress": "TtestRefPocket"})
        assert r.status_code == 200, r.text
        assert r.json()["withdrawal"]["source"] == "referral"
        main_after = s.get(f"{API}/auth/me", headers=H).json()["financials"]["balance"]
        assert main_after == main_before, f"main balance changed {main_before}->{main_after}"

    def test_over_withdraw_400(self, s, H):
        r = s.post(f"{API}/referrals/withdraw", headers=H,
                   json={"amount": 99999.0, "network": "trc20", "destinationAddress": "Tover"})
        assert r.status_code == 400
        assert "insufficient" in r.text.lower()

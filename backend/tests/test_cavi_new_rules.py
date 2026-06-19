"""CAVI iteration-3 NEW rules: one-wallet-per-network, 3-deposit limit + flag,
admin security tab/clear-flag, deposit ledger, ROI activation date logic."""
import os
import uuid
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

SUPER_EMAIL = "superadmin@cavi.io"
SUPER_PASS = "Cavi@Admin2025"
PKT = timezone(timedelta(hours=5))


def auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def super_token(session):
    r = session.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def fresh_user(session):
    uid = uuid.uuid4().hex[:8]
    creds = {"username": f"TEST_new_{uid}", "email": f"TEST_new_{uid}@test.com", "password": "pass1234"}
    r = session.post(f"{API}/auth/register", json=creds)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "creds": creds}


# ---------- One wallet per network ----------
class TestOneWalletPerNetwork:
    def test_create_eth_then_duplicate_blocked(self, session, fresh_user):
        tok = fresh_user["token"]
        body = {"network": "ETH", "address": "0x" + uuid.uuid4().hex, "privateKey": "0x" + uuid.uuid4().hex, "label": "ETH"}
        r = session.post(f"{API}/wallets", json=body, headers=auth(tok))
        assert r.status_code == 200, r.text

        # Duplicate ETH must return 400
        body2 = {"network": "ETH", "address": "0x" + uuid.uuid4().hex, "privateKey": "0x" + uuid.uuid4().hex, "label": "ETH2"}
        r2 = session.post(f"{API}/wallets", json=body2, headers=auth(tok))
        assert r2.status_code == 400, r2.text
        assert "already" in r2.json()["detail"].lower()

        # Different network (SOL) must succeed
        body3 = {"network": "SOL", "address": "Sol" + uuid.uuid4().hex[:30], "privateKey": uuid.uuid4().hex, "label": "SOL"}
        r3 = session.post(f"{API}/wallets", json=body3, headers=auth(tok))
        assert r3.status_code == 200, r3.text

        # User now has 2 wallets
        rL = session.get(f"{API}/wallets", headers=auth(tok))
        nets = {w["network"] for w in rL.json()["wallets"]}
        assert nets == {"ETH", "SOL"}


# ---------- /auth/me attemptsRemaining + supportEmail ----------
class TestAuthMeMeta:
    def test_me_includes_attempts_and_support(self, session, fresh_user):
        r = session.get(f"{API}/auth/me", headers=auth(fresh_user["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d.get("depositAttemptsRemaining") == 3
        assert "@" in (d.get("supportEmail") or "")


# ---------- 3-deposit limit + flag + 4th=403 ----------
class TestDepositLimitAndFlag:
    def test_three_deposits_then_flag_on_fourth(self, session, fresh_user):
        tok = fresh_user["token"]
        # create ETH wallet
        body = {"network": "ETH", "address": "0x" + uuid.uuid4().hex, "privateKey": "0x" + uuid.uuid4().hex, "label": "ETH"}
        wid = session.post(f"{API}/wallets", json=body, headers=auth(tok)).json()["wallet"]["id"]

        # 3 successful deposits
        remaining_seen = []
        roi_starts = []
        for i, amt in enumerate([100, 200, 300], start=1):
            r = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": amt}, headers=auth(tok))
            assert r.status_code == 200, f"deposit {i}: {r.text}"
            j = r.json()
            assert "roiStartDate" in j and j["roiStartDate"]
            assert "attemptsRemaining" in j
            remaining_seen.append(j["attemptsRemaining"])
            roi_starts.append(j["roiStartDate"])
        assert remaining_seen == [2, 1, 0]

        # ROI start date consistency check (PKT hour rule)
        now = datetime.now(PKT)
        expected = now.date().isoformat() if now.hour == 5 else (now + timedelta(days=1)).date().isoformat()
        for d in roi_starts:
            assert d == expected, f"got roiStartDate={d}, expected {expected} (PKT hour={now.hour})"

        # /auth/me reflects 0 attempts remaining
        me = session.get(f"{API}/auth/me", headers=auth(tok)).json()
        assert me["depositAttemptsRemaining"] == 0
        assert me["user"].get("securityFlag") in (False, None)

        # 4th deposit -> 403 and user gets flagged
        r4 = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 50}, headers=auth(tok))
        assert r4.status_code == 403, r4.text
        assert "contact" in r4.json()["detail"].lower() or "flagged" in r4.json()["detail"].lower()

        me2 = session.get(f"{API}/auth/me", headers=auth(tok)).json()
        assert me2["user"].get("securityFlag") is True

        # Subsequent deposit attempts also 403
        r5 = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 10}, headers=auth(tok))
        assert r5.status_code == 403

        # Stash for next test
        fresh_user["wallet_id"] = wid


# ---------- Deposit ledger ----------
class TestDepositLedger:
    def test_ledger_returns_deposits_with_roi_active_flag(self, session, fresh_user):
        tok = fresh_user["token"]
        body = {"network": "ETH", "address": "0x" + uuid.uuid4().hex, "privateKey": "0x" + uuid.uuid4().hex, "label": "ETH"}
        wid = session.post(f"{API}/wallets", json=body, headers=auth(tok)).json()["wallet"]["id"]
        for amt in (75, 125):
            r = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": amt}, headers=auth(tok))
            assert r.status_code == 200

        r = session.get(f"{API}/wallets/{wid}/deposits", headers=auth(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "wallet" in d and "deposits" in d and "total" in d
        assert abs(d["total"] - 200.0) < 0.001
        assert len(d["deposits"]) == 2
        for dep in d["deposits"]:
            for k in ("amount", "depositedAt", "roiStartDate", "roiActive"):
                assert k in dep, f"missing {k} in ledger deposit"
            assert isinstance(dep["roiActive"], bool)


# ---------- Admin security tab + clear flag ----------
class TestAdminSecurity:
    def test_fraud_listing_and_clear_flag_resets_attempts(self, session, super_token):
        # Create + flag a new user
        uid = uuid.uuid4().hex[:8]
        creds = {"username": f"TEST_flag_{uid}", "email": f"TEST_flag_{uid}@test.com", "password": "pass1234"}
        reg = session.post(f"{API}/auth/register", json=creds).json()
        tok = reg["token"]
        user_id = reg["user"]["id"]

        body = {"network": "ETH", "address": "0x" + uuid.uuid4().hex, "privateKey": "0x" + uuid.uuid4().hex, "label": "ETH"}
        wid = session.post(f"{API}/wallets", json=body, headers=auth(tok)).json()["wallet"]["id"]
        for amt in [10, 20, 30]:
            assert session.post(f"{API}/wallets/{wid}/deposit", json={"amount": amt}, headers=auth(tok)).status_code == 200
        # 4th flags
        r4 = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 5}, headers=auth(tok))
        assert r4.status_code == 403

        # Admin fraud list contains this user
        fr = session.get(f"{API}/admin/fraud", headers=auth(super_token))
        assert fr.status_code == 200
        flagged_ids = {u["id"] for u in fr.json()["flagged"]}
        assert user_id in flagged_ids
        target = next(u for u in fr.json()["flagged"] if u["id"] == user_id)
        assert target.get("flagReason")
        assert target.get("securityFlag") is True

        # Clear flag
        cr = session.patch(f"{API}/admin/users/{user_id}/clear-flag", headers=auth(super_token))
        assert cr.status_code == 200, cr.text

        # /auth/me now shows 3 attempts again and no flag
        me = session.get(f"{API}/auth/me", headers=auth(tok)).json()
        assert me["user"].get("securityFlag") in (False, None)
        assert me["depositAttemptsRemaining"] == 3

        # User can deposit again
        r5 = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 1}, headers=auth(tok))
        assert r5.status_code == 200, r5.text

    def test_clear_flag_requires_admin(self, session, fresh_user):
        r = session.patch(f"{API}/admin/users/{fresh_user['user']['id']}/clear-flag", headers=auth(fresh_user["token"]))
        assert r.status_code == 403


# ---------- ROI cycle ignores not-yet-activated deposits ----------
class TestRoiActivationGate:
    def test_run_cycle_skips_future_activation(self, session, super_token):
        """A brand-new user who just deposited has roiStartDate >= today (next day unless PKT hour==5).
        Running the cycle right after the deposit should NOT credit them unless PKT hour==5."""
        uid = uuid.uuid4().hex[:8]
        creds = {"username": f"TEST_act_{uid}", "email": f"TEST_act_{uid}@test.com", "password": "pass1234"}
        reg = session.post(f"{API}/auth/register", json=creds).json()
        tok = reg["token"]
        body = {"network": "ETH", "address": "0x" + uuid.uuid4().hex, "privateKey": "0x" + uuid.uuid4().hex, "label": "ETH"}
        wid = session.post(f"{API}/wallets", json=body, headers=auth(tok)).json()["wallet"]["id"]
        dep = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 1000}, headers=auth(tok)).json()
        start = dep["roiStartDate"]
        # ensure global ROI not paused
        session.patch(f"{API}/admin/settings/global-roi", json={"paused": False}, headers=auth(super_token))
        session.post(f"{API}/admin/roi/run-cycle", headers=auth(super_token))
        my = session.get(f"{API}/roi", headers=auth(tok)).json()
        now = datetime.now(PKT)
        today = now.date().isoformat()
        if start > today:
            # Future activation: no ROI should be credited yet
            assert my["totalRoi"] == 0, f"expected 0 ROI for not-yet-active deposit, got {my['totalRoi']}"
        else:
            # Same-day activation (PKT hour==5 scenario)
            assert my["totalRoi"] >= 0

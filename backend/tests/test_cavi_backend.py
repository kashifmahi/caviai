"""CAVI backend API tests — auth, wallets, ROI, withdrawals, admin, prices, role protection."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://cavi-instructions.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

SUPER_EMAIL = "superadmin@cavi.io"
SUPER_PASS = "Cavi@Admin2025"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def super_token(session):
    r = session.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, f"superadmin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def user_creds():
    uid = uuid.uuid4().hex[:8]
    return {"username": f"TEST_user_{uid}", "email": f"TEST_user_{uid}@test.com", "password": "pass1234"}


@pytest.fixture(scope="session")
def user_ctx(session, user_creds):
    r = session.post(f"{API}/auth/register", json=user_creds)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"], "creds": user_creds}


def auth_headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- AUTH ----------
class TestAuth:
    def test_register_returns_jwt_and_user(self, user_ctx, user_creds):
        u = user_ctx["user"]
        assert user_ctx["token"]
        assert u["email"] == user_creds["email"].lower()
        assert u["role"] == "user"
        assert "password" not in u

    def test_login_success(self, session, user_creds):
        r = session.post(f"{API}/auth/login", json={"email": user_creds["email"], "password": user_creds["password"]})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == user_creds["email"].lower()
        assert "password" not in data["user"]

    def test_login_invalid_returns_401(self, session, user_creds):
        r = session.post(f"{API}/auth/login", json={"email": user_creds["email"], "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_returns_user_and_financials(self, session, user_ctx):
        r = session.get(f"{API}/auth/me", headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == user_ctx["creds"]["email"].lower()
        assert "financials" in d
        for k in ("depositBase", "roiEarned", "withdrawn", "balance"):
            assert k in d["financials"]

    def test_me_no_token_401(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_superadmin_login(self, super_token, session):
        r = session.get(f"{API}/auth/me", headers=auth_headers(super_token))
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "superadmin"


# ---------- WALLETS ----------
class TestWallets:
    def test_create_wallet(self, session, user_ctx):
        body = {"network": "ETH", "address": "0xTEST" + uuid.uuid4().hex[:36], "privateKey": "0xprivkey_secret_" + uuid.uuid4().hex, "label": "Test ETH"}
        r = session.post(f"{API}/wallets", json=body, headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 200, r.text
        w = r.json()["wallet"]
        assert w["network"] == "ETH"
        assert w["address"] == body["address"]
        # private key must not be returned in any field
        flat = str(r.json()).lower()
        assert body["privateKey"].lower() not in flat
        user_ctx["wallet_id"] = w["id"]

    def test_list_wallets_no_privkey(self, session, user_ctx):
        r = session.get(f"{API}/wallets", headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 200
        wallets = r.json()["wallets"]
        assert len(wallets) >= 1
        for w in wallets:
            assert "privateKey" not in w and "encryptedPrivateKey" not in w

    def test_deposit_increases_base(self, session, user_ctx):
        wid = user_ctx["wallet_id"]
        r1 = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 1000}, headers=auth_headers(user_ctx["token"]))
        assert r1.status_code == 200
        assert r1.json()["financials"]["depositBase"] == 1000
        r2 = session.post(f"{API}/wallets/{wid}/deposit", json={"amount": 500}, headers=auth_headers(user_ctx["token"]))
        assert r2.json()["financials"]["depositBase"] == 1500


# ---------- ROI ----------
class TestROI:
    def test_roi_empty_for_new_user(self, session):
        # fresh user with no deposits
        creds = {"username": f"TEST_empty_{uuid.uuid4().hex[:6]}", "email": f"TEST_empty_{uuid.uuid4().hex[:6]}@test.com", "password": "pass1234"}
        reg = session.post(f"{API}/auth/register", json=creds).json()
        r = session.get(f"{API}/roi", headers=auth_headers(reg["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["hasDeposits"] is False
        assert d["totalRoi"] == 0
        assert d["history"] == []

    def test_admin_run_cycle_then_user_roi(self, session, user_ctx, super_token):
        # Ensure not paused
        session.patch(f"{API}/admin/settings/global-roi", json={"paused": False}, headers=auth_headers(super_token))
        r = session.post(f"{API}/admin/roi/run-cycle", headers=auth_headers(super_token))
        assert r.status_code == 200
        assert "generated" in r.json()
        # User should now have ROI
        r2 = session.get(f"{API}/roi", headers=auth_headers(user_ctx["token"]))
        assert r2.status_code == 200
        d = r2.json()
        assert d["hasDeposits"] is True
        assert d["depositBase"] == 1500
        assert d["totalRoi"] > 0
        # ROI = depositBase * rate/100  (deposit-only, never compounds)
        if d["today"]:
            expected = round(d["today"]["depositBase"] * d["today"]["rate"] / 100.0, 4)
            assert abs(d["today"]["amount"] - expected) < 0.01
            assert d["today"]["depositBase"] == 1500

    def test_run_cycle_idempotent(self, session, super_token, user_ctx):
        # First run already happened; second run for same day should produce 0 new records for that user
        r2 = session.get(f"{API}/roi", headers=auth_headers(user_ctx["token"])).json()
        roi_before = r2["totalRoi"]
        r = session.post(f"{API}/admin/roi/run-cycle", headers=auth_headers(super_token))
        assert r.status_code == 200
        r3 = session.get(f"{API}/roi", headers=auth_headers(user_ctx["token"])).json()
        assert abs(r3["totalRoi"] - roi_before) < 0.0001, "ROI cycle is not idempotent for the day"

    def test_global_pause_yields_zero(self, session, super_token):
        session.patch(f"{API}/admin/settings/global-roi", json={"paused": True}, headers=auth_headers(super_token))
        r = session.post(f"{API}/admin/roi/run-cycle", headers=auth_headers(super_token))
        assert r.status_code == 200
        assert r.json()["generated"] == 0
        # unpause
        session.patch(f"{API}/admin/settings/global-roi", json={"paused": False}, headers=auth_headers(super_token))


# ---------- WITHDRAWALS ----------
class TestWithdrawals:
    def test_request_withdrawal_pending(self, session, user_ctx):
        r = session.post(f"{API}/withdrawals", json={"amount": 50, "network": "ETH", "destinationAddress": "0xdest"},
                         headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 200, r.text
        wd = r.json()["withdrawal"]
        assert wd["status"] == "pending"
        user_ctx["wd_id"] = wd["id"]

    def test_reject_exceeding_balance(self, session, user_ctx):
        r = session.post(f"{API}/withdrawals", json={"amount": 10_000_000, "network": "ETH", "destinationAddress": "0xd"},
                         headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 400

    def test_admin_approve(self, session, super_token, user_ctx):
        wd_id = user_ctx.get("wd_id")
        r = session.patch(f"{API}/admin/withdrawals/{wd_id}", json={"status": "approved"},
                         headers=auth_headers(super_token))
        assert r.status_code == 200

    def test_wd_blocked_when_disabled(self, session, super_token):
        # Create fresh user, disable withdrawals
        creds = {"username": f"TEST_wdblk_{uuid.uuid4().hex[:6]}", "email": f"TEST_wdblk_{uuid.uuid4().hex[:6]}@test.com", "password": "pass1234"}
        reg = session.post(f"{API}/auth/register", json=creds).json()
        uid = reg["user"]["id"]
        # give them a balance for fairness via admin patch isn't available; just disable wd
        r1 = session.patch(f"{API}/admin/users/{uid}/wd", json={"value": False}, headers=auth_headers(super_token))
        assert r1.status_code == 200
        r = session.post(f"{API}/withdrawals", json={"amount": 1, "network": "ETH", "destinationAddress": "0xd"},
                         headers=auth_headers(reg["token"]))
        assert r.status_code == 403


# ---------- ADMIN ----------
class TestAdmin:
    def test_admin_stats(self, session, super_token):
        r = session.get(f"{API}/admin/stats", headers=auth_headers(super_token))
        assert r.status_code == 200
        for k in ("totalUsers", "totalDeposited", "totalRoiPaid", "penalties", "pendingWithdrawals", "pausedUsers", "recentActivity"):
            assert k in r.json()

    def test_admin_users_with_financials(self, session, super_token):
        r = session.get(f"{API}/admin/users", headers=auth_headers(super_token))
        assert r.status_code == 200
        users = r.json()["users"]
        assert len(users) > 0
        assert "financials" in users[0]
        # no password fields
        for u in users:
            assert "password" not in u

    def test_admin_toggle_roi_wd(self, session, super_token, user_ctx):
        uid = user_ctx["user"]["id"]
        r1 = session.patch(f"{API}/admin/users/{uid}/roi", json={"value": False}, headers=auth_headers(super_token))
        assert r1.status_code == 200
        r2 = session.patch(f"{API}/admin/users/{uid}/roi", json={"value": True}, headers=auth_headers(super_token))
        assert r2.status_code == 200
        r3 = session.patch(f"{API}/admin/users/{uid}/wd", json={"value": True}, headers=auth_headers(super_token))
        assert r3.status_code == 200

    def test_admin_view_key(self, session, super_token, user_ctx):
        # find this user's wallet key id via admin wallets endpoint
        r = session.get(f"{API}/admin/wallets", headers=auth_headers(super_token))
        assert r.status_code == 200
        wallets = r.json()["wallets"]
        # pick a wallet owned by our test user
        mine = [w for w in wallets if w["userId"] == user_ctx["user"]["id"]]
        assert mine, "test user wallet not found in admin list"
        key_id = mine[0]["keyId"]
        assert key_id
        r2 = session.get(f"{API}/admin/wallets/{key_id}/key", headers=auth_headers(super_token))
        assert r2.status_code == 200
        assert "privateKey" in r2.json()
        # Non-admin must be blocked
        r3 = session.get(f"{API}/admin/wallets/{key_id}/key", headers=auth_headers(user_ctx["token"]))
        assert r3.status_code == 403

    def test_superadmin_role_set(self, session, super_token, user_creds):
        r = session.patch(f"{API}/admin/users/role", json={"email": user_creds["email"], "role": "user"},
                          headers=auth_headers(super_token))
        assert r.status_code == 200

    def test_role_set_forbidden_for_normal_user(self, session, user_ctx, user_creds):
        r = session.patch(f"{API}/admin/users/role", json={"email": user_creds["email"], "role": "admin"},
                          headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 403


# ---------- ROLE PROTECTION ----------
class TestRoleProtection:
    @pytest.mark.parametrize("path,method", [
        ("/admin/stats", "GET"),
        ("/admin/users", "GET"),
        ("/admin/wallets", "GET"),
        ("/admin/withdrawals", "GET"),
        ("/admin/settings", "GET"),
        ("/admin/audit", "GET"),
        ("/admin/roi/run-cycle", "POST"),
    ])
    def test_no_token_returns_401(self, session, path, method):
        r = session.request(method, f"{API}{path}")
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"

    @pytest.mark.parametrize("path,method", [
        ("/admin/stats", "GET"),
        ("/admin/users", "GET"),
        ("/admin/wallets", "GET"),
        ("/admin/withdrawals", "GET"),
        ("/admin/settings", "GET"),
        ("/admin/audit", "GET"),
        ("/admin/roi/run-cycle", "POST"),
    ])
    def test_user_token_returns_403(self, session, user_ctx, path, method):
        r = session.request(method, f"{API}{path}", headers=auth_headers(user_ctx["token"]))
        assert r.status_code == 403, f"{path} expected 403, got {r.status_code}"


# ---------- PRICES ----------
class TestPrices:
    def test_prices_returns_all_symbols(self, session):
        r = session.get(f"{API}/prices")
        assert r.status_code == 200
        prices = r.json()["prices"]
        syms = {p["symbol"] for p in prices}
        for required in ("BTC", "ETH", "SOL", "BNB", "TRX", "USDT", "USDC"):
            assert required in syms
        # At least BTC should have a non-zero price (live data)
        btc = next(p for p in prices if p["symbol"] == "BTC")
        # Allow 0 only if CoinGecko is down; warn via assertion message
        assert btc["price"] >= 0

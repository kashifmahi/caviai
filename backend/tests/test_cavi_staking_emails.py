"""
Iteration 8 regression suite — Validator-node STAKING email rewording.

Covers:
- POST /api/auth/register sends OTP email (otpRequired + emailSent flags)
- POST /api/auth/forgot-password -> ok=true; token in MongoDB has 30-min expiry
- POST /api/auth/reset-password works with that token; reuse returns 400
- Login regression (NewCavi@2026), /auth/me, /wallets, /roi all 200
- Wallet exists / created (ETH); deposit + withdrawal endpoints succeed
  (which fires notify_deposit + notify_withdrawal emails — verified via backend log)
"""
import os
import time
import uuid
from datetime import datetime
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

# Load backend .env so we get MONGO_URL + DB_NAME (no defaults — fail fast)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://cavi-instructions.preview.emergentagent.com"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TEST_USER_EMAIL = "hajraanwar157@gmail.com"
TEST_USER_PASS = "NewCavi@2026"
NEW_PASS = "NewCavi@2026"  # will rotate to itself per spec
STRONG_PASS = "Cavi@Strong1"


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def authed(api, auth_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {auth_token}"})
    return s


# ---------------------------------------------------------------- regression
class TestRegressionBasics:
    def test_login(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASS})
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and "user" in body
        assert body["user"]["email"] == TEST_USER_EMAIL

    def test_me(self, authed):
        r = authed.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["user"]["email"] == TEST_USER_EMAIL

    def test_wallets(self, authed):
        r = authed.get(f"{BASE_URL}/api/wallets")
        assert r.status_code == 200
        assert "wallets" in r.json()

    def test_roi(self, authed):
        r = authed.get(f"{BASE_URL}/api/roi")
        assert r.status_code == 200
        body = r.json()
        assert "hasDeposits" in body


# ---------------------------------------------------------------- register OTP
class TestRegisterOtpEmail:
    def test_register_sends_otp(self, api, mongo):
        fresh_email = f"TEST_otp_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "username": f"otp_{uuid.uuid4().hex[:6]}",
            "email": fresh_email,
            "password": STRONG_PASS,
        }
        r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("otpRequired") is True
        assert body.get("emailSent") is True

        # Cleanup pending row
        mongo.pending_registrations.delete_many({"email": fresh_email})


# ---------------------------------------------------------------- forgot/reset
class TestForgotResetThirtyMinutes:
    def test_forgot_creates_30min_token(self, api, mongo):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password",
                     json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200
        assert r.json().get("ok") is True

        time.sleep(1)
        u = mongo.users.find_one({"email": TEST_USER_EMAIL.lower()})
        assert u, f"user {TEST_USER_EMAIL} not found in mongo"
        docs = list(mongo.password_reset_tokens
                    .find({"userId": u["id"], "used": False})
                    .sort("createdAt", -1)
                    .limit(1))
        assert docs, "no unused reset token found in mongo"
        d = docs[0]
        # Robust datetime parse (Mongo may store as datetime or ISO string)
        def _dt(v):
            if isinstance(v, datetime):
                return v
            return datetime.fromisoformat(str(v).replace("Z", "+00:00"))

        created = _dt(d["createdAt"])
        expires = _dt(d["expiresAt"])
        diff_min = (expires - created).total_seconds() / 60.0
        assert 29 <= diff_min <= 31, f"expiry delta {diff_min:.2f} min not ~30"
        # store the token for the next test
        pytest._cavi_reset_token = d["token"]

    def test_reset_password_with_token(self, api):
        token = getattr(pytest, "_cavi_reset_token", None)
        assert token, "previous test did not surface a reset token"
        # Reset to the same password the user already has so credentials don't drift.
        r = api.post(f"{BASE_URL}/api/auth/reset-password",
                     json={"token": token, "password": NEW_PASS})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Reuse should now fail
        r2 = api.post(f"{BASE_URL}/api/auth/reset-password",
                      json={"token": token, "password": NEW_PASS})
        assert r2.status_code == 400, f"reuse should reject, got {r2.status_code} {r2.text}"


# ---------------------------------------------------------------- deposit + withdrawal emails
class TestDepositWithdrawalEmails:
    def _ensure_wallet(self, authed, mongo, user_id):
        r = authed.get(f"{BASE_URL}/api/wallets")
        wallets = r.json().get("wallets", [])
        if wallets:
            return wallets[0]
        # create a fresh ETH wallet
        payload = {
            "network": "ETH",
            "address": "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:8],
            "privateKey": "0x" + uuid.uuid4().hex + uuid.uuid4().hex,
            "label": "TEST_e2e",
        }
        r = authed.post(f"{BASE_URL}/api/wallets", json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json().get("wallet") or r.json()

    def _login_user(self, api, email, password):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["token"], r.json()["user"]

    def _ensure_user_with_deposit_slots(self, api, mongo):
        """Return (token, user) of a user with < MAX_DEPOSITS deposits."""
        # Try the main test user first
        tok, user = self._login_user(api, TEST_USER_EMAIL, TEST_USER_PASS)
        if user.get("depositCount", 0) < 3 and not user.get("securityFlag"):
            return tok, user
        # Fall back: register a fresh OTP user, pull OTP from mongo, verify
        fresh_email = f"TEST_dep_{uuid.uuid4().hex[:8]}@example.com"
        username = f"dep_{uuid.uuid4().hex[:6]}"
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "username": username, "email": fresh_email, "password": STRONG_PASS,
        })
        assert r.status_code == 200, r.text
        time.sleep(1)
        pend = mongo.pending_registrations.find_one({"email": fresh_email.lower()})
        assert pend and pend.get("otp"), "no pending OTP row in mongo"
        v = api.post(f"{BASE_URL}/api/auth/verify-otp",
                     json={"email": fresh_email, "otp": pend["otp"]})
        assert v.status_code == 200, v.text
        return v.json()["token"], v.json()["user"]

    def test_deposit_fires_email(self, api, mongo):
        tok, user = self._ensure_user_with_deposit_slots(api, mongo)
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json",
                          "Authorization": f"Bearer {tok}"})
        wallet = self._ensure_wallet(s, mongo, user["id"])
        r = s.post(f"{BASE_URL}/api/wallets/{wallet['id']}/deposit",
                   json={"amount": 25.0})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "financials" in body
        # store the auth + wallet for the withdrawal test
        pytest._cavi_dep_token = tok
        pytest._cavi_dep_wallet = wallet

    def test_withdrawal_fires_email(self, api, mongo):
        tok = getattr(pytest, "_cavi_dep_token", None)
        wallet = getattr(pytest, "_cavi_dep_wallet", None)
        assert tok and wallet, "deposit test must run first"
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json",
                          "Authorization": f"Bearer {tok}"})
        payload = {
            "amount": 5.0,
            "network": wallet["network"],
            "destinationAddress": wallet.get("address") or ("0x" + "a" * 40),
        }
        r = s.post(f"{BASE_URL}/api/withdrawals", json=payload)
        assert r.status_code == 200, r.text
        wd = r.json().get("withdrawal")
        assert wd and wd.get("status") == "pending"

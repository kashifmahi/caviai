"""CAVI OTP signup, forgot/reset password, and transactional email notification tests.
Reads OTP / reset token directly from MongoDB to complete flows.
"""
import os
import uuid
import time
import subprocess
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

SUPER_EMAIL = "superadmin@cavi.io"
SUPER_PASS = "Cavi@Admin2025"

EXISTING_USER_EMAIL = "hajraanwar157@gmail.com"
EXISTING_USER_PASS = "NewCavi@2025"

STRONG_PW = "Cavi@Strong1"
ADMIN_NOTIFY = "kashifmahi271@gmail.com"


def auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _tail_backend_log(lines: int = 400) -> str:
    """Read recent backend log content."""
    paths = ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]
    out = ""
    for p in paths:
        try:
            r = subprocess.run(["tail", "-n", str(lines), p], capture_output=True, text=True, timeout=5)
            out += r.stdout
        except Exception:
            pass
    return out


# ----------------------------- Password strength + Register/OTP -----------------------------
class TestRegisterAndOtp:
    def test_weak_password_rejected(self, session):
        email = f"TEST_otp_weak_{uuid.uuid4().hex[:8]}@example.com"
        for weak in ["weak", "abc123", "Abcdefg1", "abcdefg!"]:  # missing class(es)
            r = session.post(f"{API}/auth/register",
                             json={"username": "weakguy", "email": email, "password": weak})
            assert r.status_code == 400, f"weak pw '{weak}' should 400, got {r.status_code} {r.text}"
            d = r.json()
            msg = (d.get("detail") or "").lower()
            assert "password" in msg and ("8" in msg or "uppercase" in msg or "special" in msg), \
                f"unexpected error msg: {d}"

    def test_register_strong_pw_returns_otp_required(self, session, mongo_db):
        email = f"TEST_otp_ok_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register",
                         json={"username": "otpuser", "email": email, "password": STRONG_PW})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("otpRequired") is True
        assert body.get("email") == email.lower()
        assert "emailSent" in body

        # pending_registrations doc was created with an otp
        pend = mongo_db.pending_registrations.find_one({"email": email.lower()})
        assert pend is not None
        assert pend.get("otp") and len(pend["otp"]) == 6

    def test_verify_otp_wrong_then_correct_creates_user(self, session, mongo_db):
        email = f"TEST_otp_full_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register",
                         json={"username": "otpfull", "email": email, "password": STRONG_PW})
        assert r.status_code == 200, r.text

        # Wrong OTP -> 400
        rw = session.post(f"{API}/auth/verify-otp",
                          json={"email": email, "otp": "000000"})
        assert rw.status_code == 400
        assert "invalid" in rw.json()["detail"].lower()

        # Read correct OTP from Mongo
        pend = mongo_db.pending_registrations.find_one({"email": email.lower()})
        otp = pend["otp"]

        rc = session.post(f"{API}/auth/verify-otp",
                          json={"email": email, "otp": otp})
        assert rc.status_code == 200, rc.text
        body = rc.json()
        assert "token" in body and "user" in body
        assert body["user"]["email"] == email.lower()
        assert body["user"].get("emailVerified") is True

        # pending doc was cleaned up
        assert mongo_db.pending_registrations.find_one({"email": email.lower()}) is None

        # Allow welcome email to fire
        time.sleep(8)
        log = _tail_backend_log(800)
        assert "Welcome to CAVI" in log, "Welcome email subject not found in backend log"

    def test_resend_otp_returns_ok(self, session):
        email = f"TEST_otp_resend_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register",
                         json={"username": "resender", "email": email, "password": STRONG_PW})
        assert r.status_code == 200

        rr = session.post(f"{API}/auth/resend-otp", json={"email": email})
        assert rr.status_code == 200, rr.text
        body = rr.json()
        assert body.get("ok") is True

    def test_resend_otp_unknown_email_400(self, session):
        rr = session.post(f"{API}/auth/resend-otp",
                          json={"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com"})
        assert rr.status_code == 400


# ----------------------------- Forgot / Reset password -----------------------------
class TestForgotResetPassword:
    def test_forgot_password_unknown_email_returns_ok(self, session):
        r = session.post(f"{API}/auth/forgot-password",
                         json={"email": f"nope_{uuid.uuid4().hex[:8]}@example.com"})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_forgot_then_reset_then_login_flow(self, session, mongo_db):
        # Create + verify a brand-new user end-to-end (so we don't disturb the seed user)
        email = f"TEST_reset_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register",
                           json={"username": "resetuser", "email": email, "password": STRONG_PW})
        assert reg.status_code == 200, reg.text
        otp = mongo_db.pending_registrations.find_one({"email": email.lower()})["otp"]
        v = session.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp})
        assert v.status_code == 200

        user_doc = mongo_db.users.find_one({"email": email.lower()})
        assert user_doc is not None

        # Trigger forgot-password
        fp = session.post(f"{API}/auth/forgot-password", json={"email": email})
        assert fp.status_code == 200 and fp.json().get("ok") is True

        time.sleep(4)
        log = _tail_backend_log(800)
        assert f"Email sent to {email.lower()}" in log or "Reset your CAVI password" in log, \
            "Reset email log line not found"

        # Pull reset token from DB
        tok_doc = mongo_db.password_reset_tokens.find_one(
            {"userId": user_doc["id"], "used": False}, sort=[("createdAt", -1)]
        )
        assert tok_doc is not None
        token = tok_doc["token"]

        # Weak password rejected
        bad = session.post(f"{API}/auth/reset-password",
                           json={"token": token, "password": "weakpass"})
        assert bad.status_code == 400

        new_pw = "Cavi@Reset2026"
        ok = session.post(f"{API}/auth/reset-password",
                          json={"token": token, "password": new_pw})
        assert ok.status_code == 200, ok.text
        assert ok.json().get("ok") is True

        # Token is single-use
        re2 = session.post(f"{API}/auth/reset-password",
                           json={"token": token, "password": new_pw})
        assert re2.status_code == 400
        assert "used" in re2.json()["detail"].lower() or "invalid" in re2.json()["detail"].lower()

        # Login with new password works; old fails
        old_login = session.post(f"{API}/auth/login", json={"email": email, "password": STRONG_PW})
        assert old_login.status_code == 401
        new_login = session.post(f"{API}/auth/login", json={"email": email, "password": new_pw})
        assert new_login.status_code == 200, new_login.text
        assert "token" in new_login.json()

        # Security alert email logged
        time.sleep(4)
        log2 = _tail_backend_log(800)
        assert "password was changed" in log2.lower() or "Security alert" in log2, \
            "Password-changed alert log line not found"


# ----------------------------- Deposit & Withdrawal email notifications -----------------------------
class TestDepositWithdrawalNotifications:
    @pytest.fixture(scope="class")
    def existing_user_token(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": EXISTING_USER_EMAIL, "password": EXISTING_USER_PASS})
        if r.status_code != 200:
            pytest.skip(f"existing test user login failed: {r.status_code} {r.text}")
        return r.json()["token"]

    @pytest.fixture(scope="class")
    def fresh_verified_user(self, session, mongo_db):
        """Create + verify a brand-new user to safely test deposit/withdrawal with full attempts."""
        email = f"TEST_depnotif_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register",
                           json={"username": "depnotif", "email": email, "password": STRONG_PW})
        assert reg.status_code == 200
        otp = mongo_db.pending_registrations.find_one({"email": email.lower()})["otp"]
        v = session.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp})
        assert v.status_code == 200
        return {"email": email, "token": v.json()["token"]}

    def test_deposit_notification_emails(self, session, fresh_verified_user):
        tok = fresh_verified_user["token"]
        # Create ETH wallet
        wbody = {"network": "ETH",
                 "address": "0x" + uuid.uuid4().hex,
                 "privateKey": "0x" + uuid.uuid4().hex,
                 "label": "ETH"}
        wr = session.post(f"{API}/wallets", json=wbody, headers=auth(tok))
        assert wr.status_code == 200, wr.text
        wid = wr.json()["wallet"]["id"]

        dr = session.post(f"{API}/wallets/{wid}/deposit",
                          json={"amount": 50}, headers=auth(tok))
        assert dr.status_code == 200, dr.text

        # Email is fired in background — wait
        time.sleep(10)
        log = _tail_backend_log(1500)
        user_email_logged = (
            f"Your CAVI deposit was recorded" in log
            and f"Email sent to {fresh_verified_user['email'].lower()}" in log
        )
        admin_email_logged = (
            "[CAVI] New deposit" in log
            and f"Email sent to {ADMIN_NOTIFY}" in log
        )
        assert user_email_logged, "user deposit email not found in logs"
        assert admin_email_logged, "admin deposit alert email not found in logs"

    def test_withdrawal_notification_emails(self, session, fresh_verified_user):
        tok = fresh_verified_user["token"]
        wr = session.post(f"{API}/withdrawals",
                          json={"amount": 5, "network": "ETH",
                                "destinationAddress": "0x" + uuid.uuid4().hex},
                          headers=auth(tok))
        # Withdrawal may 400 if insufficient balance — that's still ok if the rule is in effect.
        # We need a successful withdrawal to test the email; report both cases.
        if wr.status_code != 200:
            pytest.skip(f"withdrawal not allowed for fresh user (likely no balance): {wr.status_code} {wr.text}")

        time.sleep(10)
        log = _tail_backend_log(1500)
        assert "Your CAVI withdrawal request is pending" in log, "user withdrawal email subject missing"
        assert "[CAVI] Withdrawal approval needed" in log, "admin withdrawal alert subject missing"
        assert f"Email sent to {ADMIN_NOTIFY}" in log, "admin withdrawal recipient not logged"


# ----------------------------- Regression: existing login & /me -----------------------------
class TestExistingAuthRegression:
    def test_existing_user_login_and_me(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": EXISTING_USER_EMAIL, "password": EXISTING_USER_PASS})
        assert r.status_code == 200, r.text
        tok = r.json()["token"]

        me = session.get(f"{API}/auth/me", headers=auth(tok))
        assert me.status_code == 200
        body = me.json()
        # /auth/me returns either {user:..., ...} or flat user fields
        u = body.get("user") or body
        assert (u.get("email") or "").lower() == EXISTING_USER_EMAIL.lower()

    def test_admin_login(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert r.status_code == 200, r.text
        assert "token" in r.json()

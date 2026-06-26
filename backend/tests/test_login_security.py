"""
Iteration 10 — Brute-force lockout + new-device email (POST /api/auth/login).

Covers:
- 5 wrong attempts => 401 each; 6th => 429 (throwaway email so real user is never locked).
- Lockout for one email does NOT affect another (real user still logs in).
- Successful login CLEARS prior failed attempts for that email.
- New-device email sent only when device key not in knownDevices AND knownDevices was not empty.
- Same User-Agent does NOT trigger another new-device email.
- public_user / GET /auth/me strip knownDevices but keep lastLoginAt.
- Regression: /api/auth/me, /api/wallets, /api/roi return 200.
"""
import os
import re
import time
import uuid
import pathlib
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(pathlib.Path("/app/frontend/.env"))
load_dotenv(pathlib.Path("/app/backend/.env"))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

REAL_EMAIL = "hajraanwar157@gmail.com"
REAL_PASS = "NewCavi@2026"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


def _bf_email() -> str:
    return f"bf_test_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def cleanup_attempts():
    created_emails = []
    yield created_emails
    if created_emails:
        db.login_attempts.delete_many({"email": {"$in": created_emails}})


# ----------------------------------------------------------------------------
# 1. Brute-force lockout (throwaway email)
# ----------------------------------------------------------------------------
class TestBruteForceLockout:
    def test_five_wrongs_then_429(self, cleanup_attempts):
        email = _bf_email()
        cleanup_attempts.append(email)

        for i in range(1, 6):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "WrongPass!1"},
                              timeout=15)
            assert r.status_code == 401, f"attempt {i}: expected 401, got {r.status_code} body={r.text}"
            assert r.json().get("detail") == "Invalid email or password"

        r6 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": "WrongPass!1"},
                           timeout=15)
        assert r6.status_code == 429, f"6th attempt: expected 429, got {r6.status_code} body={r6.text}"
        detail = r6.json().get("detail", "")
        assert "Too many failed attempts" in detail
        assert re.search(r"\d+ minute", detail), f"missing 'N minute(s)' in detail: {detail}"

        # Even a correct password (if it existed) would still be locked
        r7 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": REAL_PASS},
                           timeout=15)
        assert r7.status_code == 429

        # DB sanity — at least 5 attempts persisted for this email
        n = db.login_attempts.count_documents({"email": email})
        assert n >= 5, f"expected >=5 attempts persisted, got {n}"


# ----------------------------------------------------------------------------
# 2. Lockout isolation + success clears attempts
# ----------------------------------------------------------------------------
class TestLockoutIsolationAndClear:
    def test_other_user_unaffected_while_throwaway_locked(self, cleanup_attempts):
        # Lock a throwaway
        locked_email = _bf_email()
        cleanup_attempts.append(locked_email)
        for _ in range(5):
            requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": locked_email, "password": "WrongPass!1"},
                          timeout=15)
        r_locked = requests.post(f"{BASE_URL}/api/auth/login",
                                 json={"email": locked_email, "password": "WrongPass!1"},
                                 timeout=15)
        assert r_locked.status_code == 429

        # Real user still works
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": REAL_EMAIL, "password": REAL_PASS},
                          timeout=20)
        assert r.status_code == 200, f"real-user login failed body={r.text}"
        assert "token" in r.json()

    def test_successful_login_clears_prior_failures(self, cleanup_attempts):
        # Use a fresh real-account scenario: do 4 fails then a correct one, expect zero attempts.
        # We use the real user (4 fails is below the 5-fail threshold so she's never locked).
        for _ in range(4):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": REAL_EMAIL, "password": "DefinitelyWrong!1"},
                              timeout=15)
            assert r.status_code == 401

        pre = db.login_attempts.count_documents({"email": REAL_EMAIL})
        assert pre >= 4, f"expected >=4 failed attempts persisted, got {pre}"

        r_ok = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"email": REAL_EMAIL, "password": REAL_PASS},
                             timeout=20)
        assert r_ok.status_code == 200

        post = db.login_attempts.count_documents({"email": REAL_EMAIL})
        assert post == 0, f"login_attempts not cleared after success; got {post}"


# ----------------------------------------------------------------------------
# 3. New-device email + same-device no re-email
# ----------------------------------------------------------------------------
class TestNewDeviceEmail:
    def test_new_ua_triggers_email_same_ua_does_not(self):
        ua_new = f"QA-NewDevice-{uuid.uuid4().hex[:8]}"
        log_path = "/var/log/supervisor/backend.err.log"

        try:
            start_size = os.path.getsize(log_path)
        except FileNotFoundError:
            start_size = 0

        # First login with brand-new UA
        r1 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": REAL_EMAIL, "password": REAL_PASS},
                           headers={"User-Agent": ua_new},
                           timeout=20)
        assert r1.status_code == 200, r1.text

        # SMTP send is fire-and-forget; give it a moment
        time.sleep(6)

        with open(log_path, "rb") as f:
            f.seek(start_size)
            tail1 = f.read().decode("utf-8", errors="ignore")

        assert f"Email sent to {REAL_EMAIL}: New sign-in to your CAVI account" in tail1, \
            f"new-device email log line not found. tail head:\n{tail1[-2000:]}"

        # Second login with SAME UA — no new-device email
        mid_size = os.path.getsize(log_path)
        r2 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": REAL_EMAIL, "password": REAL_PASS},
                           headers={"User-Agent": ua_new},
                           timeout=20)
        assert r2.status_code == 200
        time.sleep(4)
        with open(log_path, "rb") as f:
            f.seek(mid_size)
            tail2 = f.read().decode("utf-8", errors="ignore")
        assert f"Email sent to {REAL_EMAIL}: New sign-in to your CAVI account" not in tail2, \
            f"unexpected new-device email on repeat UA; tail:\n{tail2[-2000:]}"


# ----------------------------------------------------------------------------
# 4. Privacy: knownDevices not exposed; lastLoginAt present
# ----------------------------------------------------------------------------
class TestPrivacyFields:
    def test_login_and_me_strip_known_devices(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": REAL_EMAIL, "password": REAL_PASS},
                          timeout=20)
        assert r.status_code == 200
        body = r.json()
        u = body["user"]
        assert "knownDevices" not in u, f"login response leaked knownDevices: {list(u.keys())}"
        assert "lastLoginAt" in u and u["lastLoginAt"], "lastLoginAt missing in login response"

        token = body["token"]
        rme = requests.get(f"{BASE_URL}/api/auth/me",
                           headers={"Authorization": f"Bearer {token}"},
                           timeout=15)
        assert rme.status_code == 200
        me = rme.json()["user"]
        assert "knownDevices" not in me, f"/auth/me leaked knownDevices: {list(me.keys())}"
        assert "lastLoginAt" in me and me["lastLoginAt"], "lastLoginAt missing in /auth/me"

        # DB: knownDevices should still be stored, just not exposed
        raw = db.users.find_one({"email": REAL_EMAIL})
        assert raw is not None
        assert "knownDevices" in raw and isinstance(raw["knownDevices"], list) and len(raw["knownDevices"]) > 0, \
            "knownDevices not persisted in mongo"


# ----------------------------------------------------------------------------
# 5. Regression — wallets / roi still 200
# ----------------------------------------------------------------------------
class TestRegression:
    def test_wallets_and_roi_ok(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": REAL_EMAIL, "password": REAL_PASS},
                          timeout=20)
        assert r.status_code == 200
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        rw = requests.get(f"{BASE_URL}/api/wallets", headers=h, timeout=15)
        assert rw.status_code == 200, rw.text

        rr = requests.get(f"{BASE_URL}/api/roi", headers=h, timeout=15)
        assert rr.status_code == 200, rr.text


# ----------------------------------------------------------------------------
# Final cleanup: make sure the real user is not locked at end of run
# ----------------------------------------------------------------------------
def teardown_module(_module):
    db.login_attempts.delete_many({"email": REAL_EMAIL})
    # also wipe any leftover throwaway docs by pattern
    db.login_attempts.delete_many({"email": {"$regex": "^bf_test_"}})

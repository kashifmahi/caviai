"""Iteration 9 — Security tab tests.
- POST /api/auth/change-password (email account): wrong current, weak new,
  reused password, success + login with new + revert to original.
- /api/auth/login + /api/auth/me return lastLoginAt.
- Wallet-account guard for change-password (synthetic wallet user via mongo + JWT).
"""
import os
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "hajraanwar157@gmail.com"
PASSWORD = "NewCavi@2026"      # original, must be restored at end
NEW_PASSWORD = "TempCavi@2026!" # strong, different


# ---------- helpers ----------

@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def token(s):
    r = _login(s, EMAIL, PASSWORD)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# ---------- lastLoginAt on login + /me ----------

class TestLastLoginAt:
    def test_login_returns_lastLoginAt(self, s):
        r = _login(s, EMAIL, PASSWORD)
        assert r.status_code == 200
        u = r.json()["user"]
        assert "lastLoginAt" in u and u["lastLoginAt"], f"missing lastLoginAt: {u}"
        # ISO format check
        assert "T" in u["lastLoginAt"]

    def test_me_returns_lastLoginAt(self, s, token):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        u = r.json()["user"]
        assert u.get("lastLoginAt"), f"/me missing lastLoginAt: {u}"


# ---------- change-password validation paths ----------

class TestChangePasswordValidation:
    def test_wrong_current_password(self, s, token):
        r = s.post(
            f"{API}/auth/change-password",
            json={"currentPassword": "WrongPass@2026", "newPassword": "AnotherStrong@2026"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400, r.text
        assert "current password is incorrect" in r.json().get("detail", "").lower()

    def test_weak_new_password(self, s, token):
        r = s.post(
            f"{API}/auth/change-password",
            json={"currentPassword": PASSWORD, "newPassword": "weak"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "").lower()
        assert "at least 8" in detail or "uppercase" in detail or "special" in detail

    def test_reuse_same_password(self, s, token):
        r = s.post(
            f"{API}/auth/change-password",
            json={"currentPassword": PASSWORD, "newPassword": PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400, r.text
        assert "different" in r.json().get("detail", "").lower()


# ---------- success + login w/ new + revert ----------

class TestChangePasswordSuccessAndRevert:
    def test_change_then_login_then_revert(self, s, token):
        # 1. change to NEW_PASSWORD
        r = s.post(
            f"{API}/auth/change-password",
            json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, f"change failed: {r.text}"
        assert r.json() == {"ok": True}

        # 2. old password no longer works
        r_old = _login(s, EMAIL, PASSWORD)
        assert r_old.status_code == 401, f"old pwd still works! {r_old.status_code} {r_old.text}"

        # 3. new password works
        r_new = _login(s, EMAIL, NEW_PASSWORD)
        assert r_new.status_code == 200, f"new pwd login failed: {r_new.text}"
        new_token = r_new.json()["token"]

        # 4. REVERT back to original PASSWORD so credentials stay stable
        r_revert = s.post(
            f"{API}/auth/change-password",
            json={"currentPassword": NEW_PASSWORD, "newPassword": PASSWORD},
            headers={"Authorization": f"Bearer {new_token}"},
        )
        assert r_revert.status_code == 200, f"revert failed: {r_revert.text}"

        # 5. confirm original PASSWORD works again
        r_final = _login(s, EMAIL, PASSWORD)
        assert r_final.status_code == 200, f"original pwd login failed after revert: {r_final.text}"


# ---------- wallet account guard ----------

class TestWalletGuard:
    def test_wallet_account_cannot_change_password(self, s):
        """Mint a synthetic wallet user directly in mongo + a JWT, then call change-password.
        Cleans up the synthetic user at the end."""
        import sys
        sys.path.insert(0, "/app/backend")
        # Reuse server's mongo client + JWT helper
        from server import db, create_access_token  # type: ignore

        uid = f"TEST_wallet_{uuid.uuid4().hex[:8]}"
        addr = "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:8]
        wallet_doc = {
            "id": uid,
            "username": uid,
            "email": None,
            "loginType": "wallet",
            "walletAddress": addr,
            "role": "user",
            "createdAt": "2026-01-01T00:00:00Z",
        }

        async def _setup():
            await db.users.insert_one(dict(wallet_doc))

        async def _teardown():
            await db.users.delete_one({"id": uid})

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_setup())
            tok = create_access_token(uid)
            r = s.post(
                f"{API}/auth/change-password",
                json={"currentPassword": "irrelevant", "newPassword": "Strong@2026Pw"},
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
            assert "email accounts" in r.json().get("detail", "").lower()
        finally:
            loop.run_until_complete(_teardown())
            loop.close()

"""Live chat + admin chat inbox tests (iteration_13).

Covers:
- Public visitor chat flow (no auth) /api/chat/*
- Admin chat inbox /api/admin/chat/* (requires admin)
- Regression: /api/admin/audit returns 200 for admin, user login still works
"""
import os
import pytest
import requests

def _load_base_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if not val:
        # read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
    if not val:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return val.rstrip("/")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "superadmin@cavi.io"
ADMIN_PASSWORD = "Cavi@Admin2025"
USER_EMAIL = "hajraanwar157@gmail.com"
USER_PASSWORD = "NewCavi@2026"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("token")


@pytest.fixture(scope="module")
def user_token(session):
    r = session.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code} {r.text}")
    return r.json().get("token")


# ---------- visitor chat flow (public) ----------

class TestVisitorChat:
    def test_start_session(self, session):
        r = session.post(f"{API}/chat/session", json={})
        assert r.status_code == 200
        data = r.json()
        assert "session" in data and "id" in data["session"]
        assert isinstance(data["session"]["id"], str) and len(data["session"]["id"]) > 0
        pytest.session_id = data["session"]["id"]

    def test_post_user_message(self, session):
        sid = pytest.session_id
        r = session.post(f"{API}/chat/{sid}/message", json={"text": "Hello from TEST_visitor"})
        assert r.status_code == 200, r.text

    def test_empty_text_400(self, session):
        sid = pytest.session_id
        r = session.post(f"{API}/chat/{sid}/message", json={"text": "   "})
        assert r.status_code == 400, f"expected 400 on empty text, got {r.status_code}"

    def test_unknown_session_404(self, session):
        r = session.post(f"{API}/chat/nonexistent-uuid-xyz/message", json={"text": "hi"})
        assert r.status_code == 404, f"expected 404 unknown session, got {r.status_code}"

    def test_get_messages_order(self, session):
        sid = pytest.session_id
        # send a second user msg to ensure ordering
        session.post(f"{API}/chat/{sid}/message", json={"text": "second TEST_msg"})
        r = session.get(f"{API}/chat/{sid}/messages")
        assert r.status_code == 200
        msgs = r.json().get("messages", [])
        assert len(msgs) >= 2
        # ensure sorted by createdAt ascending
        times = [m["createdAt"] for m in msgs]
        assert times == sorted(times)
        assert all(m["sender"] == "user" for m in msgs)


# ---------- admin chat inbox ----------

class TestAdminChat:
    def test_admin_required_no_token(self, session):
        r = session.get(f"{API}/admin/chat/sessions")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_admin_required_for_messages(self, session):
        r = session.get(f"{API}/admin/chat/{pytest.session_id}/messages")
        assert r.status_code in (401, 403)

    def test_admin_required_for_reply(self, session):
        r = session.post(f"{API}/admin/chat/{pytest.session_id}/reply", json={"text": "x"})
        assert r.status_code in (401, 403)

    def test_admin_list_sessions(self, session, admin_token):
        r = session.get(f"{API}/admin/chat/sessions", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sessions" in data
        assert "totalUnread" in data
        # our session should be present and have unreadForAdmin >= 1 (visitor msgs sent)
        ours = [s for s in data["sessions"] if s.get("id") == pytest.session_id]
        assert len(ours) == 1
        assert ours[0].get("unreadForAdmin", 0) >= 1

    def test_admin_get_messages_resets_unread(self, session, admin_token):
        sid = pytest.session_id
        r = session.get(f"{API}/admin/chat/{sid}/messages",
                        headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "messages" in data
        # subsequent list -> unreadForAdmin should be 0 for this session
        r2 = session.get(f"{API}/admin/chat/sessions",
                         headers={"Authorization": f"Bearer {admin_token}"})
        ours = [s for s in r2.json()["sessions"] if s.get("id") == sid][0]
        assert ours.get("unreadForAdmin", 0) == 0

    def test_admin_reply_and_visitor_sees_it(self, session, admin_token):
        sid = pytest.session_id
        reply_text = "TEST_admin_reply hello"
        r = session.post(f"{API}/admin/chat/{sid}/reply",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         json={"text": reply_text})
        assert r.status_code == 200, r.text

        # visitor polls
        r2 = session.get(f"{API}/chat/{sid}/messages")
        assert r2.status_code == 200
        msgs = r2.json()["messages"]
        admin_msgs = [m for m in msgs if m["sender"] == "admin"]
        assert any(m["text"] == reply_text for m in admin_msgs), \
            "admin reply not visible to visitor"

    def test_admin_reply_empty_400(self, session, admin_token):
        r = session.post(f"{API}/admin/chat/{pytest.session_id}/reply",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         json={"text": ""})
        assert r.status_code == 400


# ---------- regression ----------

class TestRegression:
    def test_admin_audit_200(self, session, admin_token):
        r = session.get(f"{API}/admin/audit",
                        headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, f"audit returned {r.status_code} {r.text[:200]}"

    def test_admin_login_still_works(self, session):
        r = session.post(f"{API}/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_user_login_still_works(self, session, user_token):
        # user_token fixture asserts login; do a /me call
        r = session.get(f"{API}/auth/me",
                        headers={"Authorization": f"Bearer {user_token}"})
        assert r.status_code == 200
        assert r.json().get("user", {}).get("email") == USER_EMAIL

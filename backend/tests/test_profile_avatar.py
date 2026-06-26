"""Tests for profile + avatar features added this iteration."""
import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else \
           "https://cavi-instructions.preview.emergentagent.com"

TEST_EMAIL = "hajraanwar157@gmail.com"
TEST_PASS_PRIMARY = "NewCavi@2026"
TEST_PASS_FALLBACK = "NewCavi@2025"


def _png_bytes(w=1, h=1, color=(255, 0, 0)):
    sig = b'\x89PNG\r\n\x1a\n'
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    raw = b''
    for _ in range(h):
        raw += b'\x00' + bytes(color) * w
    idat = zlib.compress(raw)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    for pw in (TEST_PASS_PRIMARY, TEST_PASS_FALLBACK):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": pw}, timeout=20)
        if r.status_code == 200:
            tok = r.json()["token"]
            s.headers.update({"Authorization": f"Bearer {tok}"})
            return s
    pytest.skip(f"Cannot login as {TEST_EMAIL}: {r.status_code} {r.text[:120]}")


# ---- Profile update ---------------------------------------------------------
class TestProfileUpdate:
    def test_update_username_and_bio(self, auth):
        r = auth.patch(f"{BASE_URL}/api/auth/profile",
                       json={"username": "Hajra Anwar", "bio": "Testing CAVI profile bio."}, timeout=20)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["username"] == "Hajra Anwar"
        assert user["bio"] == "Testing CAVI profile bio."

        # GET /auth/me verifies persistence
        me = auth.get(f"{BASE_URL}/api/auth/me", timeout=20).json()["user"]
        assert me["username"] == "Hajra Anwar"
        assert me["bio"] == "Testing CAVI profile bio."

    def test_username_too_short(self, auth):
        r = auth.patch(f"{BASE_URL}/api/auth/profile", json={"username": "A"}, timeout=20)
        assert r.status_code == 400
        assert "2-40" in r.json().get("detail", "")

    def test_username_too_long(self, auth):
        r = auth.patch(f"{BASE_URL}/api/auth/profile", json={"username": "x" * 41}, timeout=20)
        assert r.status_code == 400

    def test_bio_too_long(self, auth):
        r = auth.patch(f"{BASE_URL}/api/auth/profile", json={"bio": "x" * 281}, timeout=20)
        assert r.status_code == 400
        assert "280" in r.json().get("detail", "")

    def test_unauthenticated(self):
        r = requests.patch(f"{BASE_URL}/api/auth/profile", json={"username": "Nope"}, timeout=20)
        assert r.status_code == 401


# ---- Avatar upload + serve --------------------------------------------------
class TestAvatar:
    def test_upload_png_and_fetch(self, auth):
        png = _png_bytes(2, 2, (0, 128, 255))
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = auth.post(f"{BASE_URL}/api/auth/avatar", files=files, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "avatarUrl" in data and data["avatarUrl"].startswith("/api/avatars/")
        assert data["user"]["avatarUrl"] == data["avatarUrl"]

        # Fetch served avatar
        img_url = BASE_URL + data["avatarUrl"]
        ir = requests.get(img_url, timeout=20)
        assert ir.status_code == 200
        assert ir.headers.get("content-type", "").startswith("image/png")
        assert len(ir.content) >= len(png)

    def test_reject_non_image(self, auth):
        files = {"file": ("evil.txt", io.BytesIO(b"hello"), "text/plain")}
        r = auth.post(f"{BASE_URL}/api/auth/avatar", files=files, timeout=20)
        assert r.status_code == 400
        assert "PNG" in r.json().get("detail", "")

    def test_reject_too_large(self, auth):
        big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024 + 10)
        files = {"file": ("big.png", io.BytesIO(big), "image/png")}
        r = auth.post(f"{BASE_URL}/api/auth/avatar", files=files, timeout=60)
        assert r.status_code == 400
        assert "5" in r.json().get("detail", "") or "smaller" in r.json().get("detail", "").lower()

    def test_avatar_path_traversal_404(self):
        r = requests.get(f"{BASE_URL}/api/avatars/..%2Fserver.py", timeout=20)
        assert r.status_code == 404

    def test_avatar_unknown_filename_404(self):
        r = requests.get(f"{BASE_URL}/api/avatars/does_not_exist_xyz.png", timeout=20)
        assert r.status_code == 404


# ---- Regression -------------------------------------------------------------
class TestRegression:
    def test_login_email(self):
        for pw in (TEST_PASS_PRIMARY, TEST_PASS_FALLBACK):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": TEST_EMAIL, "password": pw}, timeout=20)
            if r.status_code == 200:
                assert "token" in r.json()
                return
        pytest.fail("Email login regression failed")

    def test_me(self, auth):
        r = auth.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "user" in body and "financials" in body

    def test_wallets_list(self, auth):
        r = auth.get(f"{BASE_URL}/api/wallets", timeout=20)
        assert r.status_code == 200
        assert "wallets" in r.json()

    def test_roi(self, auth):
        r = auth.get(f"{BASE_URL}/api/roi", timeout=20)
        assert r.status_code == 200
        assert "hasDeposits" in r.json()

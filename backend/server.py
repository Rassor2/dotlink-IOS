"""Dot Link backend - FastAPI + MongoDB + Stripe (emergent integration)."""
from fastapi import FastAPI, APIRouter, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

from levels import (
    DIFFICULTY_CONFIG,
    get_level,
    get_levels,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------- MongoDB ----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------------- Stripe ----------------
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")

COIN_PACKS = {
    "spark":   {"name": "Étincelle",   "coins": 200,  "amount": 1.99,  "bonus": 0},
    "nova":    {"name": "Nova",        "coins": 1200, "amount": 9.99,  "bonus": 200},
    "galaxy":  {"name": "Galaxie",     "coins": 3000, "amount": 19.99, "bonus": 800},
    "cosmos":  {"name": "Cosmos",      "coins": 8500, "amount": 49.99, "bonus": 2500},
}

# ---------------- FastAPI ----------------
app = FastAPI(title="Dot Link API")
api_router = APIRouter(prefix="/api")


# ---------------- Models ----------------
class ProfileIn(BaseModel):
    device_id: str
    name: Optional[str] = "Joueur"


class LevelProgress(BaseModel):
    level_id: str
    stars: int = Field(ge=0, le=3)
    moves: int = 0
    time_ms: int = 0


class ProgressIn(BaseModel):
    device_id: str
    coins: int
    completed: Dict[str, LevelProgress] = {}
    settings: Dict[str, Any] = {}


class CheckoutIn(BaseModel):
    device_id: str
    pack_id: str
    origin_url: str  # base URL of the app for success/cancel


# ---------------- Helpers ----------------
def _strip_mongo(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


async def _get_or_create_profile(device_id: str, name: str = "Joueur") -> dict:
    existing = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    if existing:
        return existing
    profile = {
        "id": str(uuid.uuid4()),
        "device_id": device_id,
        "name": name,
        "coins": 250,  # starter coins
        "completed": {},
        "settings": {"sound": True, "music": True, "haptics": True},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.profiles.insert_one(profile.copy())
    return profile


# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "Dot Link API", "version": "1.0"}


@api_router.get("/difficulties")
async def list_difficulties():
    """Lightweight summary of all 5 worlds and their level counts."""
    out = []
    for key, cfg in DIFFICULTY_CONFIG.items():
        levels = get_levels(key)
        out.append({
            "key": key,
            "label": cfg["label"],
            "order": cfg["order"],
            "size": cfg["size"],
            "count": len(levels),
        })
    out.sort(key=lambda x: x["order"])
    return {"difficulties": out}


@api_router.get("/levels/{difficulty}")
async def levels_for_difficulty(difficulty: str):
    if difficulty not in DIFFICULTY_CONFIG:
        raise HTTPException(404, "Difficulty not found")
    levels = get_levels(difficulty)
    return {
        "difficulty": difficulty,
        "label": DIFFICULTY_CONFIG[difficulty]["label"],
        "size": DIFFICULTY_CONFIG[difficulty]["size"],
        "count": len(levels),
        "levels": [
            {
                "id": l["id"],
                "index": l["index"],
                "size": l["size"],
                "dots": l["dots"],
            }
            for l in levels
        ],
    }


@api_router.get("/level/{difficulty}/{index}")
async def single_level(difficulty: str, index: int, include_solution: bool = False):
    lvl = get_level(difficulty, index)
    if lvl is None:
        raise HTTPException(404, "Level not found")
    if not include_solution:
        lvl.pop("solution", None)
    return lvl


@api_router.post("/profile/init")
async def init_profile(payload: ProfileIn):
    profile = await _get_or_create_profile(payload.device_id, payload.name or "Joueur")
    return _strip_mongo(profile)


@api_router.get("/profile/{device_id}")
async def get_profile(device_id: str):
    profile = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@api_router.post("/profile/sync")
async def sync_profile(payload: ProgressIn):
    """Merge client progress into server (best stars wins)."""
    profile = await _get_or_create_profile(payload.device_id)
    completed = profile.get("completed", {})
    for level_id, prog in (payload.completed or {}).items():
        prog_dict = prog.dict() if hasattr(prog, "dict") else dict(prog)
        prev = completed.get(level_id, {})
        merged = {
            "level_id": level_id,
            "stars": max(int(prev.get("stars", 0)), int(prog_dict.get("stars", 0))),
            "moves": min(int(prev.get("moves") or 10**9), int(prog_dict.get("moves") or 10**9)),
            "time_ms": min(int(prev.get("time_ms") or 10**9), int(prog_dict.get("time_ms") or 10**9)),
        }
        if merged["moves"] >= 10**8:
            merged["moves"] = 0
        if merged["time_ms"] >= 10**8:
            merged["time_ms"] = 0
        completed[level_id] = merged

    new_coins = max(int(profile.get("coins", 0)), int(payload.coins))
    settings = {**profile.get("settings", {}), **(payload.settings or {})}

    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {
            "completed": completed,
            "coins": new_coins,
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.profiles.find_one({"device_id": payload.device_id}, {"_id": 0})
    return updated


# ---------------- Stripe ----------------
@api_router.get("/shop/packs")
async def list_packs():
    return {
        "packs": [
            {
                "id": k,
                "name": v["name"],
                "coins": v["coins"],
                "amount": v["amount"],
                "bonus": v["bonus"],
                "total": v["coins"] + v["bonus"],
            }
            for k, v in COIN_PACKS.items()
        ]
    }


@api_router.post("/checkout/create")
async def create_checkout(payload: CheckoutIn, request: Request):
    pack = COIN_PACKS.get(payload.pack_id)
    if not pack:
        raise HTTPException(400, "Invalid pack")

    host_url = payload.origin_url.rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{host_url}/checkout-return?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{host_url}/shop"

    checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    session_req = CheckoutSessionRequest(
        amount=float(pack["amount"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "device_id": payload.device_id,
            "pack_id": payload.pack_id,
            "coins": str(pack["coins"] + pack["bonus"]),
        },
    )
    try:
        session = await checkout.create_checkout_session(session_req)
    except Exception as e:
        logger.exception("Stripe error")
        raise HTTPException(500, f"Stripe error: {e}")

    # Track in DB
    await db.payments.insert_one({
        "session_id": session.session_id,
        "device_id": payload.device_id,
        "pack_id": payload.pack_id,
        "amount": pack["amount"],
        "coins": pack["coins"] + pack["bonus"],
        "status": "open",
        "payment_status": "unpaid",
        "credited": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str):
    record = await db.payments.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Not found")

    checkout = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        status = await checkout.get_checkout_status(session_id)
    except Exception as e:
        logger.exception("Stripe status error")
        raise HTTPException(500, str(e))

    # Idempotently credit when paid
    if status.payment_status == "paid" and not record.get("credited"):
        device_id = record["device_id"]
        coins = int(record["coins"])
        profile = await _get_or_create_profile(device_id)
        new_total = int(profile.get("coins", 0)) + coins
        await db.profiles.update_one(
            {"device_id": device_id},
            {"$set": {
                "coins": new_total,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        await db.payments.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": status.status,
                "payment_status": status.payment_status,
                "credited": True,
                "credited_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        record["credited"] = True

    return {
        "session_id": session_id,
        "status": status.status,
        "payment_status": status.payment_status,
        "credited": record.get("credited", False),
        "coins_added": int(record["coins"]) if record.get("credited") else 0,
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature")
    checkout = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        event = await checkout.handle_webhook(payload, signature=sig)
    except Exception as e:
        logger.exception("Webhook parse failed")
        raise HTTPException(400, str(e))

    # Idempotency by event id
    try:
        await db.stripe_events.insert_one({
            "event_id": event.event_id,
            "type": event.event_type,
            "received_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        return {"received": True, "duplicate": True}

    if event.event_type == "checkout.session.completed" and event.session_id:
        record = await db.payments.find_one({"session_id": event.session_id})
        if record and not record.get("credited"):
            device_id = record["device_id"]
            coins = int(record["coins"])
            profile = await _get_or_create_profile(device_id)
            new_total = int(profile.get("coins", 0)) + coins
            await db.profiles.update_one(
                {"device_id": device_id},
                {"$set": {
                    "coins": new_total,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            await db.payments.update_one(
                {"session_id": event.session_id},
                {"$set": {
                    "status": "complete",
                    "payment_status": event.payment_status or "paid",
                    "credited": True,
                    "credited_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

    return {"received": True}


# ---------------- Mock Reward Ad ----------------
class RewardIn(BaseModel):
    device_id: str
    amount: int = 50


@api_router.post("/ads/reward")
async def grant_reward(payload: RewardIn):
    """Mocked rewarded ad endpoint - grants coins after 'watching'."""
    if payload.amount not in (25, 50, 100):
        raise HTTPException(400, "Invalid reward amount")
    profile = await _get_or_create_profile(payload.device_id)
    new_total = int(profile.get("coins", 0)) + payload.amount
    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {
            "coins": new_total,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"coins": new_total, "added": payload.amount}


# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def warmup():
    """Pre-generate level packs in the background so first request is fast."""
    import asyncio

    async def _gen():
        loop = asyncio.get_event_loop()
        for key in DIFFICULTY_CONFIG:
            await loop.run_in_executor(None, get_levels, key)
            logger.info("Generated pack: %s", key)

    asyncio.create_task(_gen())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

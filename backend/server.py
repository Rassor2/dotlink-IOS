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


from levels import (
    DIFFICULTY_CONFIG,
    get_level,
    get_levels,
)
from skins import get_all_skins, find_skin
from auth import make_auth_router, ensure_auth_indexes

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
    coins: int = 0  # legacy absolute value (ignored when coin_delta is provided)
    coin_delta: Optional[int] = None  # earned/spent since last successful sync
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
        # Backfill new fields for old profiles
        patch = {}
        if "owned_skins" not in existing:
            existing["owned_skins"] = ["board_obsidian", "ball_classic"]
            patch["owned_skins"] = existing["owned_skins"]
        if "active_skins" not in existing:
            existing["active_skins"] = {"board": "board_obsidian", "ball": "ball_classic"}
            patch["active_skins"] = existing["active_skins"]
        if "friend_code" not in existing or not existing.get("friend_code"):
            existing["friend_code"] = _gen_friend_code()
            patch["friend_code"] = existing["friend_code"]
        if "friends" not in existing:
            existing["friends"] = []
            patch["friends"] = []
        if "tutorial_done" not in existing:
            existing["tutorial_done"] = False
            patch["tutorial_done"] = False
        if "name_changes" not in existing:
            existing["name_changes"] = 0
            patch["name_changes"] = 0
        if patch:
            await db.profiles.update_one({"device_id": device_id}, {"$set": patch})
        return existing
    profile = {
        "id": str(uuid.uuid4()),
        "device_id": device_id,
        "name": name,
        "coins": 100,
        "completed": {},
        "settings": {"sound": True, "music": True, "haptics": True},
        "owned_skins": ["board_obsidian", "ball_classic"],
        "active_skins": {"board": "board_obsidian", "ball": "ball_classic"},
        "friend_code": _gen_friend_code(),
        "friends": [],
        "tutorial_done": False,
        "name_changes": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.profiles.insert_one(profile.copy())
    return profile


def _gen_friend_code() -> str:
    """6-char alphanumeric (uppercase) friend code, no ambiguous chars."""
    import random
    import string
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


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

    # Server is authoritative for coins. The client sends a delta of coins
    # earned/spent locally since its last successful sync. Using max() here
    # previously resurrected spent coins after purchases (refund bug).
    if payload.coin_delta is not None:
        new_coins = max(0, int(profile.get("coins", 0)) + int(payload.coin_delta))
    else:
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
            if record.get("kind") == "skin":
                skin_id = record.get("skin_id")
                profile = await _get_or_create_profile(device_id)
                owned = list(profile.get("owned_skins", []))
                if skin_id and skin_id not in owned:
                    owned.append(skin_id)
                await db.profiles.update_one(
                    {"device_id": device_id},
                    {"$set": {
                        "owned_skins": owned,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
            else:
                coins = int(record.get("coins") or 0)
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


# ---------------- Profile name update ----------------
class NameIn(BaseModel):
    device_id: str
    name: str


@api_router.post("/profile/rename")
async def rename_profile(payload: NameIn):
    name = (payload.name or "").strip()[:24]
    if not name:
        raise HTTPException(400, "Name required")
    profile = await _get_or_create_profile(payload.device_id, name)
    changes = int(profile.get("name_changes", 0))
    coins = int(profile.get("coins", 0))
    cost = 0 if changes == 0 else 350
    if cost > coins:
        raise HTTPException(400, f"Not enough coins (need {cost}, have {coins})")
    update = {
        "name": name,
        "name_changes": changes + 1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if cost > 0:
        update["coins"] = coins - cost
    await db.profiles.update_one({"device_id": payload.device_id}, {"$set": update})
    updated = await db.profiles.find_one({"device_id": payload.device_id}, {"_id": 0})
    return {"profile": updated, "cost": cost, "free": cost == 0}


@api_router.get("/profile/rename-cost/{device_id}")
async def rename_cost(device_id: str):
    profile = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    changes = int((profile or {}).get("name_changes", 0))
    return {"changes": changes, "cost": 0 if changes == 0 else 350, "free_used": changes > 0}


# ---------------- Tutorial ----------------
class TutorialIn(BaseModel):
    device_id: str


@api_router.post("/profile/tutorial-complete")
async def tutorial_complete(payload: TutorialIn):
    profile = await _get_or_create_profile(payload.device_id)
    if profile.get("tutorial_done"):
        return {"already_done": True, "reward": 0, "coins": profile.get("coins", 0)}
    reward = 100
    new_coins = int(profile.get("coins", 0)) + reward
    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {
            "tutorial_done": True,
            "coins": new_coins,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"already_done": False, "reward": reward, "coins": new_coins}


@api_router.post("/profile/tutorial-replay")
async def tutorial_replay(payload: TutorialIn):
    """Allow the user to view the tutorial again (no reward, no flag flip)."""
    profile = await _get_or_create_profile(payload.device_id)
    return {"ok": True, "tutorial_done": profile.get("tutorial_done", False)}


# ---------------- Friends ----------------
class FriendAddIn(BaseModel):
    device_id: str
    friend_code: str


@api_router.post("/friends/add")
async def add_friend(payload: FriendAddIn):
    code = (payload.friend_code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Friend code required")
    me = await _get_or_create_profile(payload.device_id)
    if me.get("friend_code") == code:
        raise HTTPException(400, "C'est votre propre code")
    other = await db.profiles.find_one({"friend_code": code}, {"_id": 0})
    if not other:
        raise HTTPException(404, "Code introuvable")
    my_friends = list(me.get("friends", []))
    if code in my_friends:
        return {"already": True, "friends": my_friends, "added": other.get("name")}
    my_friends.append(code)
    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {"friends": my_friends, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Mutual: also add me to their friend list
    other_friends = list(other.get("friends", []))
    if me.get("friend_code") and me["friend_code"] not in other_friends:
        other_friends.append(me["friend_code"])
        await db.profiles.update_one(
            {"device_id": other["device_id"]},
            {"$set": {"friends": other_friends, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"already": False, "added": other.get("name"), "friends": my_friends}


@api_router.get("/friends/{device_id}")
async def list_friends(device_id: str):
    me = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    if not me:
        return {"friends": []}
    codes = me.get("friends", [])
    if not codes:
        return {"friends": [], "friend_code": me.get("friend_code")}
    docs = await db.profiles.find(
        {"friend_code": {"$in": codes}},
        {"_id": 0, "device_id": 1, "name": 1, "friend_code": 1, "coins": 1, "completed": 1},
    ).to_list(200)
    out = []
    for d in docs:
        completed = d.get("completed") or {}
        stars = sum(int((v or {}).get("stars", 0)) for v in completed.values())
        out.append({
            "friend_code": d.get("friend_code"),
            "name": d.get("name") or "Joueur",
            "stars": stars,
            "completed": len(completed),
            "coins": int(d.get("coins") or 0),
        })
    out.sort(key=lambda x: (-x["stars"], -x["completed"]))
    return {"friends": out, "friend_code": me.get("friend_code")}


class FriendRemoveIn(BaseModel):
    device_id: str
    friend_code: str


@api_router.post("/friends/remove")
async def remove_friend(payload: FriendRemoveIn):
    code = (payload.friend_code or "").strip().upper()
    me = await db.profiles.find_one({"device_id": payload.device_id}, {"_id": 0})
    if not me:
        raise HTTPException(404, "Profile not found")
    friends = [f for f in me.get("friends", []) if f != code]
    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {"friends": friends, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Remove me from their list too
    other = await db.profiles.find_one({"friend_code": code}, {"_id": 0})
    if other and me.get("friend_code"):
        other_friends = [f for f in other.get("friends", []) if f != me["friend_code"]]
        await db.profiles.update_one(
            {"device_id": other["device_id"]},
            {"$set": {"friends": other_friends}},
        )
    return {"friends": friends}


# ---------------- Leaderboard ----------------
@api_router.get("/leaderboard")
async def leaderboard(limit: int = 100, device_id: Optional[str] = None, scope: str = "global"):
    """Top players ranked by total stars then completed levels.
    scope=global (default) or scope=friends (requires device_id)."""
    limit = max(1, min(limit, 100))
    match: Dict[str, Any] = {"stars": {"$gt": 0}}
    if scope == "friends" and device_id:
        me = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
        if me:
            codes = list(me.get("friends", []))
            # Include self in the friends ladder
            if me.get("friend_code"):
                codes.append(me["friend_code"])
            match = {"friend_code": {"$in": codes}}
    pipeline = [
        {"$project": {
            "_id": 0,
            "device_id": 1,
            "name": 1,
            "friend_code": 1,
            "coins": 1,
            "completed_count": {"$size": {"$ifNull": [{"$objectToArray": "$completed"}, []]}},
            "stars": {
                "$sum": {
                    "$map": {
                        "input": {"$ifNull": [{"$objectToArray": "$completed"}, []]},
                        "as": "e",
                        "in": {"$ifNull": ["$$e.v.stars", 0]},
                    }
                }
            },
        }},
        {"$match": match},
        {"$sort": {"stars": -1, "completed_count": -1}},
        {"$limit": limit},
    ]
    docs = await db.profiles.aggregate(pipeline).to_list(limit)
    out = []
    for i, d in enumerate(docs, start=1):
        out.append({
            "rank": i,
            "device_id": d.get("device_id"),
            "name": d.get("name") or "Joueur",
            "friend_code": d.get("friend_code"),
            "stars": int(d.get("stars") or 0),
            "completed": int(d.get("completed_count") or 0),
            "coins": int(d.get("coins") or 0),
        })

    # Also compute the requesting user's rank if not in top
    my_entry = None
    if device_id:
        in_top = next((e for e in out if e["device_id"] == device_id), None)
        if in_top:
            my_entry = in_top
        else:
            my_doc = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
            if my_doc:
                completed = my_doc.get("completed") or {}
                stars = sum(int((v or {}).get("stars", 0)) for v in completed.values())
                # Rank = number of profiles with higher (stars, completed_count) tuple + 1
                higher = await db.profiles.aggregate([
                    {"$project": {
                        "stars": {
                            "$sum": {
                                "$map": {
                                    "input": {"$ifNull": [{"$objectToArray": "$completed"}, []]},
                                    "as": "e",
                                    "in": {"$ifNull": ["$$e.v.stars", 0]},
                                }
                            }
                        },
                        "completed_count": {"$size": {"$ifNull": [{"$objectToArray": "$completed"}, []]}},
                    }},
                    {"$match": {
                        "$or": [
                            {"stars": {"$gt": stars}},
                            {"$and": [{"stars": stars}, {"completed_count": {"$gt": len(completed)}}]},
                        ]
                    }},
                    {"$count": "n"},
                ]).to_list(1)
                rank = (higher[0]["n"] + 1) if higher else 1
                my_entry = {
                    "rank": rank,
                    "device_id": device_id,
                    "name": my_doc.get("name") or "Joueur",
                    "stars": stars,
                    "completed": len(completed),
                    "coins": int(my_doc.get("coins") or 0),
                }
    return {"top": out, "me": my_entry}


# ---------------- Skins ----------------
class SkinBuyIn(BaseModel):
    device_id: str
    skin_id: str


class SkinActivateIn(BaseModel):
    device_id: str
    skin_id: str


class SkinCheckoutIn(BaseModel):
    device_id: str
    skin_id: str
    origin_url: str


@api_router.get("/skins")
async def list_skins(device_id: Optional[str] = None):
    catalog = get_all_skins()
    owned = []
    active = {}
    if device_id:
        prof = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
        if prof:
            owned = prof.get("owned_skins", ["board_obsidian", "ball_classic"])
            active = prof.get("active_skins", {"board": "board_obsidian", "ball": "ball_classic"})
    return {"catalog": catalog, "owned": owned, "active": active}


@api_router.post("/skins/buy")
async def buy_skin_with_coins(payload: SkinBuyIn):
    skin = find_skin(payload.skin_id)
    if not skin:
        raise HTTPException(404, "Skin not found")
    profile = await _get_or_create_profile(payload.device_id)
    owned = list(profile.get("owned_skins", []))
    if payload.skin_id in owned:
        return {"ok": True, "already_owned": True, "coins": profile.get("coins", 0)}
    if skin["tier"] == "developer":
        raise HTTPException(403, "Developer skin is not purchasable")
    if int(profile.get("coins", 0)) < int(skin["coins"]):
        raise HTTPException(400, "Not enough coins")
    new_coins = int(profile.get("coins", 0)) - int(skin["coins"])
    owned.append(payload.skin_id)
    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {
            "coins": new_coins,
            "owned_skins": owned,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "coins": new_coins, "owned": owned}


@api_router.post("/skins/activate")
async def activate_skin(payload: SkinActivateIn):
    skin = find_skin(payload.skin_id)
    if not skin:
        raise HTTPException(404, "Skin not found")
    profile = await _get_or_create_profile(payload.device_id)
    owned = profile.get("owned_skins", [])
    if payload.skin_id not in owned:
        raise HTTPException(403, "Skin not owned")
    active = dict(profile.get("active_skins", {}))
    key = "board" if payload.skin_id.startswith("board_") else "ball"
    active[key] = payload.skin_id
    await db.profiles.update_one(
        {"device_id": payload.device_id},
        {"$set": {
            "active_skins": active,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "active": active}


@api_router.post("/skins/checkout")
async def skin_checkout(payload: SkinCheckoutIn):
    skin = find_skin(payload.skin_id)
    if not skin:
        raise HTTPException(404, "Skin not found")
    if skin["tier"] == "developer":
        raise HTTPException(403, "Developer skin is not purchasable")
    host_url = payload.origin_url.rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{host_url}/checkout-return?session_id={{CHECKOUT_SESSION_ID}}&skin=1"
    cancel_url = f"{host_url}/shop"
    checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    session_req = CheckoutSessionRequest(
        amount=float(skin["usd"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "device_id": payload.device_id,
            "kind": "skin",
            "skin_id": payload.skin_id,
        },
    )
    try:
        session = await checkout.create_checkout_session(session_req)
    except Exception as e:
        logger.exception("Stripe error")
        raise HTTPException(500, f"Stripe error: {e}")
    await db.payments.insert_one({
        "session_id": session.session_id,
        "device_id": payload.device_id,
        "kind": "skin",
        "skin_id": payload.skin_id,
        "amount": skin["usd"],
        "status": "open",
        "payment_status": "unpaid",
        "credited": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id}


# Include the routers
api_router.include_router(make_auth_router(db, _get_or_create_profile))
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

    await ensure_auth_indexes(db)

    async def _gen():
        loop = asyncio.get_event_loop()
        for key in DIFFICULTY_CONFIG:
            await loop.run_in_executor(None, get_levels, key)
            logger.info("Generated pack: %s", key)

    asyncio.create_task(_gen())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

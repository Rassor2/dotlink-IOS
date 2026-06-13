"""Dot Link - Authentication (email/password + Emergent-managed Google + Admin).

One unified session layer: opaque session tokens stored in `user_sessions`,
used identically for all providers. The account is linked to a canonical
game profile (`profile_device_id`); progression from other devices is merged
into it on login.

Admin user (`admin2345`) is seeded from env vars (ADMIN_USERNAME / ADMIN_PASSWORD)
on startup, has `is_admin=true`, and uses a separate /auth/admin/login endpoint
that accepts username (not email).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

EMERGENT_SESSION_API = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    device_id: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    device_id: Optional[str] = None


class GoogleSessionIn(BaseModel):
    session_id: str
    device_id: Optional[str] = None


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user_out(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "provider": user.get("provider", "local"),
        "profile_device_id": user.get("profile_device_id"),
    }


def make_auth_router(db, get_or_create_profile) -> APIRouter:
    router = APIRouter(prefix="/auth")

    async def _create_session(user_id: str, token: Optional[str] = None) -> str:
        session_token = token or uuid.uuid4().hex + uuid.uuid4().hex
        await db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "created_at": _now().isoformat(),
            "expires_at": _now() + timedelta(days=SESSION_DAYS),
        })
        return session_token

    async def _link_profile(user: dict, device_id: Optional[str]) -> str:
        """Attach/merge the device profile to the account; return canonical device_id."""
        canonical = user.get("profile_device_id")
        if not canonical:
            # First login ever: claim the current device profile as canonical
            canonical = device_id or f"acct-{user['user_id']}"
            await get_or_create_profile(canonical, user.get("name") or "Joueur")
            await db.profiles.update_one(
                {"device_id": canonical}, {"$set": {"user_id": user["user_id"]}}
            )
            await db.users.update_one(
                {"user_id": user["user_id"]}, {"$set": {"profile_device_id": canonical}}
            )
            return canonical
        if device_id and device_id != canonical:
            # Merge guest progress from this device into the account profile,
            # then remove the guest profile so it can't be merged twice.
            guest = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
            acct = await get_or_create_profile(canonical)
            if guest:
                completed = dict(acct.get("completed", {}))
                for level_id, prog in (guest.get("completed") or {}).items():
                    prev = completed.get(level_id) or {}
                    if int((prog or {}).get("stars", 0)) > int(prev.get("stars", 0)):
                        completed[level_id] = prog
                merged = {
                    "completed": completed,
                    "coins": max(int(acct.get("coins", 0)), int(guest.get("coins", 0))),
                    "owned_skins": sorted(set(acct.get("owned_skins", [])) | set(guest.get("owned_skins", []))),
                    "tutorial_done": bool(acct.get("tutorial_done")) or bool(guest.get("tutorial_done")),
                    "user_id": user["user_id"],
                    "updated_at": _now().isoformat(),
                }
                await db.profiles.update_one({"device_id": canonical}, {"$set": merged})
                await db.profiles.delete_one({"device_id": device_id})
        return canonical

    async def _auth_payload(user: dict, token: str) -> dict:
        return {"session_token": token, "user": _user_out(user)}

    @router.post("/register")
    async def register(payload: RegisterIn):
        email = payload.email.lower().strip()
        if len(payload.password) < 8:
            raise HTTPException(400, "Mot de passe trop court (8 caractères minimum)")
        if await db.users.find_one({"email": email}):
            raise HTTPException(409, "Cet email est déjà utilisé")
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "name": (payload.name or email.split("@")[0])[:24],
            "password_hash": _hash_password(payload.password),
            "provider": "local",
            "profile_device_id": None,
            "created_at": _now().isoformat(),
        }
        await db.users.insert_one(dict(user))
        user["profile_device_id"] = await _link_profile(user, payload.device_id)
        token = await _create_session(user["user_id"])
        return await _auth_payload(user, token)

    @router.post("/login")
    async def login(payload: LoginIn):
        email = payload.email.lower().strip()
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user or not user.get("password_hash") or not _verify_password(payload.password, user["password_hash"]):
            raise HTTPException(401, "Email ou mot de passe incorrect")
        user["profile_device_id"] = await _link_profile(user, payload.device_id)
        token = await _create_session(user["user_id"])
        return await _auth_payload(user, token)

    @router.post("/google/session")
    async def google_session(payload: GoogleSessionIn):
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                EMERGENT_SESSION_API, headers={"X-Session-ID": payload.session_id}
            )
        if res.status_code != 200:
            raise HTTPException(401, "Session Google invalide")
        data = res.json()
        email = (data.get("email") or "").lower().strip()
        if not email:
            raise HTTPException(401, "Session Google invalide")
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user:
            user = {
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email,
                "name": (data.get("name") or email.split("@")[0])[:24],
                "picture": data.get("picture"),
                "provider": "google",
                "profile_device_id": None,
                "created_at": _now().isoformat(),
            }
            await db.users.insert_one(dict(user))
        user["profile_device_id"] = await _link_profile(user, payload.device_id)
        token = await _create_session(user["user_id"], token=data.get("session_token"))
        return await _auth_payload(user, token)

    async def _current_user(request: Request) -> dict:
        auth = request.headers.get("Authorization") or ""
        if not auth.startswith("Bearer "):
            raise HTTPException(401, "Non authentifié")
        token = auth[7:].strip()
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if not session:
            raise HTTPException(401, "Session expirée")
        expires = session.get("expires_at")
        if isinstance(expires, datetime):
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < _now():
                raise HTTPException(401, "Session expirée")
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(401, "Utilisateur introuvable")
        return user

    @router.get("/me")
    async def me(request: Request):
        user = await _current_user(request)
        return {"user": _user_out(user)}

    @router.post("/logout")
    async def logout(request: Request):
        auth = request.headers.get("Authorization") or ""
        if auth.startswith("Bearer "):
            await db.user_sessions.delete_one({"session_token": auth[7:].strip()})
        return {"ok": True}

    return router


async def ensure_auth_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)

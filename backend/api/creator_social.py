"""Creator social OAuth endpoints (Instagram / TikTok sign-in).

Used inside the creator application: instead of typing a handle, the applicant
signs in to the platform so the account is PROVEN theirs. Flow mirrors
api/google.py (auth-url → system browser → backend callback → app-scheme
redirect):

`GET  /creator-social/status`                — which platforms are connected/available.
`GET  /creator-social/connect/{platform}`    — returns the consent URL to open.
`GET  /creator-social/callback/{platform}`   — OAuth redirect target; stores tokens.
`DELETE /creator-social/disconnect/{platform}` — soft-revoke a connection.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.sqlalchemy import get_db
from middleware.auth_middleware import get_current_user
from middleware.rate_limit import rate_limit
from models.sqlalchemy_models import CreatorSocialConnection
from services import creator_social_oauth as oauth
from services.secrets import encrypt_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/creator-social", tags=["CreatorSocial"])

# Only redirects back onto the app's own scheme are honored (open-redirect guard),
# same posture as api/google.py.
_APP_SCHEME = "cannon://"


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id") or current_user.get("sub")
    if raw is None:
        raise HTTPException(status_code=401, detail="No user id on token")
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad user id")


def _check_platform(platform: str) -> str:
    p = (platform or "").strip().lower()
    if p not in oauth.PLATFORMS:
        raise HTTPException(status_code=422, detail="Unknown platform.")
    return p


# --- signed state (CSRF + user binding), same scheme as api/google.py --------

def _sign_state(user_id: str, platform: str, return_url: str | None = None) -> str:
    payload = f"{user_id}|{platform}" if not return_url else f"{user_id}|{platform}|{return_url}"
    sig = hmac.new(
        settings.jwt_secret_key.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()[:32]
    return f"{payload}.{sig}"


def _verify_state(state: str) -> tuple[str, str, str | None] | None:
    """Returns (user_id, platform, return_url|None) or None on a bad signature."""
    try:
        payload, sig = state.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(
        settings.jwt_secret_key.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    parts = payload.split("|", 2)
    if len(parts) < 2:
        return None
    user_id, platform = parts[0], parts[1]
    return_url = parts[2] if len(parts) > 2 else None
    if return_url is not None and not return_url.startswith(_APP_SCHEME):
        return_url = None
    return user_id, platform, return_url


def _connection_payload(conn: CreatorSocialConnection) -> dict:
    prof = conn.profile or {}
    return {
        "platform": conn.platform,
        "handle": conn.handle,
        "platform_user_id": conn.platform_user_id,
        "full_name": prof.get("full_name"),
        "avatar_url": prof.get("avatar_url"),
        "followers": prof.get("followers"),
        "verified": bool(prof.get("verified")),
        "mock": bool(prof.get("mock")),
        "connected_at": conn.connected_at.isoformat() if conn.connected_at else None,
    }


async def _active_connections(db: AsyncSession, user_id: UUID) -> dict[str, CreatorSocialConnection]:
    rows = (
        await db.execute(
            select(CreatorSocialConnection).where(
                (CreatorSocialConnection.user_id == user_id)
                & (CreatorSocialConnection.revoked_at.is_(None))
            )
        )
    ).scalars().all()
    return {r.platform: r for r in rows}


@router.get("/status")
async def status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Connected state per platform + whether each provider can be used at all
    (so the client can fall back to manual handle entry when OAuth is off)."""
    uid = _uid(current_user)
    conns = await _active_connections(db, uid)
    return {
        "providers": {
            p: {"available": oauth.platform_available(p)}
            for p in oauth.PLATFORMS
        },
        "connections": {
            p: (_connection_payload(conns[p]) if p in conns else None)
            for p in oauth.PLATFORMS
        },
    }


@router.get(
    "/connect/{platform}",
    dependencies=[Depends(rate_limit(limit=20, window_s=600, scope="creator_social_connect"))],
)
async def connect(
    platform: str,
    return_url: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Returns the consent URL; the client opens it in the system auth sheet.
    Native clients pass return_url (their cannon:// deep link) so the callback
    can bounce straight back into the app."""
    p = _check_platform(platform)
    if not oauth.platform_available(p):
        raise HTTPException(
            status_code=503,
            detail=f"{p.capitalize()} sign-in is not configured.",
        )
    uid = str(_uid(current_user))
    ru = return_url if (return_url and return_url.startswith(_APP_SCHEME)) else None
    return {"auth_url": oauth.build_auth_url(p, _sign_state(uid, p, ru))}


def _done_html(message: str) -> HTMLResponse:
    return HTMLResponse(
        "<html><body style='font-family:-apple-system,sans-serif;padding:40px;text-align:center;'>"
        f"<h3>{message}</h3><p>You can close this window and return to Max.</p>"
        "<script>setTimeout(function(){ window.close(); }, 1500);</script>"
        "</body></html>"
    )


@router.get("/callback/{platform}")
async def callback(
    platform: str,
    state: str = Query(...),
    code: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """OAuth redirect target. Verifies state, exchanges the code, upserts the
    connection, then deep-links back into the app (or shows a self-closing
    page). On provider error/deny we still return to the app gracefully."""
    p = _check_platform(platform)
    verified = _verify_state(state)
    if verified is None or verified[1] != p:
        raise HTTPException(status_code=400, detail="Bad state")
    user_id, _, return_url = verified

    def _bounce(ok: bool) -> RedirectResponse | HTMLResponse:
        if return_url:
            sep = "&" if "?" in return_url else "?"
            flag = f"connected={1 if ok else 0}&platform={p}"
            return RedirectResponse(url=f"{return_url}{sep}{flag}", status_code=302)
        return _done_html(
            f"{p.capitalize()} connected." if ok else f"{p.capitalize()} sign-in was cancelled."
        )

    if error or not code:
        return _bounce(False)

    try:
        data = await oauth.exchange_and_fetch(p, code)
    except Exception as e:
        logger.warning("[creator_social] %s exchange failed: %s", p, e)
        return _bounce(False)

    uid = UUID(user_id)
    conn = (
        await db.execute(
            select(CreatorSocialConnection).where(
                (CreatorSocialConnection.user_id == uid)
                & (CreatorSocialConnection.platform == p)
            )
        )
    ).scalars().first()
    if conn is None:
        conn = CreatorSocialConnection(user_id=uid, platform=p)
        db.add(conn)

    conn.platform_user_id = data.get("platform_user_id") or None
    conn.handle = data.get("handle") or None
    conn.profile = {
        "full_name": data.get("full_name"),
        "avatar_url": data.get("avatar_url"),
        "followers": data.get("followers"),
        "verified": data.get("verified"),
        **(data.get("profile_extra") or {}),
    }
    if data.get("access_token"):
        conn.access_token_encrypted = encrypt_token(data["access_token"])
    if data.get("refresh_token"):
        conn.refresh_token_encrypted = encrypt_token(data["refresh_token"])
    conn.token_expires_at = data.get("expires_at")
    conn.connected_at = datetime.utcnow()
    conn.revoked_at = None
    await db.commit()

    logger.info("[creator_social] user=%s connected %s @%s", user_id, p, conn.handle)
    return _bounce(True)


@router.delete("/disconnect/{platform}")
async def disconnect(
    platform: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-revoke: tokens are dropped, the row is kept (revoked_at) so an
    in-review application retains the provenance of how it was verified."""
    p = _check_platform(platform)
    uid = _uid(current_user)
    conn = (
        await db.execute(
            select(CreatorSocialConnection).where(
                (CreatorSocialConnection.user_id == uid)
                & (CreatorSocialConnection.platform == p)
            )
        )
    ).scalars().first()
    if conn is None:
        return {"disconnected": True}
    conn.access_token_encrypted = None
    conn.refresh_token_encrypted = None
    conn.token_expires_at = None
    conn.revoked_at = datetime.utcnow()
    await db.commit()
    return {"disconnected": True}

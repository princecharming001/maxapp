"""
Google integration API: OAuth connect/callback, Calendar sync, Gmail
commitment scan, and proposed-event confirmation (confirm-first).

Everything reports {available: false} cleanly when keys are not configured,
so clients can render honest "coming soon" states instead of breaking.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import CalendarConnection, CalendarEvent
from services.google_integration import (
    build_auth_url,
    exchange_code,
    gmail_scan_available,
    google_oauth_available,
    maps_available,
    scan_gmail_commitments,
    store_connection,
    sync_google_calendar,
)

router = APIRouter(prefix="/google", tags=["Google"])


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id") or current_user.get("sub")
    if raw is None:
        raise HTTPException(status_code=401, detail="No user id on token")
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad user id")


def _sign_state(user_id: str) -> str:
    sig = hmac.new(
        settings.jwt_secret_key.encode(), user_id.encode(), hashlib.sha256
    ).hexdigest()[:32]
    return f"{user_id}.{sig}"


def _verify_state(state: str) -> str | None:
    try:
        user_id, sig = state.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(
        settings.jwt_secret_key.encode(), user_id.encode(), hashlib.sha256
    ).hexdigest()[:32]
    return user_id if hmac.compare_digest(sig, expected) else None


@router.get("/status")
async def status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    conn = (await db.execute(
        select(CalendarConnection).where(
            (CalendarConnection.user_id == uid)
            & (CalendarConnection.provider == "google")
            & (CalendarConnection.is_active.is_(True))
        )
    )).scalars().first()
    return {
        "oauth_available": google_oauth_available(),
        "maps_available": maps_available(),
        "gmail_available": gmail_scan_available(),
        "calendar_link_enabled": settings.calendar_link_enabled,
        "connected": conn is not None and bool(conn.tokens_decrypted.get("refresh_token")),
        "last_synced_at": conn.last_synced_at.isoformat() if conn and conn.last_synced_at else None,
    }


@router.get("/connect")
async def connect(
    include_gmail: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
):
    """Returns the Google consent URL; the client opens it in a browser."""
    if not google_oauth_available():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    uid = str(_uid(current_user))
    return {"auth_url": build_auth_url(_sign_state(uid), include_gmail)}


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """OAuth redirect target. Stores tokens, kicks an initial sync, and shows
    a tiny self-closing page (the app polls /google/status)."""
    user_id = _verify_state(state)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Bad state")
    try:
        payload = await exchange_code(code)
    except Exception:
        raise HTTPException(status_code=400, detail="Token exchange failed")
    await store_connection(db, UUID(user_id), payload)
    try:
        await sync_google_calendar(UUID(user_id), db)
    except Exception:
        pass  # initial sync is best-effort; the poll job catches up
    return HTMLResponse(
        "<html><body style='font-family: sans-serif; padding: 40px; text-align: center;'>"
        "<h3>Google connected.</h3><p>You can close this window and return to Max.</p>"
        "<script>setTimeout(function(){ window.close(); }, 1500);</script>"
        "</body></html>"
    )


@router.post("/sync")
async def sync_now(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    result = await sync_google_calendar(uid, db)
    return result


@router.post("/gmail/scan")
async def gmail_scan(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    return await scan_gmail_commitments(uid, db)


@router.get("/proposed")
async def proposed_events(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gmail-found commitments awaiting the user's confirm (confirm-first)."""
    uid = _uid(current_user)
    rows = (await db.execute(
        select(CalendarEvent).where(
            (CalendarEvent.user_id == uid)
            & (CalendarEvent.status == "proposed")
        ).order_by(CalendarEvent.starts_at).limit(10)
    )).scalars().all()
    return {
        "proposed": [
            {
                "id": str(e.id),
                "title": e.title,
                "starts_at": e.starts_at.isoformat(),
                "ends_at": e.ends_at.isoformat(),
            }
            for e in rows
        ]
    }


@router.delete("/disconnect")
async def disconnect(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke Google Calendar access: best-effort token revoke, deactivate
    connection, clear tokens, and purge that connection's calendar events."""
    uid = _uid(current_user)
    conn = (await db.execute(
        select(CalendarConnection).where(
            (CalendarConnection.user_id == uid)
            & (CalendarConnection.provider == "google")
        )
    )).scalars().first()
    if conn is None:
        return {"disconnected": True}
    # Best-effort revoke with Google
    refresh_token = conn.tokens_decrypted.get("refresh_token")
    if refresh_token:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": refresh_token},
                )
        except Exception:
            pass  # best-effort; proceed with local cleanup regardless
    # Delete this connection's calendar events
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(CalendarEvent).where(CalendarEvent.connection_id == conn.id)
    )
    # Clear tokens and deactivate
    conn.is_active = False
    conn.tokens = None
    conn.tokens_encrypted = None
    await db.commit()
    return {"disconnected": True}


@router.post("/proposed/{event_id}")
async def resolve_proposed(
    event_id: str,
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirm (-> real busy block the planner works around) or dismiss."""
    uid = _uid(current_user)
    try:
        eid = UUID(event_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad event id")
    ev = (await db.execute(
        select(CalendarEvent).where(
            (CalendarEvent.id == eid) & (CalendarEvent.user_id == uid)
        )
    )).scalars().first()
    if ev is None or ev.status != "proposed":
        raise HTTPException(status_code=404, detail="No such proposal")
    if bool(payload.get("confirm")):
        ev.status = "confirmed"
        ev.is_busy = True
    else:
        ev.status = "dismissed"
        ev.is_busy = False
    await db.commit()
    return {"status": ev.status}

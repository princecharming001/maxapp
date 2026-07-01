"""
Google integration API: OAuth connect/callback, Calendar sync, Gmail
commitment scan, and proposed-event confirmation (confirm-first).

Everything reports {available: false} cleanly when keys are not configured,
so clients can render honest "coming soon" states instead of breaking.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
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
    SYNC_WINDOW_DAYS,
    RESYNC_NUDGE_DAYS,
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


# The mobile app's custom URL scheme (app.json "scheme": "cannon"). Only a
# return_url on this scheme is honored, so the callback redirect can never be
# pointed at an attacker-controlled destination (open-redirect guard).
_APP_SCHEME = "cannon://"


def _sign_state(user_id: str, return_url: str | None = None) -> str:
    # Payload is just the user_id when there's no return_url — byte-identical to
    # the previous format, so states already in flight during a deploy still verify.
    payload = user_id if not return_url else f"{user_id}|{return_url}"
    sig = hmac.new(
        settings.jwt_secret_key.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()[:32]
    return f"{payload}.{sig}"


def _verify_state(state: str) -> tuple[str, str | None] | None:
    """Returns (user_id, return_url|None) if the signature checks out, else None."""
    try:
        payload, sig = state.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(
        settings.jwt_secret_key.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    if "|" in payload:
        user_id, return_url = payload.split("|", 1)
    else:
        user_id, return_url = payload, None
    if return_url is not None and not return_url.startswith(_APP_SCHEME):
        return_url = None  # ignore anything that isn't our app scheme
    return user_id, return_url


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
    connected = conn is not None and bool(conn.tokens_decrypted.get("refresh_token"))
    # How far ahead is the calendar synced? Re-sync nudge fires when coverage
    # drops below RESYNC_NUDGE_DAYS (i.e. sync window is running out).
    needs_resync = False
    synced_through = None
    if connected and conn and conn.last_synced_at:
        synced_through_dt = conn.last_synced_at.replace(tzinfo=timezone.utc) + timedelta(days=SYNC_WINDOW_DAYS)
        synced_through = synced_through_dt.isoformat()
        days_remaining = (synced_through_dt - datetime.now(timezone.utc)).days
        needs_resync = days_remaining < RESYNC_NUDGE_DAYS
    return {
        "oauth_available": google_oauth_available(),
        "maps_available": maps_available(),
        "gmail_available": gmail_scan_available(),
        "calendar_link_enabled": settings.calendar_link_enabled,
        "connected": connected,
        "last_synced_at": conn.last_synced_at.isoformat() if conn and conn.last_synced_at else None,
        "synced_through": synced_through,
        "needs_resync": needs_resync,
    }


@router.get("/connect")
async def connect(
    include_gmail: bool = Query(default=False),
    return_url: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Returns the Google consent URL; the client opens it in a browser.

    A native client passes return_url (its cannon:// deep link) so the callback
    can redirect back into the app and auto-dismiss the auth sheet."""
    if not google_oauth_available():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    uid = str(_uid(current_user))
    ru = return_url if (return_url and return_url.startswith(_APP_SCHEME)) else None
    return {"auth_url": build_auth_url(_sign_state(uid, ru), include_gmail)}


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """OAuth redirect target. Stores tokens, kicks an initial sync, then either
    redirects back into the app (native auth sheet auto-dismisses) or shows a
    tiny self-closing page (web / legacy clients; the app also polls /status)."""
    verified = _verify_state(state)
    if verified is None:
        raise HTTPException(status_code=400, detail="Bad state")
    user_id, return_url = verified
    try:
        payload = await exchange_code(code)
    except Exception:
        raise HTTPException(status_code=400, detail="Token exchange failed")
    await store_connection(db, UUID(user_id), payload)
    try:
        await sync_google_calendar(UUID(user_id), db)
    except Exception:
        pass  # initial sync is best-effort; the poll job catches up
    if return_url:
        # 302 to cannon://google-connected — ASWebAuthenticationSession sees the
        # app-scheme redirect and dismisses itself, handing control back to Max.
        sep = "&" if "?" in return_url else "?"
        return RedirectResponse(url=f"{return_url}{sep}connected=1", status_code=302)
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

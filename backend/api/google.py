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
from sqlalchemy.orm.attributes import flag_modified

from config import settings
from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import CalendarConnection, CalendarEvent, User
from services.google_integration import (
    build_auth_url,
    exchange_code,
    fetch_account_email,
    granted_calendar_read,
    SCOPE_CALENDAR_APP,
    _fresh_access_token,
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


def connection_needs_reconnect(conn) -> bool:
    """Inactive but still holding a refresh token = Google cut us off.

    A user-initiated disconnect clears the tokens, so it never lands here; only
    a refresh that Google rejected (sync/mirror flip is_active off and keep the
    tokens) does."""
    if conn is None or conn.is_active:
        return False
    return bool((conn.tokens_decrypted or {}).get("refresh_token"))


# Reasons the callback hands back to the app as ?error=<code>. The app maps each
# to one plain sentence (mobile/lib/googleConnect.ts).
CONNECT_ERROR_DENIED = "denied"            # tapped Cancel / "Don't allow" on Google
CONNECT_ERROR_NO_CALENDAR = "no_calendar"  # unticked the calendar permission
CONNECT_ERROR_FAILED = "failed"            # anything else (expired code, Google down)


def _callback_result_html(ok: bool, message: str) -> HTMLResponse:
    title = "Google Calendar connected." if ok else "Google Calendar wasn't connected."
    return HTMLResponse(
        "<html><body style='font-family: sans-serif; padding: 40px; text-align: center;'>"
        f"<h3>{title}</h3><p>{message}</p>"
        + ("<script>setTimeout(function(){ window.close(); }, 1500);</script>" if ok else "")
        + "</body></html>",
        status_code=200 if ok else 400,
    )


def _callback_error(return_url: str | None, code: str):
    """Send a failed connect back to the app with a reason, never a raw JSON error."""
    if return_url:
        sep = "&" if "?" in return_url else "?"
        return RedirectResponse(url=f"{return_url}{sep}error={code}", status_code=302)
    msg = {
        CONNECT_ERROR_DENIED: "You didn't give permission. Nothing was changed.",
        CONNECT_ERROR_NO_CALENDAR: (
            "Superpower needs to see your calendar to plan around it. "
            "Try again and leave the calendar box ticked."
        ),
    }.get(code, "Something went wrong. Go back to Superpower and try again.")
    return _callback_result_html(False, msg)


@router.get("/status")
async def status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    any_conn = (await db.execute(
        select(CalendarConnection).where(
            (CalendarConnection.user_id == uid)
            & (CalendarConnection.provider == "google")
        )
    )).scalars().first()
    needs_reconnect = connection_needs_reconnect(any_conn)
    conn = any_conn if (any_conn is not None and any_conn.is_active) else None
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
    # Write capability is a separate axis from "connected": a user who linked
    # their calendar before routine-sync existed holds a read-only grant and
    # must re-consent before we can create events for them.
    write_enabled = bool(getattr(settings, "gcal_write_enabled", False))
    write_scope_granted = bool(
        connected and conn and SCOPE_CALENDAR_APP in str((conn.tokens_decrypted or {}).get("scope") or "")
    )
    user_row = await db.get(User, uid)
    prof = dict((user_row.profile or {}) if user_row else {})
    return {
        "oauth_available": google_oauth_available(),
        "maps_available": maps_available(),
        "gmail_available": gmail_scan_available(),
        "calendar_link_enabled": settings.calendar_link_enabled,
        "connected": connected,
        # Google stopped accepting our access (revoked in their account
        # settings, password change, long inactivity). The app shows a one-tap
        # "Reconnect" instead of quietly looking disconnected.
        "needs_reconnect": needs_reconnect,
        "account_email": (
            (any_conn.tokens_decrypted or {}).get("account_email")
            if (any_conn is not None and (connected or needs_reconnect)) else None
        ),
        "last_synced_at": conn.last_synced_at.isoformat() if conn and conn.last_synced_at else None,
        "synced_through": synced_through,
        "needs_resync": needs_resync,
        "write_enabled": write_enabled,
        "write_scope_granted": write_scope_granted,
        "needs_write_upgrade": bool(write_enabled and connected and not write_scope_granted),
        "routine_sync_enabled": bool(prof.get("gcal_routine_sync")),
        "max_calendar_id": (conn.app_calendar_id if conn else None),
    }


@router.get("/connect")
async def connect(
    include_gmail: bool = Query(default=False),
    include_write: bool = Query(default=False),
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
    return {"auth_url": build_auth_url(_sign_state(uid, ru), include_gmail, include_write)}


@router.get("/callback")
async def callback(
    state: str = Query(default=""),
    code: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """OAuth redirect target. Stores tokens, kicks an initial sync, then either
    redirects back into the app (native auth sheet auto-dismisses) or shows a
    tiny self-closing page (web / legacy clients; the app also polls /status).

    Every failure (Cancel on Google's screen, calendar box unticked, expired
    code) also redirects back into the app with ?error=<reason>, so the sheet
    closes and the user is told what happened instead of staring at JSON."""
    verified = _verify_state(state) if state else None
    if verified is None:
        return _callback_result_html(
            False, "This link has expired. Go back to Superpower and try again."
        )
    user_id, return_url = verified
    if error or not code:
        # Google sends error=access_denied when the user backs out.
        return _callback_error(
            return_url,
            CONNECT_ERROR_DENIED if (error or "access_denied") == "access_denied" else CONNECT_ERROR_FAILED,
        )
    try:
        payload = await exchange_code(code)
    except Exception:
        return _callback_error(return_url, CONNECT_ERROR_FAILED)
    if not granted_calendar_read(payload):
        # Storing this would show "Connected" while every sync 403s, so don't —
        # and say why. Deliberately NOT revoked: revoking kills the whole grant,
        # which would also break a connection this user already had working.
        return _callback_error(return_url, CONNECT_ERROR_NO_CALENDAR)

    account_email = await fetch_account_email(payload.get("access_token"))
    await _forget_other_account_calendar(db, UUID(user_id), account_email)
    await store_connection(db, UUID(user_id), payload, account_email=account_email)
    try:
        await sync_google_calendar(UUID(user_id), db)
    except Exception:
        pass  # initial sync is best-effort; the poll job catches up

    # Now that we can see their real commitments, reflow existing plans around
    # them — otherwise a user who connects after enrolling keeps a routine that
    # was built blind to their calendar until something else triggers a regen.
    try:
        from services.schedule_runtime import regenerate_active_schedules
        await regenerate_active_schedules(
            user_id=UUID(user_id), db=db, reason="calendar_connected"
        )
        await db.commit()
    except Exception:
        pass

    # First populate of the Superpower calendar (no-op unless they've opted in and
    # granted write scope).
    try:
        from services.gcal_mirror import kick_gcal_mirror
        kick_gcal_mirror(user_id)
    except Exception:
        pass

    if return_url:
        # 302 to cannon://google-connected — ASWebAuthenticationSession sees the
        # app-scheme redirect and dismisses itself, handing control back to Superpower.
        sep = "&" if "?" in return_url else "?"
        return RedirectResponse(url=f"{return_url}{sep}connected=1", status_code=302)
    return HTMLResponse(
        "<html><body style='font-family: sans-serif; padding: 40px; text-align: center;'>"
        "<h3>Google connected.</h3><p>You can close this window and return to Superpower.</p>"
        "<script>setTimeout(function(){ window.close(); }, 1500);</script>"
        "</body></html>"
    )


async def _revoke_token(token: str | None) -> None:
    """Best-effort revoke with Google; never raises."""
    if not token:
        return
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                "https://oauth2.googleapis.com/revoke", params={"token": token}
            )
    except Exception:
        pass


async def _forget_other_account_calendar(db: AsyncSession, uid: UUID, new_email: str | None) -> None:
    """Reconnecting with a DIFFERENT Google account: the "Superpower" calendar we
    made lives in the old account, so the mirror would keep writing to an id the
    new account doesn't have (every write 404s, forever). Remove it from the old
    account while its token still works, and start the mirror fresh."""
    if not new_email:
        return
    conn = (await db.execute(
        select(CalendarConnection).where(
            (CalendarConnection.user_id == uid)
            & (CalendarConnection.provider == "google")
        )
    )).scalars().first()
    if conn is None or not conn.app_calendar_id:
        return
    old_email = (conn.tokens_decrypted or {}).get("account_email")
    if not old_email or old_email.lower() == new_email.lower():
        return
    try:
        from services.gcal_mirror import teardown_mirror
        access = None
        try:
            access = await _fresh_access_token(conn, db)
        except Exception:
            pass
        await teardown_mirror(str(uid), conn, access, db)
        await db.commit()
    except Exception:
        pass


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
        return {"disconnected": True, "routine_calendar_left": False}

    # Tear the Superpower calendar down FIRST — it needs a live token, and the revoke
    # below kills that. Leaving it behind would strand a calendar the user can
    # no longer have us clean up.
    calendar_removed = True
    try:
        from services.gcal_mirror import teardown_mirror
        access = None
        try:
            access = await _fresh_access_token(conn, db)
        except Exception:
            pass
        calendar_removed = await teardown_mirror(str(uid), conn, access, db)
    except Exception:
        calendar_removed = not bool(conn.app_calendar_id)

    # Best-effort revoke with Google
    await _revoke_token(conn.tokens_decrypted.get("refresh_token"))
    # Delete this connection's calendar events
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(CalendarEvent).where(CalendarEvent.connection_id == conn.id)
    )
    # Clear tokens and deactivate
    conn.is_active = False
    conn.tokens = None
    conn.tokens_encrypted = None
    conn.app_calendar_id = None

    # Forget the opt-in so a future reconnect starts from consent, not from a
    # stale "yes" the user gave before disconnecting.
    user_row = await db.get(User, uid)
    if user_row is not None:
        prof = dict(user_row.profile or {})
        if prof.pop("gcal_routine_sync", None) is not None or prof.pop("gcal_busy_fp", None) is not None:
            user_row.profile = prof
            flag_modified(user_row, "profile")

    await db.commit()

    # Their plans were shaped around calendar events we can no longer see —
    # reclaim that time.
    try:
        from services.schedule_runtime import regenerate_active_schedules
        await regenerate_active_schedules(user_id=uid, db=db, reason="calendar_disconnected")
        await db.commit()
    except Exception:
        pass

    # routine_calendar_left: we couldn't delete the "Superpower" calendar (Google
    # had already cut our access). The app tells the user they can delete it.
    return {"disconnected": True, "routine_calendar_left": not calendar_removed}


@router.post("/routine-sync")
async def set_routine_sync(
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Turn the "put my routine on Google Calendar" mirror on or off."""
    uid = _uid(current_user)
    enabled = bool(payload.get("enabled"))

    conn = (await db.execute(
        select(CalendarConnection).where(
            (CalendarConnection.user_id == uid)
            & (CalendarConnection.provider == "google")
            & (CalendarConnection.is_active.is_(True))
        )
    )).scalars().first()

    if enabled:
        if not getattr(settings, "gcal_write_enabled", False):
            raise HTTPException(status_code=503, detail="Routine sync is not available yet.")
        if conn is None:
            raise HTTPException(status_code=409, detail="Connect Google Calendar first.")
        if SCOPE_CALENDAR_APP not in str((conn.tokens_decrypted or {}).get("scope") or ""):
            # The client should re-run consent with include_write=true.
            raise HTTPException(status_code=409, detail="needs_write_scope")

    user_row = await db.get(User, uid)
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")
    prof = dict(user_row.profile or {})
    prof["gcal_routine_sync"] = enabled
    user_row.profile = prof
    flag_modified(user_row, "profile")
    await db.commit()

    if enabled:
        try:
            from services.gcal_mirror import kick_gcal_mirror
            kick_gcal_mirror(str(uid), delay=0.5)
        except Exception:
            pass
    elif conn is not None:
        # Opting out removes the calendar — leaving a frozen copy of a routine
        # that no longer updates would be worse than none at all.
        try:
            from services.gcal_mirror import teardown_mirror
            access = await _fresh_access_token(conn, db)
            await teardown_mirror(str(uid), conn, access, db)
            await db.commit()
        except Exception:
            pass

    return {"routine_sync_enabled": enabled}


@router.post("/mirror")
async def mirror_now(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Force a reconcile now (support/debug parity with POST /sync)."""
    from services.gcal_mirror import mirror_user_calendar
    return await mirror_user_calendar(str(_uid(current_user)), db)


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

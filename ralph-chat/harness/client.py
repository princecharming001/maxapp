"""client.py — faux-user mint + authed chat client for the ralph-chat harness.

Talks to the LOCAL backend on http://localhost:8002/api (never prod). Each
minted user gets a unique X-Forwarded-For so it lands in its own rate-limit
bucket — the limiter (backend/middleware/rate_limit.py) keys on the first XFF
hop and trusts it (local-dev-only affordance; flagged in DEPLOY_NOTES.md as a
prod hardening item since it means the limiter isn't really per-authenticated-
user in production either).

No retries on send_turn: a timeout, 5xx, or malformed response IS a finding,
not something to paper over by trying again.
"""
from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

BASE_URL = "http://localhost:8002/api"
TURN_TIMEOUT_S = 120.0
MIN_TURN_GAP_S = 1.5  # per-user pacing, keeps us far under the 60/min/bucket cap

_xff_counter = itertools.count(10)  # 198.51.100.10, .11, .12, ... (TEST-NET-2)


@dataclass
class FauxUser:
    kind: str  # "fresh" | "skip"
    token: str
    xff: str
    user_id: Optional[str] = None
    _last_turn_at: float = field(default=0.0, repr=False)

    def headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "X-Forwarded-For": self.xff,
            "Content-Type": "application/json",
        }


async def mint_user(client: httpx.AsyncClient, kind: str) -> FauxUser:
    """kind: 'fresh' (empty onboarding, unpaid) or 'skip' (paid, onboarded)."""
    assert kind in ("fresh", "skip"), f"unknown faux user kind: {kind}"
    xff = f"198.51.100.{next(_xff_counter)}"
    resp = await client.post(
        f"{BASE_URL}/auth/faux-signup-{kind}",
        json={},
        headers={"X-Forwarded-For": xff},
        timeout=30.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return FauxUser(kind=kind, token=data["access_token"], xff=xff)


async def new_conversation(client: httpx.AsyncClient, user: FauxUser, title: str = "") -> str:
    resp = await client.post(
        f"{BASE_URL}/chat/conversations",
        json={"title": title} if title else {},
        headers=user.headers(),
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["conversation"]["id"]


@dataclass
class TurnResult:
    ok: bool
    status_code: int
    latency_s: float
    body: dict = field(default_factory=dict)
    error: Optional[str] = None


async def send_turn(
    client: httpx.AsyncClient,
    user: FauxUser,
    message: str,
    *,
    conversation_id: Optional[str] = None,
    init_context: Optional[str] = None,
    chat_intent: Optional[str] = None,
    reply_to_message_id: Optional[str] = None,
) -> TurnResult:
    # Per-user pacing so battery concurrency never trips the per-user chat lock
    # into pathological queueing or brushes the 60/min bucket.
    gap = time.monotonic() - user._last_turn_at
    if user._last_turn_at and gap < MIN_TURN_GAP_S:
        import asyncio

        await asyncio.sleep(MIN_TURN_GAP_S - gap)

    payload: dict[str, Any] = {"message": message}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    if init_context:
        payload["init_context"] = init_context
    if chat_intent:
        payload["chat_intent"] = chat_intent
    if reply_to_message_id:
        payload["reply_to_message_id"] = reply_to_message_id

    t0 = time.monotonic()
    try:
        resp = await client.post(
            f"{BASE_URL}/chat/message",
            json=payload,
            headers=user.headers(),
            timeout=TURN_TIMEOUT_S,
        )
    except httpx.TimeoutException:
        latency = time.monotonic() - t0
        user._last_turn_at = time.monotonic()
        return TurnResult(ok=False, status_code=0, latency_s=latency, error="timeout")
    except httpx.RequestError as e:
        latency = time.monotonic() - t0
        user._last_turn_at = time.monotonic()
        return TurnResult(ok=False, status_code=0, latency_s=latency, error=f"request_error: {e}")

    latency = time.monotonic() - t0
    user._last_turn_at = time.monotonic()

    if resp.status_code != 200:
        return TurnResult(
            ok=False,
            status_code=resp.status_code,
            latency_s=latency,
            body=_safe_json(resp),
            error=f"http_{resp.status_code}",
        )
    return TurnResult(ok=True, status_code=200, latency_s=latency, body=resp.json())


def _safe_json(resp: httpx.Response) -> dict:
    try:
        return resp.json()
    except Exception:
        return {"_raw_text": resp.text[:500]}


async def get_history(client: httpx.AsyncClient, user: FauxUser, conversation_id: Optional[str] = None) -> dict:
    params = {"limit": 200}
    if conversation_id:
        params["conversation_id"] = conversation_id
    resp = await client.get(
        f"{BASE_URL}/chat/history", params=params, headers=user.headers(), timeout=30.0
    )
    resp.raise_for_status()
    return resp.json()

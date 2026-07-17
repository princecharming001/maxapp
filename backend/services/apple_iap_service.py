"""
Apple App Store Server API — fetch and decode subscription transactions for IAP verification.
Docs: https://developer.apple.com/documentation/appstoreserverapi
"""

from __future__ import annotations

import base64
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import jwt
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

from config import settings

logger = logging.getLogger(__name__)

PRODUCTION_API = "https://api.storekit.itunes.apple.com"
SANDBOX_API = "https://api.storekit-sandbox.itunes.apple.com"


def _normalize_p8(raw: str) -> str:
    """Reconstruct a valid PEM from env-var mangled .p8 key content."""
    s = (raw or "").strip()
    if not s:
        return ""
    if "\\n" in s:
        s = s.replace("\\n", "\n")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    if not s.startswith("-----"):
        try:
            s = base64.b64decode(s).decode("utf-8").strip()
        except Exception:
            pass
    header = "-----BEGIN PRIVATE KEY-----"
    footer = "-----END PRIVATE KEY-----"
    if "-----BEGIN" not in s:
        # Raw base64 key material without PEM framing — wrap it.
        body = s.replace("\n", "").replace(" ", "").strip()
        lines = [body[i:i+64] for i in range(0, len(body), 64)]
        return header + "\n" + "\n".join(lines) + "\n" + footer + "\n"
    body = s.replace(header, "").replace(footer, "")
    body = body.replace("\n", "").replace(" ", "").strip()
    lines = [body[i:i+64] for i in range(0, len(body), 64)]
    return header + "\n" + "\n".join(lines) + "\n" + footer + "\n"


def _load_iap_private_key(pem_text: str):
    """Parse a PEM private key string into a cryptography key object."""
    return serialization.load_pem_private_key(
        pem_text.encode("utf-8"),
        password=None,
        backend=default_backend(),
    )


def apple_iap_configured() -> bool:
    if not (
        settings.apple_app_store_connect_issuer_id.strip()
        and settings.apple_app_store_connect_key_id.strip()
    ):
        return False
    pem = _normalize_p8(settings.apple_app_store_connect_private_key)
    if not pem.strip():
        return False
    try:
        _load_iap_private_key(pem)
        return True
    except Exception as exc:
        logger.warning("apple_iap_configured: PEM key present but invalid (%s); treating as not configured", exc)
        return False


def _create_bearer_token() -> str:
    """ES256 JWT for App Store Server API (In-App Purchase key)."""
    pem = _normalize_p8(settings.apple_app_store_connect_private_key)
    key = _load_iap_private_key(pem)
    now = int(time.time())
    payload = {
        "iss": settings.apple_app_store_connect_issuer_id.strip(),
        "iat": now,
        "exp": now + 1200,
        "aud": "appstoreconnect-v1",
        "bid": settings.apple_bundle_id.strip(),
    }
    headers = {"alg": "ES256", "kid": settings.apple_app_store_connect_key_id.strip(), "typ": "JWT"}
    return jwt.encode(payload, key, algorithm="ES256", headers=headers)


def decode_jws_payload_unverified(jws: str) -> Dict[str, Any]:
    """Decode JWS payload (middle segment). Caller must trust source or verify separately."""
    parts = (jws or "").split(".")
    if len(parts) < 2:
        raise ValueError("invalid_jws")
    payload_b64 = parts[1]
    pad = 4 - len(payload_b64) % 4
    if pad != 4:
        payload_b64 += "=" * pad
    raw = base64.urlsafe_b64decode(payload_b64)
    return json.loads(raw.decode("utf-8"))


def tier_for_product_id(product_id: str) -> Optional[str]:
    pid = (product_id or "").strip()
    basic = settings.apple_iap_product_id_basic.strip()
    premium = settings.apple_iap_product_id_premium.strip()
    if pid == premium:
        return "premium"
    if pid == basic:
        # Chad Lite is RETIRED (single-plan pivot, 2026-07): legacy Lite
        # subscribers are grandfathered into Chad at their old price. Mapping
        # the basic SKU to premium here means every entitlement path — ASN
        # webhooks, verify, the reconciliation job — converges Lite renewals to
        # the premium tier instead of downgrading them back on the next event.
        return "premium"
    return None


def expires_datetime_from_claims(claims: Dict[str, Any]) -> Optional[datetime]:
    """Apple uses milliseconds since epoch in expiresDate."""
    raw = claims.get("expiresDate")
    if raw is None:
        return None
    try:
        ms = int(raw)
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return None


def subscription_active_from_claims(claims: Dict[str, Any]) -> bool:
    exp = expires_datetime_from_claims(claims)
    if exp is None:
        return True
    return datetime.utcnow() < exp


async def fetch_transaction_claims(transaction_id: str) -> Dict[str, Any]:
    """
    Call GET /inApps/v1/transactions/{transactionId} and decode signedTransactionInfo.
    Tries sandbox/production order based on settings and falls back.
    """
    if not apple_iap_configured():
        raise RuntimeError("Apple IAP is not configured (missing issuer/key/p8)")

    tid = (transaction_id or "").strip()
    if not tid:
        raise ValueError("transaction_id required")

    token = _create_bearer_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    order: List[str]
    prefer_sandbox = settings.apple_iap_force_sandbox_api or settings.app_env.strip().lower() != "production"
    if prefer_sandbox:
        order = [SANDBOX_API, PRODUCTION_API]
    else:
        order = [PRODUCTION_API, SANDBOX_API]

    last_err: Optional[str] = None
    async with httpx.AsyncClient(http2=True, timeout=30.0) as client:
        for base in order:
            url = f"{base}/inApps/v1/transactions/{tid}"
            try:
                r = await client.get(url, headers=headers)
                if r.status_code == 404:
                    last_err = f"{base} 404"
                    continue
                r.raise_for_status()
                data = r.json()
                signed = data.get("signedTransactionInfo")
                if not signed:
                    raise ValueError("missing signedTransactionInfo")
                claims = decode_jws_payload_unverified(signed)
                return claims
            except httpx.HTTPStatusError as e:
                last_err = f"{base} HTTP {e.response.status_code}"
                logger.warning("Apple transaction fetch failed: %s", last_err)
            except Exception as e:
                last_err = str(e)
                logger.warning("Apple transaction fetch error: %s", e)

    raise RuntimeError(last_err or "Apple transaction lookup failed")


def account_token_matches(claims: Dict[str, Any], expected_user_id: str) -> Optional[bool]:
    """Does this transaction's appAccountToken belong to `expected_user_id`?

    Returns True (match), False (bound to a DIFFERENT app account), or None when
    the transaction carries no token at all (legacy purchases — always tolerated).
    A False is NOT automatically fatal: an Apple ID's subscription legitimately
    outlives the app account that bought it (new phone, reinstall, fresh signup),
    so the caller decides based on whether anyone else actually holds it.
    """
    token = claims.get("appAccountToken")
    if not token:
        return None
    return str(token).lower() == str(expected_user_id).lower()


def validate_claims_for_user(claims: Dict[str, Any], expected_user_id: str) -> None:
    """Hard validation: the transaction must be OUR app's.

    NOTE: the appAccountToken is deliberately NOT enforced here. It used to raise
    `account_token_mismatch`, which permanently stranded paying users whose Apple
    ID owned an active subscription bought under a different app account — the
    client retried forever and could never be granted (observed in prod
    2026-07-17). Callers now use `account_token_matches()` + an ownership check so
    an UNCLAIMED subscription can be adopted while one that is actively held by
    another account is still refused.
    """
    bundle = (claims.get("bundleId") or claims.get("bundle_id") or "").strip()
    expected_bundle = settings.apple_bundle_id.strip()
    if bundle and expected_bundle and bundle != expected_bundle:
        raise ValueError("bundle_mismatch")


def decode_notification_payload(signed_payload: str) -> Dict[str, Any]:
    """Outer ASN V2 signedPayload JWS → JSON object with notificationType, data, etc."""
    return decode_jws_payload_unverified(signed_payload)


def decode_notification_transaction(signed_transaction_info: str) -> Dict[str, Any]:
    return decode_jws_payload_unverified(signed_transaction_info)

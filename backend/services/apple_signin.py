"""
Sign in with Apple — verify the identity token Apple hands the iOS client.

Mirrors services/google_integration.py: verify the RS256 JWT locally against
Apple's published JWKS, checking issuer + audience (our bundle id). No secrets
required for identity-token verification — Apple's keys are public and the
audience is our app's bundle id, so this works out of the box on iOS.
"""
from __future__ import annotations

import asyncio
import logging

from config import settings

logger = logging.getLogger(__name__)

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


def apple_signin_client_ids() -> list[str]:
    """Valid `aud` values. For a native iOS app the identity token's audience
    is the app bundle id. Allow an optional extra Services ID (web) via env."""
    ids = [settings.apple_bundle_id.strip()]
    extra = (getattr(settings, "apple_signin_services_id", "") or "").strip()
    if extra:
        ids.append(extra)
    return [i for i in ids if i]


def apple_signin_available() -> bool:
    return bool(apple_signin_client_ids())


_jwks_client = None  # lazily built; PyJWKClient caches keys internally


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        from jwt import PyJWKClient
        _jwks_client = PyJWKClient(APPLE_JWKS_URL)
    return _jwks_client


def _verify_apple_id_token_sync(token: str) -> dict:
    """Verify an Apple identity token (RS256 against Apple's JWKS) and return
    its claims. Raises ValueError on any failure."""
    import jwt as pyjwt  # PyJWT, distinct from the python-jose `jwt` in auth.py

    audiences = apple_signin_client_ids()
    if not audiences:
        raise ValueError("Sign in with Apple is not configured")
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    claims = pyjwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=audiences,
        issuer=APPLE_ISSUER,
        options={"require": ["exp", "iss", "sub", "aud"]},
    )
    return claims


async def verify_apple_id_token(token: str) -> dict:
    """Async verify. Returns the validated claims dict. Apple includes `sub`
    (stable user id) always; `email` only on the FIRST authorization (and it
    may be a private-relay address). Name is NOT in the token — the client
    passes it separately, and only on first sign-in."""
    try:
        return await asyncio.to_thread(_verify_apple_id_token_sync, token)
    except Exception as e:  # PyJWT raises many subclasses; normalize to ValueError
        raise ValueError(f"Invalid Apple identity token: {e}") from e

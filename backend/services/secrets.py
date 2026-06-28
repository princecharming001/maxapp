"""
App-level Fernet encryption for OAuth refresh tokens stored at rest.

If ENCRYPTION_KEY is not set, functions are pass-through no-ops so
dev/tests work without any key configured.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)
_warned = False
_fernet = None


def _get_fernet():
    global _fernet, _warned
    if _fernet is not None:
        return _fernet
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        if not _warned:
            logger.warning(
                "ENCRYPTION_KEY is not set — OAuth tokens stored as plaintext. "
                "Set a Fernet key in production."
            )
            _warned = True
        return None
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception as exc:
        logger.error("Failed to initialize Fernet with ENCRYPTION_KEY: %s", exc)
        return None


def encrypt_token(plaintext: str) -> bytes:
    """Encrypt a token string. Returns ciphertext bytes, or plaintext bytes if no key."""
    f = _get_fernet()
    if f is None:
        return plaintext.encode()
    return f.encrypt(plaintext.encode())


def decrypt_token(data: bytes) -> str:
    """Decrypt ciphertext bytes back to a string. Falls back to plain decode if no key."""
    f = _get_fernet()
    if f is None:
        return data.decode()
    try:
        return f.decrypt(data).decode()
    except Exception:
        # Fallback: maybe the data was stored as plaintext (pre-encryption row)
        return data.decode()

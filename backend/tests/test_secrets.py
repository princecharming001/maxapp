"""Tests for services/secrets.py — round-trip with a key; pass-through without."""
import importlib
import os

import pytest


def _reload_secrets(monkeypatch, key: str | None):
    """Reload the secrets module with a given ENCRYPTION_KEY env var."""
    if key is None:
        monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    else:
        monkeypatch.setenv("ENCRYPTION_KEY", key)
    import services.secrets as s
    # Reset module-level state so each test is isolated
    s._fernet = None
    s._warned = False
    importlib.reload(s)
    return s


def _make_fernet_key() -> str:
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()


def test_round_trip_with_key(monkeypatch):
    key = _make_fernet_key()
    s = _reload_secrets(monkeypatch, key)
    plaintext = '{"refresh_token": "tok_abc123", "access_token": "acc"}'
    ciphertext = s.encrypt_token(plaintext)
    assert ciphertext != plaintext.encode(), "Should be encrypted"
    assert s.decrypt_token(ciphertext) == plaintext


def test_passthrough_without_key(monkeypatch):
    s = _reload_secrets(monkeypatch, None)
    plaintext = '{"refresh_token": "tok_xyz"}'
    result = s.encrypt_token(plaintext)
    assert result == plaintext.encode(), "Without key, encrypt returns plain bytes"
    assert s.decrypt_token(result) == plaintext


def test_different_values_encrypt_differently(monkeypatch):
    key = _make_fernet_key()
    s = _reload_secrets(monkeypatch, key)
    a = s.encrypt_token("token_a")
    b = s.encrypt_token("token_b")
    assert a != b

"""Account-after-scan: anon-account helpers + the claim security gate.

The claim endpoint must ONLY ever touch unclaimed (anon-email) accounts — that
gate (`_is_anonymous_email`) is the thing standing between "set up a fresh account"
and "overwrite a real credentialed user", so it's worth pinning down precisely.
"""
from api.auth import _is_anonymous_email, _new_anon_identity, ANON_EMAIL_DOMAIN


def test_anon_identity_reserved_unique_and_unusable():
    e1, u1, p1 = _new_anon_identity()
    e2, u2, p2 = _new_anon_identity()
    assert e1.endswith("@" + ANON_EMAIL_DOMAIN)
    assert u1.startswith("anon_")
    # unique per call (no collisions) and a long random (unusable) password
    assert e1 != e2 and u1 != u2 and p1 != p2
    assert len(p1) >= 24


def test_only_anon_emails_are_claimable():
    assert _is_anonymous_email(f"anon_abc@{ANON_EMAIL_DOMAIN}") is True
    assert _is_anonymous_email(f"ANON_ABC@{ANON_EMAIL_DOMAIN.upper()}") is True  # case-insensitive
    # real accounts are NOT claimable — claim() must 400 these
    assert _is_anonymous_email("real.user@gmail.com") is False
    assert _is_anonymous_email("") is False
    assert _is_anonymous_email(None) is False
    # lookalike / subdomain domains must NOT be mistaken for the reserved one
    assert _is_anonymous_email("x@evil-anon.maxapp.invalid.com") is False
    assert _is_anonymous_email("x@sub.anon.maxapp.invalid") is False

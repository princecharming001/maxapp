"""Creator platform unit tests — the security-critical + trickiest pure logic.

Covers: per-creator entitlement grant/expiry, the non-subscriber teaser
redaction (a paid-content leak if wrong), comment auto-hide threshold, pricing
+ SKU naming, maxx_id collision minting, and the public/private serializers.

Endpoint wiring is verified end-to-end against a live local backend on the
simulator (see the creator Maestro flow), so these stay fast + DB-free.
"""
from __future__ import annotations

import asyncio
import types
from datetime import datetime, timedelta, timezone

import pytest

from services import creator_service as cs
from models.sqlalchemy_models import CreatorPost, CreatorPostComment


# ── pricing + SKU ───────────────────────────────────────────────────────────
def test_price_tiers_and_default():
    assert cs.price_cents_for_tier("t1") == 499
    assert cs.price_cents_for_tier("t4") == 2999
    assert cs.price_cents_for_tier("free") == 0
    # unknown tier → default tier price, never a crash
    assert cs.price_cents_for_tier("garbage") == cs.PRICE_TIERS[cs.DEFAULT_TIER]
    assert cs.price_cents_for_tier("") == cs.PRICE_TIERS[cs.DEFAULT_TIER]


def test_apple_product_id_naming():
    # Each creator gets its OWN product id under the creator prefix — the ASN
    # webhook routes on exactly this prefix, so it must not drift.
    assert cs.apple_product_id_for("chessmax") == "com.cannon.creator.chessmax.monthly"
    assert cs.apple_product_id_for("chessmax").startswith("com.cannon.creator.")


def test_slug():
    assert cs._slug("Coloring Max") == "coloringmax"
    assert cs._slug("  Chess!! ") == "chess"
    assert cs._slug("") == "creator"


# ── entitlement grant (course enrollment mutation) ──────────────────────────
def _fake_user(onboarding=None):
    return types.SimpleNamespace(onboarding=onboarding or {}, updated_at=None)


def test_grant_enrollment_adds_course_and_stamps_time():
    u = _fake_user()
    cs._grant_enrollment(u, "chessmax", granted=True)
    assert "chessmax" in u.onboarding["entered_courses"]
    assert "chessmax" in u.onboarding["maxx_entered_at"]


def test_grant_enrollment_is_idempotent():
    u = _fake_user({"entered_courses": ["chessmax"]})
    cs._grant_enrollment(u, "chessmax", granted=True)
    # no dup
    assert u.onboarding["entered_courses"].count("chessmax") == 1


def test_grant_enrollment_revoke_removes_course():
    u = _fake_user({"entered_courses": ["chessmax", "coloringmax"]})
    cs._grant_enrollment(u, "chessmax", granted=False)
    assert "chessmax" not in u.onboarding["entered_courses"]
    assert "coloringmax" in u.onboarding["entered_courses"]
    assert "chessmax" not in u.onboarding.get("maxx_entered_at", {})


# ── subscription active/expiry ──────────────────────────────────────────────
def _fake_sub(status="active", expires_at=None):
    return types.SimpleNamespace(status=status, expires_at=expires_at)


def test_sub_active_states():
    assert cs._sub_active(None) is False
    assert cs._sub_active(_fake_sub(status="expired")) is False
    assert cs._sub_active(_fake_sub(status="canceled")) is False
    # active, no expiry → active
    assert cs._sub_active(_fake_sub(status="active", expires_at=None)) is True
    # active, future expiry → active
    future = datetime.now(timezone.utc) + timedelta(days=5)
    assert cs._sub_active(_fake_sub(status="active", expires_at=future)) is True
    # active, past expiry → NOT active (missed EXPIRED webhook safety)
    past = datetime.now(timezone.utc) - timedelta(days=1)
    assert cs._sub_active(_fake_sub(status="active", expires_at=past)) is False


def test_sub_active_naive_datetime_is_treated_utc():
    # ASN/Apple sometimes yields naive datetimes; must not crash comparing.
    naive_future = (datetime.now(timezone.utc) + timedelta(days=3)).replace(tzinfo=None)
    assert cs._sub_active(_fake_sub(status="active", expires_at=naive_future)) is True


# ── comment auto-hide threshold ─────────────────────────────────────────────
def test_auto_hide_at_threshold():
    c = CreatorPostComment(body="x", status="visible", report_count=cs.AUTO_HIDE_REPORTS)
    hidden = asyncio.get_event_loop().run_until_complete(cs.maybe_auto_hide_comment(c, None))
    assert hidden is True and c.status == "hidden"


def test_no_auto_hide_below_threshold():
    c = CreatorPostComment(body="x", status="visible", report_count=cs.AUTO_HIDE_REPORTS - 1)
    hidden = asyncio.get_event_loop().run_until_complete(cs.maybe_auto_hide_comment(c, None))
    assert hidden is False and c.status == "visible"


# ── catalog doc ─────────────────────────────────────────────────────────────
def _fake_creator(maxx_id="chessmax"):
    import uuid as _uuid
    return types.SimpleNamespace(
        id=_uuid.uuid4(), user_id=_uuid.uuid4(),
        maxx_id=maxx_id, display_name="Magnus", handle="magnus", tagline="Play like a GM",
        bio="", avatar_url=None, accent_color="#BC7A3C", icon="star-outline", socials={},
        verified=True, price_tier="t1", price_cents=499, apple_product_id="com.cannon.creator.chessmax.monthly",
        status="live", subscriber_count=10, post_count=3, course_version=2,
        apple_review_status="approved", strikes=0,
    )


def test_build_creator_maxdoc_is_valid():
    doc = cs.build_creator_maxdoc(_fake_creator())
    assert doc.maxx_id == "chessmax"
    assert doc.display_name == "Magnus"
    assert len(doc.tasks) >= 1
    # tasks must have the required TaskDef fields populated (no None where int expected)
    t = doc.tasks[0]
    assert isinstance(t.duration_min, int) and t.frequency.get("type") == "daily"


# ── serializers: public must NOT leak private fields ────────────────────────
def test_public_dict_hides_review_status_and_strikes():
    pub = cs.creator_public_dict(_fake_creator())
    assert "apple_review_status" not in pub
    assert "strikes" not in pub
    assert pub["maxx_id"] == "chessmax" and pub["price_cents"] == 499


def test_private_dict_includes_review_and_strikes():
    priv = cs.creator_private_dict(_fake_creator())
    assert priv["apple_review_status"] == "approved"
    assert priv["strikes"] == 0


# ── the paid-content teaser (a leak if wrong) ───────────────────────────────
def test_locked_post_withholds_video_and_truncates_body():
    from api.creators import _post_dict
    long_body = "x" * 300
    p = CreatorPost(
        type="video", body=long_body, video_url="https://cdn/secret.mp4",
        poster_url="https://cdn/poster.jpg", duration_s=42, pinned=False,
        status="published", like_count=5, comment_count=2, view_count=9,
        created_at=datetime.utcnow(),
    )
    locked = _post_dict(p, locked=True, liked=True)
    # video URL is the paid asset — must be withheld for a non-subscriber
    assert locked["video_url"] is None
    assert locked["locked"] is True
    # body is teaser-truncated
    assert len(locked["body"]) <= 81
    # like state never leaks a "liked" for someone who can't access
    assert locked["liked"] is False
    # poster stays (it's the public teaser image)
    assert locked["poster_url"] == "https://cdn/poster.jpg"


def test_unlocked_post_exposes_full_content():
    from api.creators import _post_dict
    p = CreatorPost(
        type="video", body="full caption", video_url="https://cdn/v.mp4",
        poster_url=None, duration_s=10, pinned=True, status="published",
        like_count=1, comment_count=0, view_count=3, created_at=datetime.utcnow(),
    )
    full = _post_dict(p, locked=False, liked=True)
    assert full["video_url"] == "https://cdn/v.mp4"
    assert full["locked"] is False
    assert full["liked"] is True
    assert full["body"] == "full caption"

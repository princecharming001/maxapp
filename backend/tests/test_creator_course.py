"""Creator course — the new subscriber read-path + studio authoring logic.

Pure-logic tests in the house style of test_creator_platform.py (SimpleNamespace
fakes, no DB): the lock/redaction rules (a paid-content leak if wrong), module
grouping + titles, the go-live checklist (must mirror the go_live gate), and the
AI-assist JSON parsers (LLM output is untrusted input).
"""
from __future__ import annotations

import types

from services import creator_service as cs


def _lesson(**kw):
    base = dict(
        id="11111111-1111-1111-1111-111111111111",
        module_number=1,
        sort=0,
        title="Lesson",
        subtitle="sub",
        icon="book-outline",
        duration_minutes=5,
        is_free_preview=False,
        body_md="SECRET BODY",
        video_url="https://cdn/vid.mp4",
        poster_url="https://cdn/poster.jpg",
        status="published",
    )
    base.update(kw)
    return types.SimpleNamespace(**base)


# ── locking ─────────────────────────────────────────────────────────────────
def test_locked_without_access():
    assert cs.lesson_locked(_lesson(), has_access=False) is True


def test_unlocked_with_access():
    assert cs.lesson_locked(_lesson(), has_access=True) is False


def test_free_preview_unlocks_without_access():
    assert cs.lesson_locked(_lesson(is_free_preview=True), has_access=False) is False


# ── redaction (the leak test) ───────────────────────────────────────────────
def test_locked_dict_withholds_content():
    d = cs.lesson_public_dict(_lesson(), locked=True)
    assert d["body_md"] == "" and d["video_url"] is None
    # ...but the outline still sells the course
    assert d["title"] == "Lesson" and d["subtitle"] == "sub"
    assert d["has_video"] is True  # the tease: "there IS a video here"
    assert d["locked"] is True


def test_unlocked_dict_carries_content():
    d = cs.lesson_public_dict(_lesson(), locked=False)
    assert d["body_md"] == "SECRET BODY"
    assert d["video_url"] == "https://cdn/vid.mp4"
    assert d["locked"] is False


# ── module grouping ─────────────────────────────────────────────────────────
def test_grouping_orders_modules_and_sorts_lessons():
    lessons = [
        _lesson(id="b", module_number=2, sort=0, title="B"),
        _lesson(id="a2", module_number=1, sort=1, title="A2"),
        _lesson(id="a1", module_number=1, sort=0, title="A1"),
    ]
    mods = cs.group_lessons_into_modules(lessons, {"1": {"title": "Start"}}, has_access=True)
    assert [m["module_number"] for m in mods] == [1, 2]
    assert mods[0]["title"] == "Start" and mods[1]["title"] == ""
    assert [l["title"] for l in mods[0]["lessons"]] == ["A1", "A2"]


def test_grouping_applies_lock_per_lesson():
    lessons = [
        _lesson(id="x", title="Paid"),
        _lesson(id="y", title="Free", is_free_preview=True),
    ]
    mods = cs.group_lessons_into_modules(lessons, None, has_access=False)
    by_title = {l["title"]: l for l in mods[0]["lessons"]}
    assert by_title["Paid"]["locked"] is True and by_title["Paid"]["body_md"] == ""
    assert by_title["Free"]["locked"] is False and by_title["Free"]["body_md"] == "SECRET BODY"


# ── checklist (must mirror the go_live gate) ────────────────────────────────
def _creator(**kw):
    base = dict(
        tagline="t", bio="b", avatar_url="http://a",
        apple_review_status="none", price_tier="t1", status="onboarding",
    )
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_checklist_ready_when_required_done():
    out = cs.compute_checklist(
        _creator(), published_posts=1, published_lessons=0, is_production=False,
        active_habits=3,
    )
    assert out["can_go_live"] is True          # post ✓, review ✓ (non-prod), habits ✓
    lesson = next(i for i in out["items"] if i["key"] == "lesson")
    assert lesson["done"] is False and lesson["required"] is False  # recommended only


def test_checklist_blocks_without_intro_post():
    out = cs.compute_checklist(
        _creator(), published_posts=0, published_lessons=3, is_production=False,
        active_habits=3,
    )
    assert out["can_go_live"] is False


def test_checklist_prod_paid_requires_apple_approved():
    # "none" must NOT pass in production for a paid tier (unbuyable listing).
    out = cs.compute_checklist(
        _creator(apple_review_status="none"), published_posts=1, published_lessons=0,
        is_production=True, active_habits=3,
    )
    assert out["can_go_live"] is False
    ok = cs.compute_checklist(
        _creator(apple_review_status="approved"), published_posts=1, published_lessons=0,
        is_production=True, active_habits=3,
    )
    assert ok["can_go_live"] is True


def test_checklist_prod_free_tier_skips_apple():
    out = cs.compute_checklist(
        _creator(price_tier="free", apple_review_status="none"),
        published_posts=1, published_lessons=0, is_production=True,
        active_habits=3,
    )
    assert out["can_go_live"] is True


# ── AI assist parsers (untrusted model output) ──────────────────────────────
def test_outline_parses_and_clips():
    raw = '{"modules":[{"title":"M1","lessons":[{"title":"L1","subtitle":"s"},{"title":"L2"}]}]}'
    out = cs.parse_outline_json(raw)
    assert out is not None
    assert out["modules"][0]["title"] == "M1"
    assert [l["title"] for l in out["modules"][0]["lessons"]] == ["L1", "L2"]
    assert out["modules"][0]["lessons"][1]["subtitle"] == ""


def test_outline_strips_code_fences():
    raw = '```json\n{"modules":[{"title":"M","lessons":[{"title":"L"}]}]}\n```'
    assert cs.parse_outline_json(raw) is not None


def test_outline_rejects_garbage_and_empty():
    assert cs.parse_outline_json("not json at all") is None
    assert cs.parse_outline_json('{"modules": []}') is None
    assert cs.parse_outline_json('{"modules": [{"title": "", "lessons": []}]}') is None


def test_outline_clips_oversize():
    mods = [{"title": f"M{i}", "lessons": [{"title": f"L{j}"} for j in range(20)]} for i in range(10)]
    import json
    out = cs.parse_outline_json(json.dumps({"modules": mods}))
    assert out is not None
    assert len(out["modules"]) <= 6
    assert all(len(m["lessons"]) <= 10 for m in out["modules"])


def test_lesson_draft_requires_substance():
    assert cs.parse_lesson_draft_json('{"subtitle":"s","body_md":"too short"}') is None
    ok = cs.parse_lesson_draft_json(
        '{"subtitle":"s","body_md":"' + "A real lesson body. " * 10 + '"}'
    )
    assert ok is not None and ok["subtitle"] == "s"
    assert len(ok["body_md"]) > 40


def test_lesson_draft_rejects_garbage():
    assert cs.parse_lesson_draft_json("nope") is None
    assert cs.parse_lesson_draft_json('["array"]') is None

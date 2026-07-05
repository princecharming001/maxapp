"""Creator habits → catalog TaskDefs + synthesized skeleton.

THE risk of the creator-maxx pivot: build_creator_maxdoc synthesizes a
schedule_design for a system built around hand-authored docs. A malformed
skeleton fails schedule generation for PAYING subscribers — so these tests
push the synthesized doc all the way through has_skeleton + expand_skeleton
(the real deterministic expander), not just shape-checks.
"""
from __future__ import annotations

import types
import uuid

import pytest

from services import creator_service as cs
from services import task_catalog_service as tcs
from services.schedule_skeleton import expand_skeleton, has_skeleton


def _creator(maxx_id="testmax", display_name="Test Creator", tagline="tag"):
    return types.SimpleNamespace(
        maxx_id=maxx_id, display_name=display_name, tagline=tagline,
        art_url=None, art_status="none", habits_version=1,
    )


_SORT_SEQ = iter(range(10_000))


def _habit(slug, title=None, *, window="any", freq="daily", n=1, dur=10, sort=None, status="active"):
    # Explicit, unique sort per fixture (the API always writes sort=i; a tie
    # here would fall back to uuid ordering → nondeterministic test).
    return types.SimpleNamespace(
        id=uuid.uuid4(), slug=slug, title=title or slug.replace("_", " ").title(),
        description="desc", duration_minutes=dur, frequency_type=freq,
        frequency_n=n, window=window, icon=None,
        sort=next(_SORT_SEQ) if sort is None else sort, status=status,
    )


@pytest.fixture(autouse=True)
def _catalog_isolation():
    """These tests register synthetic docs into the GLOBAL catalog cache —
    snapshot + restore so they can't perturb other test files (or be perturbed
    by suite ordering)."""
    before = dict(tcs._CACHE)
    yield
    tcs._CACHE.clear()
    tcs._CACHE.update(before)


def _register(creator, habits):
    tcs.register_doc(cs.build_creator_maxdoc(creator, habits))


def _expand(maxx_id, days=14):
    return expand_skeleton(
        maxx_id=maxx_id, user_state={}, wake="07:00", sleep="23:00",
        cadence_days=days,
    )


# ── doc shape ────────────────────────────────────────────────────────────────
def test_no_habits_keeps_single_task_fallback():
    doc = cs.build_creator_maxdoc(_creator("fbmax"), None)
    assert [t.id for t in doc.tasks] == ["fbmax_daily"]
    assert doc.schedule_design == {}


def test_habits_become_namespaced_taskdefs():
    doc = cs.build_creator_maxdoc(_creator(), [
        _habit("morning_walk", window="morning"),
        _habit("night_review", window="evening"),
    ])
    assert [t.id for t in doc.tasks] == ["testmax.morning_walk", "testmax.night_review"]
    by_id = {t.id: t for t in doc.tasks}
    assert by_id["testmax.morning_walk"].default_window == "morning"
    assert by_id["testmax.night_review"].default_window == "evening"
    blocks = doc.schedule_design["skeleton"]["blocks"]
    # *_active slots — the expander maps the am_window/pm_window overrides onto
    # am_active/pm_active ONLY (open/close slots would silently ignore them).
    assert [b["slot"] for b in blocks] == ["am_active", "pm_active"]
    assert "am_window" in doc.schedule_design and "pm_window" in doc.schedule_design


def test_checklist_requires_habits_matching_go_live_gate():
    """Checklist/gate parity: go_live now requires 2-8 active habits, so the
    checklist's habits item is REQUIRED and uses the same range."""
    base = dict(published_posts=1, published_lessons=0, is_production=False)
    creator = types.SimpleNamespace(
        tagline="t", bio="b", avatar_url="http://a",
        apple_review_status="none", price_tier="t1", status="onboarding",
    )
    no_habits = cs.compute_checklist(creator, active_habits=0, **base)
    assert no_habits["can_go_live"] is False
    ok = cs.compute_checklist(creator, active_habits=3, **base)
    assert ok["can_go_live"] is True
    too_many = cs.compute_checklist(creator, active_habits=9, **base)
    assert too_many["can_go_live"] is False


def test_habits_carry_the_foundation_tag():
    """REGRESSION: the validator's week-1 on-ramp keeps only ESSENTIAL-tagged
    tasks for chill-effort users. Creator habits without "foundation" made
    week 1 of a PAID creator maxx truncate to zero tasks (found in sim walk)."""
    doc = cs.build_creator_maxdoc(_creator(), [_habit("h1"), _habit("h2")])
    for t in doc.tasks:
        assert "foundation" in t.tags, f"{t.id} missing foundation tag"


def test_archived_habits_are_excluded():
    doc = cs.build_creator_maxdoc(_creator(), [
        _habit("keep"), _habit("gone", status="archived"),
    ])
    assert [t.id for t in doc.tasks] == ["testmax.keep"]


# ── through the REAL expander ────────────────────────────────────────────────
@pytest.mark.parametrize("windows", [["any"], ["morning", "evening"],
                                     ["morning", "evening", "any"] * 2 + ["morning", "any"]])
def test_synthesized_skeleton_expands(windows):
    """1, 2, and 8 habits across all three windows expand to full days."""
    mid = f"exp{len(windows)}max"
    habits = [_habit(f"h{i}", window=w, sort=i) for i, (w) in enumerate(windows)]
    _register(_creator(mid), habits)
    assert has_skeleton(mid) is True
    days = _expand(mid)
    assert len(days) == 14
    # daily habits appear every day, namespaced ids intact
    for d in days:
        ids = [t["catalog_id"] for t in d["tasks"]]
        assert ids, f"day {d['day_index']} empty"
        assert all(i.startswith(mid + ".") for i in ids)
    # every habit shows up somewhere
    seen = {t["catalog_id"] for d in days for t in d["tasks"]}
    assert seen == {f"{mid}.h{i}" for i in range(len(windows))}


def test_n_per_week_cadence_expands_to_fewer_days():
    mid = "cadmax"
    _register(_creator(mid), [
        _habit("daily_one", freq="daily", sort=0),
        _habit("thrice", freq="n_per_week", n=3, sort=1),
    ])
    days = _expand(mid)
    daily_days = sum(1 for d in days if any(t["catalog_id"] == f"{mid}.daily_one" for t in d["tasks"]))
    thrice_days = sum(1 for d in days if any(t["catalog_id"] == f"{mid}.thrice" for t in d["tasks"]))
    assert daily_days == 14
    # 3x/week over 14 days ≈ 6 placements; allow engine jitter but it must be
    # meaningfully fewer than daily and more than zero.
    assert 3 <= thrice_days <= 8


def test_no_habits_doc_has_no_skeleton_path():
    mid = "nohabitmax"
    _register(_creator(mid), [])
    assert has_skeleton(mid) is False  # falls back to the non-skeleton path


# ── slug identity ────────────────────────────────────────────────────────────
def test_mint_habit_slug_stable_and_collision_safe():
    taken: set[str] = set()
    s1 = cs.mint_habit_slug("Morning Walk!", taken); taken.add(s1)
    s2 = cs.mint_habit_slug("Morning Walk!", taken); taken.add(s2)
    assert s1 == "morningwalk" and s2 == "morningwalk2"
    assert cs.habit_catalog_id("m", s1) == "m.morningwalk"


# ── clobber guard ────────────────────────────────────────────────────────────
def test_register_refuses_to_clobber_file_backed_doc():
    """A Creator row colliding with a FILE-backed doc must NOT replace it.
    Uses a synthetic file-backed doc (no warm_catalog / event-loop deps, no
    reliance on suite ordering)."""
    from services.max_doc_loader import MaxDoc
    filedoc = MaxDoc(
        maxx_id="filedocmax", display_name="File Doc", short_description="",
        schedule_design={}, required_fields=[], optional_context=[],
        prompt_modifiers=[], info_schema=[], chunks=[], tasks=[],
        source_path="/data/maxes/filedocmax.md", content_hash="",
    )
    tcs.register_doc(filedoc)
    cs.register_creator_doc(_creator("filedocmax", display_name="Imposter"), [_habit("fake")])
    after = tcs.get_doc("filedocmax")
    assert after is not None
    assert not str(after.source_path).startswith("creator:")
    assert after.display_name == "File Doc"

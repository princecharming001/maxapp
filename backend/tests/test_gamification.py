"""XP + Rank core — pure-logic unit tests (DB-free).

Covers the level curve, rank ladder, additive-only award semantics, the daily
`earned_today` reset, the once/day perfect-day guard + 7-day milestone bonus,
and the hot-endpoint payload. These are the security-adjacent invariants: XP must
be additive-only, never raise, and never double-pay.
"""
from __future__ import annotations

from services import gamification as g


# ── level curve + ranks ──────────────────────────────────────────────────────
def test_level_curve_monotonic_and_capped():
    assert g.xp_for_level(1) == 0
    # strictly increasing until the cap
    prev = -1
    for n in range(1, g.MAX_LEVEL + 1):
        cur = g.xp_for_level(n)
        assert cur >= prev
        prev = cur
    # cap: asking beyond MAX_LEVEL clamps
    assert g.xp_for_level(g.MAX_LEVEL + 50) == g.xp_for_level(g.MAX_LEVEL)


def test_level_from_xp_boundaries():
    assert g.level_from_xp(0) == 1
    assert g.level_from_xp(-100) == 1          # never below 1
    assert g.level_from_xp(g.xp_for_level(2)) == 2
    assert g.level_from_xp(g.xp_for_level(2) - 1) == 1
    assert g.level_from_xp(10 ** 9) == g.MAX_LEVEL  # clamps at the top
    assert g.level_from_xp(None) == 1          # malformed → safe


def test_ranks_ascend():
    assert g.rank_for_level(1) == "Initiate"
    assert g.rank_for_level(10) == "Disciplined"
    assert g.rank_for_level(24) == "Disciplined"
    assert g.rank_for_level(25) == "Forged"
    assert g.rank_for_level(100) == "Apex"


# ── award_xp ─────────────────────────────────────────────────────────────────
def test_award_adds_and_tracks_today():
    p = {}
    r = g.award_xp(p, 15, "2026-07-04")
    assert p[g.XP_KEY] == 15 and r["xp_total"] == 15
    assert p[g.EARNED_TODAY_KEY] == 15
    g.award_xp(p, 50, "2026-07-04")
    assert p[g.XP_KEY] == 65 and p[g.EARNED_TODAY_KEY] == 65


def test_earned_today_resets_on_new_day():
    p = {g.XP_KEY: 100, g.EARNED_TODAY_KEY: 40, g.LAST_AWARD_DATE_KEY: "2026-07-03"}
    g.award_xp(p, 15, "2026-07-04")           # new day
    assert p[g.EARNED_TODAY_KEY] == 15         # reset then added, not 55
    assert p[g.XP_KEY] == 115                   # total is cumulative


def test_award_is_additive_only():
    p = {g.XP_KEY: 100}
    g.award_xp(p, -999, "2026-07-04")          # negative clamped to 0
    assert p[g.XP_KEY] == 100


def test_award_reports_level_gained():
    p = {}
    # jump straight past level 2's threshold
    r = g.award_xp(p, g.xp_for_level(3), "2026-07-04")
    assert r["level_before"] == 1
    assert r["level_after"] == 3
    assert r["level_gained"] == 2


def test_award_never_raises_on_garbage():
    r = g.award_xp(None, 15, "2026-07-04")     # type: ignore[arg-type]
    assert r["level_gained"] == 0


# ── streak / perfect-day XP ──────────────────────────────────────────────────
def test_perfect_day_awards_once_per_day():
    p = {}
    r1 = g.award_streak_xp(p, prev_streak=0, new_streak=1, today_iso="2026-07-04")
    assert r1["xp_awarded"] == g.XP_PERFECT_DAY
    # same day, streak "advances" again (un-check/re-check) → no double pay
    r2 = g.award_streak_xp(p, prev_streak=0, new_streak=1, today_iso="2026-07-04")
    assert r2["xp_awarded"] == 0


def test_milestone_bonus_at_7():
    p = {}
    r = g.award_streak_xp(p, prev_streak=6, new_streak=7, today_iso="2026-07-04")
    assert r["xp_awarded"] == g.XP_PERFECT_DAY + g.XP_STREAK_MILESTONE


def test_no_streak_xp_when_streak_did_not_advance():
    p = {}
    r = g.award_streak_xp(p, prev_streak=5, new_streak=5, today_iso="2026-07-04")
    assert r["xp_awarded"] == 0
    assert not p.get(g.XP_KEY)


# ── hot-endpoint payload ─────────────────────────────────────────────────────
def test_payload_shape_and_stale_today():
    p = {g.XP_KEY: g.xp_for_level(2), g.EARNED_TODAY_KEY: 40, g.LAST_AWARD_DATE_KEY: "2026-07-03"}
    pay = g.gamification_payload(p, "2026-07-04")
    assert pay["current_level"] == 2
    assert pay["rank"] == "Initiate"
    assert pay["xp_earned_today"] == 0          # stale (yesterday) → not shown
    assert pay["xp_for_next_level"] >= 1
    assert pay["current_xp"] == g.xp_for_level(2)


def test_payload_earned_today_when_current():
    p = {g.XP_KEY: 100, g.EARNED_TODAY_KEY: 40, g.LAST_AWARD_DATE_KEY: "2026-07-04"}
    pay = g.gamification_payload(p, "2026-07-04")
    assert pay["xp_earned_today"] == 40

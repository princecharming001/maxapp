"""Tune-your-plan habit picker is driven by the REAL schedule (RALPH_TUNE_PLAN).

SC1 — the offered set == the distinct catalog tasks on the generated schedule
      (no orphans, no id-mismatched stand-ins).
SC2/SC3 — selecting a subset / deselecting drops exactly those tasks from the
      regenerated plan (the regen path drops excluded ∪ avoided after expansion).

All deterministic — no LLM, no DB (mirrors schedule_runtime's expand→drop).
"""

from __future__ import annotations

import asyncio

import pytest

from services.task_catalog_service import warm_catalog, is_loaded, build_offered_habits
from services.schedule_skeleton import expand_skeleton
from services.schedule_runtime import _drop_excluded_tasks


def _warm():
    if not is_loaded():
        asyncio.run(warm_catalog())


@pytest.fixture(scope="module", autouse=True)
def _catalog():
    _warm()


# A rich skinmax state: acne + pigmentation drives actives, supplements, derm
# check; outdoor moderate adds the SPF reapply; stable barrier enables weekly
# exfoliation — so the plan has the orphan tasks the spec calls out.
SKIN_STATE = {
    "skin_concern": ["acne", "pigmentation"],
    "barrier_state": "stable",
    "skin_type": "oily",
    "routine_level": "advanced",
    "outdoor_exposure": "moderate",
    "tret_history": "never",
    "climate": "temperate",
    "diet_open": "yes_some",
}


def _days():
    return expand_skeleton(
        maxx_id="skinmax", user_state=SKIN_STATE,
        wake="07:00", sleep="23:00", cadence_days=14,
    )


def _distinct_ids(days):
    return {t["catalog_id"] for d in days for t in (d.get("tasks") or []) if t.get("catalog_id")}


def test_offered_equals_distinct_schedule_ids():
    days = _days()
    offered = build_offered_habits("skinmax", days)
    offered_ids = {o["id"] for o in offered}
    # SC1: 1:1 with the real plan — every scheduled task is offered, nothing extra.
    assert offered_ids == _distinct_ids(days)
    assert offered_ids, "schedule should have tasks"
    # each chip carries a readable label + a focus area
    for o in offered:
        assert o["label"] and o["area"]
    # offered preserves first-appearance order and is distinct
    ids_in_order = [o["id"] for o in offered]
    assert len(ids_in_order) == len(set(ids_in_order))


def test_orphans_from_spec_are_now_offered():
    # ids the spec called out as orphans (scheduled but never a chip before) that
    # ARE on this acne/pigmentation plan must now be offered.
    offered_ids = {o["id"] for o in build_offered_habits("skinmax", _days())}
    for cid in ("skin.spf_reapply", "skin.monthly_review",
                "skin.derm_consult", "skin.zinc_supp"):
        assert cid in offered_ids, f"{cid} scheduled but not offered (orphan)"
    # the old chip-only stand-in (`skin.spf`) that never matched a real task must
    # NOT be invented — the plan schedules SPF inside am_routine, not skin.spf.
    assert "skin.spf" not in offered_ids


def test_hydration_mask_orphan_offered_for_dry_skin():
    # hydration_mask is only scheduled for dry/rosacea/aging/maintenance — when it
    # IS scheduled, it must be offered (it never had a chip before).
    dry = {**SKIN_STATE, "skin_concern": ["aging"], "skin_type": "dry"}
    days = expand_skeleton(maxx_id="skinmax", user_state=dry,
                           wake="07:00", sleep="23:00", cadence_days=14)
    offered_ids = {o["id"] for o in build_offered_habits("skinmax", days)}
    assert "skin.hydration_mask" in _distinct_ids(days)  # precondition
    assert "skin.hydration_mask" in offered_ids


def test_select_subset_drops_everything_else():
    days = _days()
    offered_ids = {o["id"] for o in build_offered_habits("skinmax", days)}
    keep = {"skin.am_routine"}
    avoided = offered_ids - keep  # deselect everything but the morning routine
    pruned = _drop_excluded_tasks(days, avoided)
    assert _distinct_ids(pruned) == keep


def test_deselect_specific_tasks_removes_only_those():
    days = _days()
    offered_ids = {o["id"] for o in build_offered_habits("skinmax", days)}
    drop = {"skin.spf_reapply", "skin.monthly_review"}
    assert drop <= offered_ids, "deselected ids must be real offered tasks"
    pruned = _drop_excluded_tasks(days, drop)
    assert _distinct_ids(pruned) == offered_ids - drop


def test_default_all_selected_keeps_full_plan():
    # SC5: not opening the picker / keeping all selected == no avoided == full plan.
    days = _days()
    assert _distinct_ids(_drop_excluded_tasks(days, set())) == _distinct_ids(days)


def test_extra_ids_keeps_avoided_tasks_offered():
    # SC4: after deselect+save the task is dropped from the schedule, but the
    # tune sheet must still OFFER it (unselected) so it's re-addable. The
    # tune-later path passes the avoided ids as extra_ids.
    days = _days()
    scheduled = _distinct_ids(days)
    dropped = "skin.derm_consult"
    assert dropped in scheduled
    # simulate the regenerated (pruned) plan that no longer has the dropped task
    pruned = _drop_excluded_tasks(days, {dropped})
    assert dropped not in _distinct_ids(pruned)
    # tune sheet rebuilds offered over the pruned plan + the avoided id
    offered_ids = {o["id"] for o in build_offered_habits("skinmax", pruned, extra_ids=[dropped])}
    assert dropped in offered_ids, "avoided task must stay offered (re-addable)"
    # every still-scheduled task is offered too
    assert _distinct_ids(pruned) <= offered_ids


def test_extra_ids_ignores_unknown_ids():
    # garbage avoided ids (not in the catalog) are not invented as chips.
    days = _days()
    offered_ids = {o["id"] for o in build_offered_habits("skinmax", days, extra_ids=["skin.not_a_real_task"])}
    assert "skin.not_a_real_task" not in offered_ids
    assert offered_ids == _distinct_ids(days)  # SC1 still holds with only-bogus extras


def test_generic_across_maxes_heightmax():
    # Fix is generic: heightmax orphans the spec named are offered too.
    hstate = {
        "age": 19, "heightmax_focus": "all", "posture_issues": "heavy",
        "training_status": "yes_regular", "sleep_hours": 7,
        "spine_health": "none", "equipment_access": "full_setup",
    }
    days = expand_skeleton(maxx_id="heightmax", user_state=hstate,
                           wake="07:00", sleep="23:00", cadence_days=14)
    offered_ids = {o["id"] for o in build_offered_habits("heightmax", days)}
    assert offered_ids == _distinct_ids(days)
    assert offered_ids

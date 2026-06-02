"""Slice 3 — starter-routine safety (DB-free, LLM-free).

Locks in the "Safe starter now" guarantee: when onboarding finishes before a
user has answered every required question for their #1 maxx, we still build a
routine, but it carries ONLY tasks whose eligibility never reads an unanswered
required field. We can never force a wrong active onto a user.

Covered:
  - schedule_dsl.referenced_fields — extracts the LEFT-token field ids an
    expression reads (across OR/AND/in/contains/comparison/negation/bare).
  - expand_skeleton(exclude_fields=...) — drops every block that references an
    excluded field, keeps the universal daily-floor blocks.
  - schedule_runtime._drop_tasks_referencing — defense-in-depth task-level cut.
  - property: a skinmax starter built with ALL required fields missing contains
    no task whose conditions read a missing field.

Run: pytest backend/tests/test_starter_routine.py -q  (pyenv python 3.11.7).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


# --------------------------------------------------------------------------- #
#  referenced_fields — the grammar mirror that makes exclusion sound          #
# --------------------------------------------------------------------------- #

def test_referenced_fields_simple_comparison():
    from services.schedule_dsl import referenced_fields
    assert referenced_fields(["skin_concern == acne"]) == {"skin_concern"}
    assert referenced_fields(["barrier_state != compromised"]) == {"barrier_state"}


def test_referenced_fields_in_and_contains():
    from services.schedule_dsl import referenced_fields
    assert referenced_fields(["skin_type in [oily, combination]"]) == {"skin_type"}
    assert referenced_fields(["goals contains hairmax"]) == {"goals"}


def test_referenced_fields_or_and_combo():
    from services.schedule_dsl import referenced_fields
    got = referenced_fields(["skin_concern == acne and barrier_state != compromised"])
    assert got == {"skin_concern", "barrier_state"}
    got2 = referenced_fields(["skin_type == oily or skin_type == combination"])
    assert got2 == {"skin_type"}


def test_referenced_fields_negation_and_bare():
    from services.schedule_dsl import referenced_fields
    assert referenced_fields(["!dermastamp_owned"]) == {"dermastamp_owned"}
    assert referenced_fields(["dermastamp_owned"]) == {"dermastamp_owned"}


def test_referenced_fields_always_and_empty():
    from services.schedule_dsl import referenced_fields
    assert referenced_fields(["always"]) == set()
    assert referenced_fields([]) == set()
    assert referenced_fields(None) == set()


# --------------------------------------------------------------------------- #
#  expand_skeleton(exclude_fields=...) — block-level exclusion                 #
# --------------------------------------------------------------------------- #

def test_expand_skeleton_excludes_blocks_referencing_missing_fields():
    """With every required skinmax field excluded, no surviving block's `if`
    references one — and we still keep the universal foundation blocks."""
    from services.task_catalog_service import warm_catalog, missing_required
    from services.schedule_skeleton import expand_skeleton, has_skeleton
    from services.schedule_dsl import schedulable_anchors, referenced_fields
    asyncio.run(warm_catalog())
    assert has_skeleton("skinmax")

    # A bare state: only timing anchors, zero skin answers.
    state = {"wake_time": "07:00", "sleep_time": "23:00"}
    wake, sleep = schedulable_anchors(state)
    missing = {str(f.get("id")) for f in missing_required("skinmax", state) if f.get("id")}
    assert missing, "skinmax must declare required fields for this test to mean anything"

    full = expand_skeleton(maxx_id="skinmax", user_state=state, wake=wake, sleep=sleep, cadence_days=14)
    starter = expand_skeleton(
        maxx_id="skinmax", user_state=state, wake=wake, sleep=sleep,
        cadence_days=14, exclude_fields=missing,
    )

    full_tasks = sum(len(d.get("tasks") or []) for d in full)
    starter_tasks = sum(len(d.get("tasks") or []) for d in starter)
    # Exclusion only ever removes, never adds.
    assert starter_tasks <= full_tasks
    # And it must keep SOMETHING (the universal daily floor).
    assert starter_tasks > 0


def test_starter_tasks_never_reference_missing_required_field():
    """Property: every task in a skinmax starter built with all required fields
    missing has eligibility conditions that read none of those fields."""
    from services.task_catalog_service import warm_catalog, missing_required, get_task
    from services.schedule_skeleton import expand_skeleton
    from services.schedule_dsl import schedulable_anchors, referenced_fields
    from services.schedule_runtime import _drop_tasks_referencing
    asyncio.run(warm_catalog())

    state = {"wake_time": "07:00", "sleep_time": "23:00"}
    wake, sleep = schedulable_anchors(state)
    missing = {str(f.get("id")) for f in missing_required("skinmax", state) if f.get("id")}

    days = expand_skeleton(
        maxx_id="skinmax", user_state=state, wake=wake, sleep=sleep,
        cadence_days=14, exclude_fields=missing,
    )
    days = _drop_tasks_referencing(days, missing, "skinmax")

    for d in days:
        for t in d.get("tasks") or []:
            cid = t.get("catalog_id")
            ct = get_task("skinmax", cid) if cid else None
            if ct is None:
                continue
            refs = referenced_fields(list(getattr(ct, "applies_when", []) or []))
            refs |= referenced_fields(list(getattr(ct, "contraindicated_when", []) or []))
            assert not (refs & missing), (
                f"starter task {cid} reads unanswered required field(s): {refs & missing}"
            )


def test_drop_tasks_referencing_is_noop_for_empty_fields():
    from services.schedule_runtime import _drop_tasks_referencing
    days = [{"tasks": [{"catalog_id": "skin.cleanse_am"}]}]
    out = _drop_tasks_referencing(days, set(), "skinmax")
    assert out is days
    assert len(out[0]["tasks"]) == 1

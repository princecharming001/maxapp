"""Glue: new schedule_generator + schedule_adapter ⇄ existing UserSchedule persistence.

Replaces the body of `services.schedule_service.generate_maxx_schedule`
and `adapt_schedule` for the new doc-driven path. Reuses the legacy
`_enforce_schedule_limit` and the `UserSchedule` ORM row so push
notifications, completion stats, course wiring etc all keep working.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import User, UserSchedule
from services.multi_module_collision import reconcile_schedules
from services.schedule_adapter import adapt_schedule as _adapt
from services.schedule_generator import generate_schedule as _generate
from services.task_catalog_service import get_doc, missing_required, warm_catalog, is_loaded
from services.user_context_service import get_context, merged_user_state

logger = logging.getLogger(__name__)


class ScheduleLimitError(Exception):
    def __init__(self, active_labels: list[str]):
        self.active_labels = active_labels
        super().__init__(f"schedule limit reached: {active_labels}")


async def _enforce_active_schedule_limit(
    *, user_id: str, db: AsyncSession, replacing_maxx_id: str, subscription_tier: str | None,
    cap: int | None = None,
) -> None:
    """Allow up to N active schedules where N depends on tier:
        Chad (premium): 3
        Chadlite (basic) / unpaid: 2
    Caller can override by passing `cap` explicitly. Mirrors
    schedule_service.MAX_ACTIVE_SCHEDULES_{BASIC,PREMIUM}.
    """
    if cap is None:
        from services.schedule_service import (
            MAX_ACTIVE_SCHEDULES_BASIC,
            MAX_ACTIVE_SCHEDULES_PREMIUM,
        )
        tier = (subscription_tier or "").lower()
        cap = MAX_ACTIVE_SCHEDULES_PREMIUM if tier == "premium" else MAX_ACTIVE_SCHEDULES_BASIC

    user_uuid = UUID(user_id)
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user_uuid) & (UserSchedule.is_active.is_(True))
        )
    )
    actives = res.scalars().all()
    other = [s for s in actives if (s.maxx_id or "") != replacing_maxx_id]
    if len(other) >= cap:
        raise ScheduleLimitError([s.maxx_id or "?" for s in other])


async def generate_and_persist(
    *,
    user_id: str,
    maxx_id: str,
    db: AsyncSession,
    onboarding: dict | None = None,
    wake_time: str = "07:00",
    sleep_time: str = "23:00",
    subscription_tier: str | None = None,
    cap: int | None = None,
) -> dict:
    """Run the new generator and persist as UserSchedule. Returns a dict
    matching the shape lc_agent expects (id, maxx_id, course_title, days)."""
    if not is_loaded():
        await warm_catalog()

    user_uuid = UUID(user_id)
    user = await db.get(User, user_uuid)
    if user is None:
        raise ValueError(f"user {user_id} not found")

    # Limit check before LLM call.
    await _enforce_active_schedule_limit(
        user_id=user_id, db=db, replacing_maxx_id=maxx_id, subscription_tier=subscription_tier,
        cap=cap,
    )

    ob_ctx = onboarding or dict(user.onboarding or {})

    # Entitlement gate: once a user has entered programs via the marketplace,
    # only entered programs generate. Users with no entered_* keys at all are
    # legacy (pre-marketplace) and stay ungated so existing flows keep working.
    from services.task_fields import entered_programs
    entered = entered_programs(ob_ctx)
    if entered and maxx_id.strip().lower() not in entered:
        raise ValueError(
            f"{maxx_id} is not in your programs. Enter it in Explore first."
        )

    extras = {"wake_time": wake_time, "sleep_time": sleep_time}
    result = await _generate(
        user_id=user_id, maxx_id=maxx_id, db=db,
        onboarding=ob_ctx,
        extras=extras,
    )
    if not result.ok:
        if result.missing_fields:
            qs = ", ".join(f.get("id", "?") for f in result.missing_fields[:3])
            raise ValueError(f"missing required fields: {qs}")
        raise ValueError(result.errors[0].get("message") if result.errors else "generation failed")

    # Multi-module collision pass against any other ACTIVE schedule the user has.
    days = result.days
    # Stamp ISO dates on each day so the master view + UI calendars work.
    # Day 0 = today, day N = today + N days.
    from datetime import timedelta as _td
    from services.schedule_streak import local_today_date
    today = local_today_date(ob_ctx)
    for i, d in enumerate(days):
        d["date"] = (today + _td(days=i)).isoformat()
    # Canonical task fields on every persisted task (task_uuid, importance,
    # provenance...) even when this is the user's only program (no merge pass).
    from services.task_fields import normalize_days
    normalize_days(days, maxx_id)
    # user_ctx for the busy-window eviction step: the merge re-packs the morning
    # and can shove a task into a fixed obligation; pass the user's rhythm +
    # obligations (with resolved wake/sleep) so reconcile can clear them. Routed
    # through merged_user_state so face-scan gap-fills (e.g. a scan-derived
    # priority_order) reach the collision trimmer's maxx-priority tie-break.
    recon_ctx = merged_user_state(ob_ctx, None, {"wake_time": wake_time, "sleep_time": sleep_time})
    other_actives = await _load_other_active_days(user_uuid, db, except_maxx=maxx_id)
    if other_actives:
        bundle = {**other_actives, maxx_id: days}
        bundle = reconcile_schedules(bundle, user_ctx=recon_ctx, start_date=today)
        days = bundle[maxx_id]
        # Persist tweaks made to other modules (collision moved/dropped tasks).
        for other_max, other_days in bundle.items():
            if other_max == maxx_id:
                continue
            await _update_active_days(user_uuid, db, maxx_id=other_max, days=other_days)

    # Deactivate any prior active schedule for this same maxx_id.
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user_uuid)
            & (UserSchedule.maxx_id == maxx_id)
            & (UserSchedule.is_active.is_(True))
        )
    )
    for prior in res.scalars().all():
        prior.is_active = False
        prior.updated_at = datetime.utcnow()

    doc = get_doc(maxx_id)
    course_title = (doc.display_name if doc else maxx_id) + " Plan"

    schedule_row = UserSchedule(
        user_id=user_uuid,
        schedule_type="maxx",
        maxx_id=maxx_id,
        course_title=course_title,
        days=days,
        preferences={"wake_time": wake_time, "sleep_time": sleep_time},
        schedule_context={"summary": result.summary, "validator_retries": result.validator_retries},
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        adapted_count=0,
        user_feedback=[],
        completion_stats={"completed": 0, "total": 0, "skipped": 0},
    )
    db.add(schedule_row)
    await db.flush()

    await _log_op(
        db,
        user_id=user_uuid,
        schedule_id=schedule_row.id,
        maxx_id=maxx_id,
        op="generate",
        elapsed_ms=result.elapsed_ms,
        task_count=sum(len(d.get("tasks") or []) for d in days),
        validator_retries=result.validator_retries,
    )

    return {
        "id": str(schedule_row.id),
        "maxx_id": maxx_id,
        "course_title": course_title,
        "days": days,
        "summary": result.summary,
    }


def _resolve_top_maxx(state: dict) -> Optional[str]:
    """The user's #1-priority maxx, from declared priority_order (tokens) or,
    failing that, the first entry of `goals`. Returns a known maxx_id or None."""
    from services.multi_module_collision import _PRIORITY_TOKEN_TO_MAXX

    known = set(_PRIORITY_TOKEN_TO_MAXX.values())

    def _coerce(tok: str) -> Optional[str]:
        t = str(tok).strip().lower()
        if t in known:
            return t
        return _PRIORITY_TOKEN_TO_MAXX.get(t)

    po = state.get("priority_order")
    if isinstance(po, list):
        for tok in po:
            mx = _coerce(tok)
            if mx:
                return mx
    goals = state.get("goals")
    if isinstance(goals, list):
        for g in goals:
            mx = _coerce(g)
            if mx:
                return mx
    return None


def _drop_tasks_referencing(days: list[dict], fields: set[str], maxx_id: str) -> list[dict]:
    """Remove any placed task whose catalog eligibility conditions READ a field
    in `fields` (an unanswered required question). Defense-in-depth alongside
    the skeleton's block-level `exclude_fields` filter."""
    if not fields:
        return days
    from services.schedule_dsl import referenced_fields
    from services.task_catalog_service import get_task

    for d in days:
        kept = []
        for t in d.get("tasks") or []:
            cid = t.get("catalog_id")
            ct = get_task(maxx_id, cid) if cid else None
            refs: set[str] = set()
            if ct is not None:
                refs |= referenced_fields(list(getattr(ct, "applies_when", []) or []))
                refs |= referenced_fields(list(getattr(ct, "contraindicated_when", []) or []))
            if refs & fields:
                continue
            kept.append(t)
        d["tasks"] = kept
    return days


# Minimum tasks a starter routine must carry to be worth persisting. Below
# this we leave the user with no schedule (today's behavior) rather than a
# near-empty stub the in-app coach would have to immediately replace.
_STARTER_MIN_TASKS = 3


async def generate_first_routine_if_absent(
    *,
    user_id: str,
    db: AsyncSession,
) -> Optional[dict]:
    """Land a brand-new user on a real routine the moment onboarding finishes.

    If the user has NO active schedule, build their #1-priority maxx's plan:
      - If onboarding already answered everything that maxx requires, generate
        the full tailored routine (same path the chat uses).
      - Otherwise generate a STARTER routine: the universal daily-floor tasks
        only (cleanse/SPF/moisturize, mewing, etc.), dropping anything that
        hinges on an answer we don't have yet so we can never force a wrong
        active. The in-app coach fills the specifics and upgrades it later.

    Best-effort and non-fatal: returns None and changes nothing if a clean
    routine can't be produced, preserving the prior no-op behavior. Never
    raises (the onboarding write must always succeed)."""
    try:
        if not is_loaded():
            await warm_catalog()

        user_uuid = UUID(user_id)
        user = await db.get(User, user_uuid)
        if user is None:
            return None

        # Only ever runs for a user with zero active schedules.
        res = await db.execute(
            select(UserSchedule).where(
                (UserSchedule.user_id == user_uuid) & (UserSchedule.is_active.is_(True))
            )
        )
        if res.scalars().first() is not None:
            return None

        onboarding = dict(user.onboarding or {})
        persistent = await get_context(user_id, db)
        state = merged_user_state(onboarding, persistent)

        maxx_id = _resolve_top_maxx(state)
        if not maxx_id:
            return None

        from services.schedule_dsl import schedulable_anchors
        from services.schedule_skeleton import expand_skeleton, has_skeleton
        from services.schedule_validator import validate_and_fix

        if not has_skeleton(maxx_id):
            return None

        wake, sleep = schedulable_anchors(state)

        # Everything this maxx needs is already answered -> full tailored plan.
        missing = {str(f.get("id")) for f in missing_required(maxx_id, state) if f.get("id")}
        if not missing:
            return await generate_and_persist(
                user_id=user_id, maxx_id=maxx_id, db=db,
                onboarding=onboarding, wake_time=wake, sleep_time=sleep,
            )

        # Starter routine: drop blocks/tasks that depend on unanswered answers.
        doc = get_doc(maxx_id)
        sd = (doc.schedule_design or {}) if doc else {}
        cadence_days = int(sd.get("cadence_days", 14))
        budget = sd.get("daily_task_budget") or [2, 6]

        from services.schedule_streak import local_today_date as _ltd
        days = expand_skeleton(
            maxx_id=maxx_id, user_state=state, wake=wake, sleep=sleep,
            cadence_days=cadence_days, exclude_fields=missing,
            start_date=_ltd(state),
        )
        days = _drop_tasks_referencing(days, missing, maxx_id)
        _ok, _errs, days = validate_and_fix(
            maxx_id=maxx_id, days=days, wake_time=wake, sleep_time=sleep,
            user_ctx=state, expected_day_count=cadence_days,
            daily_task_budget=tuple(budget),
        )

        total_tasks = sum(len(d.get("tasks") or []) for d in days)
        if total_tasks < _STARTER_MIN_TASKS:
            logger.info(
                "starter routine for max=%s user=%s too thin (%d tasks) — skipping",
                maxx_id, user_id, total_tasks,
            )
            return None

        from datetime import date as _date, timedelta as _td
        today = _date.today()
        for i, d in enumerate(days):
            d["date"] = (today + _td(days=i)).isoformat()

        doc_title = (doc.display_name if doc else maxx_id) + " Plan"
        schedule_row = UserSchedule(
            user_id=user_uuid,
            schedule_type="maxx",
            maxx_id=maxx_id,
            course_title=doc_title,
            days=days,
            preferences={"wake_time": wake, "sleep_time": sleep},
            schedule_context={
                "summary": "Your daily foundation. Answer a few questions in chat "
                           "and it gets tailored to you.",
                "starter": True,
                "starter_pending_fields": sorted(missing),
            },
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            adapted_count=0,
            user_feedback=[],
            completion_stats={"completed": 0, "total": 0, "skipped": 0},
        )
        db.add(schedule_row)
        await db.flush()
        await _log_op(
            db, user_id=user_uuid, schedule_id=schedule_row.id, maxx_id=maxx_id,
            op="generate_starter", elapsed_ms=0,
            task_count=total_tasks, validator_retries=0,
        )
        logger.info(
            "starter routine created for max=%s user=%s (%d tasks, pending=%s)",
            maxx_id, user_id, total_tasks, sorted(missing),
        )
        return {
            "id": str(schedule_row.id),
            "maxx_id": maxx_id,
            "course_title": doc_title,
            "days": days,
            "starter": True,
        }
    except Exception as e:  # never break the onboarding write
        logger.warning("generate_first_routine_if_absent failed (non-fatal): %s", e)
        return None


async def regenerate_active_schedules(
    *,
    user_id: str,
    db: AsyncSession,
    only_max: Optional[str] = None,
    reason: str = "context_change",
) -> list[dict]:
    """Re-expand every active doc-driven schedule for the user against
    their current onboarding + persistent context.

    Triggered any time the user's wake/sleep, required-field answers, or
    optional context changes — so the schedule reflects the new state
    without the user having to manually regenerate.

    Strategy:
      - For each active UserSchedule whose maxx_id has a doc-driven
        skeleton, expand a fresh `days` array.
      - Diff against the existing days POSITIONALLY by `(day_index,
        catalog_id)`: matching tasks keep their `task_id` and `status`
        (so completed checkmarks survive). New tasks get fresh ids.
        Tasks no longer in the skeleton drop out.
      - Update the row in-place (do NOT deactivate + re-create) so all
        downstream references (notifications, completion logs) stay
        valid.
      - Skip silently for maxes without a skeleton (legacy path).

    Returns a list of `{maxx_id, schedule_id, changed}` summaries.
    """
    from datetime import date as _date, timedelta as _td
    from services.task_catalog_service import get_doc, is_loaded, warm_catalog
    from services.schedule_skeleton import expand_skeleton, has_skeleton
    from services.schedule_validator import validate_and_fix
    from services.user_context_service import get_context, merged_user_state

    if not is_loaded():
        await warm_catalog()

    user_uuid = UUID(user_id)
    user = await db.get(User, user_uuid)
    if user is None:
        return []
    onboarding = dict(getattr(user, "onboarding", {}) or {})
    persistent = await get_context(user_id, db)
    state = merged_user_state(onboarding, persistent)
    # Build the day around the GUARANTEED-awake window when the user expressed
    # wake/sleep as a RANGE (latest-wake floor, earliest-sleep ceiling) so every
    # routine lands in time they're reliably free — "fit it in, don't force it".
    # Collapses to the exact time for a single-point range (no change for
    # exact-time users). Per-weekday ranges are honored inside the validator.
    from services.schedule_dsl import schedulable_anchors
    wake, sleep = schedulable_anchors(state)

    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user_uuid) & (UserSchedule.is_active.is_(True))
        )
    )
    actives = list(res.scalars().all())

    out: list[dict] = []
    from services.schedule_streak import local_today_date as _ltd2
    today = _ltd2(state)
    for sched in actives:
        mid = sched.maxx_id or ""
        if only_max and mid != only_max:
            continue
        if not has_skeleton(mid):
            continue
        doc = get_doc(mid)
        if doc is None:
            continue
        sd = doc.schedule_design or {}
        cadence_days = int(sd.get("cadence_days", 14))
        budget = sd.get("daily_task_budget") or [2, 6]

        try:
            new_days = expand_skeleton(
                maxx_id=mid, user_state=state, wake=wake, sleep=sleep,
                cadence_days=cadence_days,
                start_date=today,
            )
            _, _errs, fixed_new = validate_and_fix(
                maxx_id=mid, days=new_days,
                wake_time=wake, sleep_time=sleep,
                user_ctx=state, expected_day_count=cadence_days,
                daily_task_budget=tuple(budget),
            )
        except Exception as e:
            logger.warning("regen failed for max=%s user=%s: %s", mid, user_id, e)
            continue

        # Stamp dates so master view + UI calendars stay correct.
        for i, d in enumerate(fixed_new):
            d["date"] = (today + _td(days=i)).isoformat()

        # Honor parts the user explicitly pruned (scope="series" delete) so a
        # re-expansion never resurrects a habit they killed.
        excluded = set((sched.schedule_context or {}).get("excluded_catalog_ids") or [])
        if excluded:
            fixed_new = _drop_excluded_tasks(fixed_new, excluded)

        # Honor times the user explicitly moved (scope="series" edit) so a
        # silent re-expansion re-pins their chosen time instead of snapping
        # the part back to the skeleton default. Applied AFTER validate_and_fix
        # so the user's intent wins over the engine's preferred slot.
        overrides = dict((sched.schedule_context or {}).get("time_overrides") or {})
        if overrides:
            fixed_new = _apply_time_overrides(fixed_new, overrides)

        merged = _merge_preserving_status(old_days=list(sched.days or []), new_days=fixed_new)
        # Only update if anything actually changed (cheap to compare via
        # the fingerprints we already build; here we just compare lengths
        # + first day's task tuple).
        changed = _days_differ(list(sched.days or []), merged)
        if changed:
            sched.days = merged
            sched.updated_at = datetime.utcnow()
            sched.schedule_context = {
                **(sched.schedule_context or {}),
                "last_regen_reason": reason,
                "last_regen_at": datetime.utcnow().isoformat(),
            }
        out.append({
            "maxx_id": mid,
            "schedule_id": str(sched.id),
            "changed": changed,
        })
    # Cross-module reconcile after regen: each module re-expanded alone above,
    # so without this pass the persisted days are un-merged and the read-time
    # merge becomes the only (and unprotected) merge running.
    if len(actives) >= 2 and any(s["changed"] for s in out):
        try:
            bundle = {
                s.maxx_id: list(s.days or []) for s in actives if s.maxx_id and s.days
            }
            if len(bundle) >= 2:
                recon_ctx = merged_user_state(onboarding, persistent)
                bundle = reconcile_schedules(bundle, user_ctx=recon_ctx, start_date=today)
                for s in actives:
                    if s.maxx_id in bundle:
                        s.days = bundle[s.maxx_id]
                        s.updated_at = datetime.utcnow()
        except Exception as e:
            logger.warning("post-regen reconcile failed (non-fatal): %s", e)

    if any(s["changed"] for s in out):
        await db.flush()
    return out


def _drop_excluded_tasks(days: list[dict], excluded: set[str]) -> list[dict]:
    """Strip tasks whose catalog_id the user pruned (scope="series" delete).

    Used after a fresh skeleton expansion so a part the user explicitly
    removed stays gone across regenerations. Returns shallow-copied days so
    the caller's input isn't mutated."""
    if not excluded:
        return days
    out: list[dict] = []
    for d in days:
        tasks = [t for t in (d.get("tasks") or []) if t.get("catalog_id") not in excluded]
        out.append({**d, "tasks": tasks})
    return out


def _apply_time_overrides(days: list[dict], overrides: dict[str, str]) -> list[dict]:
    """Re-pin user-moved times (scope="series" edit) onto a fresh expansion.

    `overrides` maps catalog_id -> "HH:MM". For every task whose catalog_id is
    pinned, stamp the user's time (and clear notification_sent so the reminder
    re-arms). Returns shallow-copied days so the caller's input isn't mutated.
    """
    if not overrides:
        return days
    out: list[dict] = []
    for d in days:
        tasks: list[dict] = []
        for t in (d.get("tasks") or []):
            cid = t.get("catalog_id")
            pinned = overrides.get(cid) if cid else None
            if pinned:
                tasks.append({**t, "time": pinned, "notification_sent": False})
            else:
                tasks.append(t)
        out.append({**d, "tasks": tasks})
    return out


def _merge_preserving_status(*, old_days: list[dict], new_days: list[dict]) -> list[dict]:
    """Positional merge: for each day, keep the matching old task's
    `task_id` and `status` when its `catalog_id` is still present in the
    new skeleton expansion. New tasks get fresh ids. Removed tasks drop."""
    merged: list[dict] = []
    for di, nd in enumerate(new_days):
        od = old_days[di] if di < len(old_days) else {}
        old_by_cid: dict[str, dict] = {}
        for ot in (od.get("tasks") or []):
            cid = ot.get("catalog_id")
            if cid and cid not in old_by_cid:
                old_by_cid[cid] = ot
        new_tasks: list[dict] = []
        for nt in (nd.get("tasks") or []):
            cid = nt.get("catalog_id")
            ot = old_by_cid.get(cid)
            if ot:
                # Preserve identity so notifications + completion stats survive.
                nt["task_id"] = ot.get("task_id") or nt.get("task_id")
                # Preserve user-touched status (completed / skipped). Default
                # to pending for tasks the user never touched.
                ot_status = (ot.get("status") or "pending").lower()
                if ot_status in ("completed", "skipped"):
                    nt["status"] = ot_status
                else:
                    nt["status"] = "pending"
            new_tasks.append(nt)
        merged.append({**nd, "tasks": new_tasks})
    return merged


def _days_differ(a: list[dict], b: list[dict]) -> bool:
    """Cheap structural diff — used to skip a no-op write when state
    didn't actually change anything (e.g. a context merge that didn't
    touch any field the skeleton consults)."""
    if len(a) != len(b):
        return True
    for da, db_ in zip(a, b):
        ta = [(t.get("catalog_id"), t.get("time")) for t in (da.get("tasks") or [])]
        tb = [(t.get("catalog_id"), t.get("time")) for t in (db_.get("tasks") or [])]
        if ta != tb:
            return True
    return False


async def adapt_and_persist(
    *,
    user_id: str,
    schedule_id: str,
    db: AsyncSession,
    feedback: str,
) -> dict:
    """Apply diff-format adapt and persist."""
    user_uuid = UUID(user_id)
    sched_uuid = UUID(schedule_id)
    schedule_row = (await db.execute(
        select(UserSchedule).where(
            (UserSchedule.id == sched_uuid) & (UserSchedule.user_id == user_uuid)
        )
    )).scalar_one_or_none()
    if schedule_row is None:
        raise ValueError("Schedule not found")

    if not is_loaded():
        await warm_catalog()

    user = await db.get(User, user_uuid)
    onboarding = dict(user.onboarding or {}) if user else {}
    prefs = dict(schedule_row.preferences or {})
    wake = prefs.get("wake_time") or "07:00"
    sleep = prefs.get("sleep_time") or "23:00"

    result = await _adapt(
        user_id=user_id,
        schedule_id=schedule_id,
        maxx_id=schedule_row.maxx_id or "",
        days=list(schedule_row.days or []),
        feedback=feedback,
        db=db,
        onboarding=onboarding,
        wake_time=wake,
        sleep_time=sleep,
    )

    # An adapt is an EXPLICIT user request, so unlike a silent regen it must
    # NOT strip parts. Instead reconcile the durable exclusion set: if Max
    # brought a previously-pruned part back into the schedule, the user clearly
    # wants it, so stop excluding it. Parts still absent stay excluded so the
    # next regen won't resurrect them.
    excluded = list((schedule_row.schedule_context or {}).get("excluded_catalog_ids") or [])
    if excluded:
        present = {t.get("catalog_id") for d in result.days for t in (d.get("tasks") or [])}
        kept = [cid for cid in excluded if cid not in present]
        if kept != excluded:
            schedule_row.schedule_context = {
                **(schedule_row.schedule_context or {}),
                "excluded_catalog_ids": kept,
            }

    schedule_row.days = result.days
    schedule_row.adapted_count = (schedule_row.adapted_count or 0) + 1
    fb_log = list(schedule_row.user_feedback or [])
    fb_log.append({"date": datetime.utcnow().isoformat(), "feedback": feedback, "summary": result.summary})
    schedule_row.user_feedback = fb_log
    schedule_row.updated_at = datetime.utcnow()
    await db.flush()

    await _log_op(
        db,
        user_id=user_uuid,
        schedule_id=schedule_row.id,
        maxx_id=schedule_row.maxx_id or "",
        op="adapt",
        elapsed_ms=result.elapsed_ms,
        task_count=sum(len(d.get("tasks") or []) for d in result.days),
        validator_retries=0,
        feedback=feedback,
        diff_ops=result.ops_applied,
    )

    return {
        "id": str(schedule_row.id),
        "maxx_id": schedule_row.maxx_id,
        "days": result.days,
        "summary": result.summary,
        "ops_applied": result.ops_applied,
        "context_updates": result.context_updates,
        "changes_summary": result.summary,
    }


async def _load_other_active_days(user_uuid: UUID, db: AsyncSession, *, except_maxx: str) -> dict[str, list[dict]]:
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user_uuid)
            & (UserSchedule.is_active.is_(True))
        )
    )
    out: dict[str, list[dict]] = {}
    for row in res.scalars().all():
        if (row.maxx_id or "") == except_maxx:
            continue
        if row.days:
            out[row.maxx_id] = list(row.days)
    return out


async def _update_active_days(user_uuid: UUID, db: AsyncSession, *, maxx_id: str, days: list[dict]) -> None:
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user_uuid)
            & (UserSchedule.maxx_id == maxx_id)
            & (UserSchedule.is_active.is_(True))
        )
    )
    for row in res.scalars().all():
        row.days = days
        row.updated_at = datetime.utcnow()


async def _log_op(
    db: AsyncSession, *,
    user_id: UUID, schedule_id: UUID | None, maxx_id: str, op: str,
    elapsed_ms: int, task_count: int | None, validator_retries: int,
    feedback: str | None = None, diff_ops: Any = None,
) -> None:
    try:
        await db.execute(
            text(
                """
                INSERT INTO schedule_generation_log
                  (user_id, schedule_id, maxx_id, op, elapsed_ms, task_count, validator_retries, feedback, diff_ops)
                VALUES
                  (:uid, :sid, :mid, :op, :ms, :tc, :vr, :fb, CAST(:diff AS jsonb))
                """
            ),
            {
                "uid": user_id, "sid": schedule_id, "mid": maxx_id, "op": op,
                "ms": elapsed_ms, "tc": task_count, "vr": validator_retries,
                "fb": feedback,
                "diff": (None if diff_ops is None else __import__("json").dumps(diff_ops)),
            },
        )
    except Exception as e:
        logger.warning("schedule log insert failed (non-fatal): %s", e)

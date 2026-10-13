"""Ordinary app usage must never 500: a degraded shared (RDS) database, a
malformed id, or an AI-program id reaching legacy code paths each get a clean
answer (empty list / 404 / 503) instead of an unhandled exception."""
import pytest
from fastapi import HTTPException

import db.rds as rds


# ── get_rds_db: unreachable RDS is a clean 503, never a raw connect error ────

class _FailingSession:
    closed = False

    async def connection(self):
        raise OSError("Connect call failed")

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_required_rds_unreachable_is_503_and_trips_breaker(monkeypatch):
    monkeypatch.setattr(rds.settings, "aws_rds_password", "x")
    monkeypatch.setattr(rds, "_rds_open_until", 0.0)
    sess = _FailingSession()
    monkeypatch.setattr(rds, "RDSSessionLocal", lambda: sess)

    gen = rds.get_rds_db()
    with pytest.raises(HTTPException) as ei:
        await gen.__anext__()
    assert ei.value.status_code == 503
    assert sess.closed
    assert rds._rds_circuit_open()


@pytest.mark.asyncio
async def test_required_rds_circuit_open_is_instant_503(monkeypatch):
    monkeypatch.setattr(rds.settings, "aws_rds_password", "x")
    monkeypatch.setattr(rds, "_rds_open_until", rds.time.monotonic() + 60)

    def _must_not_dial():
        raise AssertionError("dialled RDS while the circuit was open")

    monkeypatch.setattr(rds, "RDSSessionLocal", _must_not_dial)
    with pytest.raises(HTTPException) as ei:
        await rds.get_rds_db().__anext__()
    assert ei.value.status_code == 503


# ── List reads degrade to empty instead of 503/500 ──────────────────────────

@pytest.mark.asyncio
async def test_rds_list_reads_degrade_to_empty():
    from api import courses, events, forums_v2

    user = {"id": "00000000-0000-0000-0000-000000000001"}
    assert await events.list_events(current_user=user, rds_db=None) == {"events": []}
    assert await events.get_live_events(current_user=user, rds_db=None) == {"events": []}
    cal = await events.get_calendar(month=3, year=2026, current_user=user, rds_db=None)
    assert cal == {"events": [], "month": 3, "year": 2026}
    assert await courses.list_courses(current_user=user, rds_db=None) == {"courses": []}
    assert await forums_v2.list_categories(rds_db=None) == {"categories": []}
    assert await forums_v2.list_subforums(category_id=None, rds_db=None) == {"subforums": []}
    n = await forums_v2.list_notifications(
        unread_only=False, limit=40, offset=0, current_user=user, rds_db=None
    )
    assert n["notifications"] == []


@pytest.mark.asyncio
async def test_forums_list_degrades_to_empty():
    from api import forums

    out = await forums.list_channels(
        q=None, maxx_id=None, limit=50, offset=0,
        current_user={"id": "00000000-0000-0000-0000-000000000001"}, rds_db=None, db=None,
    )
    assert out == {"forums": [], "total": 0, "limit": 50, "offset": 0}


# ── Malformed schedule id on the task guide → "not found", no DB round trip ──

@pytest.mark.asyncio
async def test_task_guide_malformed_schedule_id_is_not_found():
    from services.task_guide_service import get_task_guide

    class _NoDb:
        async def execute(self, *a, **k):
            raise AssertionError("queried the DB with a malformed uuid")

    out = await get_task_guide(schedule_id="not-a-uuid", task_id="x", user_id="u", db=_NoDb())
    assert out.get("unavailable") is True


# ── schedule_generator: local_today_date is a real module-level name ────────

def test_schedule_generator_resolves_local_today_date():
    import services.schedule_generator as sg
    from services.schedule_streak import local_today_date

    # Was a function-local import inside generate_schedule only, so the
    # calendar fetch above it hit UnboundLocalError and _llm_then_validate
    # hit NameError.
    assert sg.local_today_date is local_today_date


# ── Chat lead-in for a max with no catalog doc must not AttributeError ──────

def test_intake_leadin_survives_unknown_max():
    from api.chat import _start_intake_leadin

    out = _start_intake_leadin("nosuchmax", "start nosuchmax")
    assert "nosuchmax" in out


# ── Feasibility sizes AI programs instead of 404ing ─────────────────────────

def test_ai_program_feasibility_requirement_is_derivable():
    from services.ai_programs import AI_PROGRAMS, get_program_doc

    for mid in AI_PROGRAMS:
        pd = get_program_doc(mid)
        mins = max((int(h.minutes_min or 0) for h in pd.habits[:3]), default=0)
        assert 0 <= mins < 40, (mid, mins)  # never sim'd as a workout-window block


# ── Adapt on an AI-program schedule goes through the program planner ───────

@pytest.mark.asyncio
async def test_adapt_routes_ai_program_to_redo(monkeypatch):
    from fastapi import BackgroundTasks

    import api.schedules as sch
    import services.ai_programs as ap

    calls = {}

    async def _get(schedule_id, user_id, db):
        return {"id": schedule_id, "maxx_id": "sleepmax", "days": []}

    async def _redo(user_id, maxx_id, request, db):
        calls["redo"] = (maxx_id, request)
        return {"summary": "s", "habits": []}

    async def _legacy(**kw):
        raise AssertionError("legacy LLM adapt used for an AI program")

    monkeypatch.setattr(sch.schedule_service, "get_schedule_by_id", _get)
    monkeypatch.setattr(sch.schedule_service, "adapt_schedule", _legacy)
    monkeypatch.setattr(ap, "redo_program_plan", _redo)

    out = await sch.adapt_schedule(
        schedule_id="11111111-1111-1111-1111-111111111111",
        data=sch.AdaptScheduleRequest(feedback="make it lighter"),
        background_tasks=BackgroundTasks(),
        current_user={"id": "u"},
        db=None,
    )
    assert calls["redo"] == ("sleepmax", "make it lighter")
    assert out["schedule"]["maxx_id"] == "sleepmax"


# ── A DNS/socket failure reaching the DB is a 503 outage, not a 500 ─────────

def test_dns_failure_reads_as_db_outage():
    import socket

    from main import _looks_like_db_outage

    assert _looks_like_db_outage(socket.gaierror(8, "nodename nor servname provided, or not known"))
    assert _looks_like_db_outage(OSError("Multiple exceptions: [Errno 61] Connect call failed ('1.2.3.4', 5432)"))
    assert not _looks_like_db_outage(KeyError("sleepmax"))


# ── Schedule preferences with several stacked programs (was MultipleResultsFound) ─

@pytest.mark.asyncio
async def test_update_preferences_applies_to_every_active_schedule():
    from types import SimpleNamespace

    from services.schedule_service import schedule_service

    rows = [SimpleNamespace(preferences=None, updated_at=None) for _ in range(3)]

    class _Res:
        def scalars(self):
            return SimpleNamespace(all=lambda: rows)

        def scalar_one_or_none(self):
            raise AssertionError("must not assume a single active schedule")

    class _Db:
        committed = False

        async def execute(self, *a, **k):
            return _Res()

        async def commit(self):
            self.committed = True

    db = _Db()
    prefs = {"wake_time": "07:00", "sleep_time": "23:00"}
    out = await schedule_service.update_preferences("00000000-0000-0000-0000-000000000001", prefs, db)
    assert out == {"message": "Preferences updated"}
    assert db.committed and all(r.preferences == prefs for r in rows)

"""DRY-RUN report: active schedules carrying status="completed" (or "skipped")
on dates AFTER the user's local today.

Why: until fix/schedule-regen, regenerate_active_schedules merged completion
state POSITIONALLY after re-anchoring day 0 to today, so every regen on day
D0+k slid the user's completions k days into the future. The live DB ended up
with tasks "completed" on dates that had not happened yet (and the real
history dropped). This script FINDS those rows so a human can decide on the
repair. Read-only by default; --apply (with REPAIR_APPLY_CONFIRM=yes) writes the reviewed repair.

The intended repair (deliberately NOT implemented here): for every listed task
set status="pending" and drop completed_at / skipped_at, keeping task_id, then
let the next regen (now date-aligned) carry on correctly. Real completions of
past days are already gone from these rows and cannot be recovered from
user_schedules alone.

Signal quality: complete_task always writes completed_at, and the positional
merge copied ONLY task_id + status — so a future "completed" with NO stamp can
only have come from the shift; likewise a completed_at date EARLIER than the
day it now sits on (you cannot finish a day before it starts). Both are marked
`shifted`. A stamp on/after the day's date (a user deliberately ticking a
future day in the schedule view) is reported but marked `ambiguous`.

"Now" comes from the DATABASE clock (the dev Mac's clock runs behind — see
AGENTS.md), converted to each user's onboarding.timezone (UTC fallback, same
as services.schedule_streak).

Usage (from backend/):
    /Users/home/maxapp/.venv/bin/python scripts/repair_shifted_completions.py
    /Users/home/maxapp/.venv/bin/python scripts/repair_shifted_completions.py --json
    /Users/home/maxapp/.venv/bin/python scripts/repair_shifted_completions.py --include-inactive
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

# db.sqlalchemy prints a "[DB] mode=..." banner on import; keep it off stdout so
# `--json` output stays machine-readable.
with contextlib.redirect_stdout(sys.stderr):
    from db.sqlalchemy import engine  # noqa: E402

FUTURE_STATUSES = ("completed", "skipped")


def _tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(str(name or "UTC").strip() or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _parse_date(s: object) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def _load_json(v: object) -> object:
    if isinstance(v, (str, bytes)):
        try:
            return json.loads(v)
        except (TypeError, ValueError):
            return None
    return v


def _scan_schedule(row: dict, db_now: datetime) -> dict | None:
    """Return a finding dict for one schedule, or None when it is clean."""
    tz = _tz(row.get("tz"))
    local_today = db_now.astimezone(tz).date()
    days = _load_json(row.get("days")) or []
    if not isinstance(days, list):
        return None
    ctx = _load_json(row.get("schedule_context")) or {}
    hits: list[dict] = []
    for day in days:
        if not isinstance(day, dict):
            continue
        day_date = _parse_date(day.get("date"))
        if day_date is None or day_date <= local_today:
            continue
        for t in day.get("tasks") or []:
            if not isinstance(t, dict):
                continue
            status = str(t.get("status") or "").lower()
            if status not in FUTURE_STATUSES:
                continue
            stamp = t.get("completed_at") if status == "completed" else t.get("skipped_at")
            stamp_date = _parse_date(stamp)
            if status == "completed" and not stamp:
                # complete_task ALWAYS writes completed_at; the only writer that
                # produced a stamp-less "completed" was the positional merge
                # (it copied task_id + status and nothing else). Provably shifted.
                verdict = "shifted"
                delta = None
            elif stamp_date is not None and stamp_date < day_date:
                verdict = "shifted"
                delta = (day_date - stamp_date).days
            else:
                verdict = "ambiguous"
                delta = None
            hits.append({
                "date": day_date.isoformat(),
                "days_ahead": (day_date - local_today).days,
                "task_id": t.get("task_id"),
                "catalog_id": t.get("catalog_id"),
                "title": t.get("title"),
                "status": status,
                "stamp": stamp,
                "verdict": verdict,
                "stamp_to_day_delta_days": delta,
            })
    if not hits:
        return None
    first_date = min((d for d in (_parse_date(x.get("date")) for x in days if isinstance(x, dict)) if d), default=None)
    return {
        "schedule_id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "maxx_id": row.get("maxx_id"),
        "is_active": bool(row.get("is_active")),
        "timezone": row.get("tz") or "UTC (fallback)",
        "local_today": local_today.isoformat(),
        "days_start": first_date.isoformat() if first_date else None,
        "day_count": len(days),
        "last_regen_reason": (ctx or {}).get("last_regen_reason") if isinstance(ctx, dict) else None,
        "last_regen_at": (ctx or {}).get("last_regen_at") if isinstance(ctx, dict) else None,
        "future_resolved_count": len(hits),
        "shifted_count": sum(1 for h in hits if h["verdict"] == "shifted"),
        "tasks": hits,
    }


async def _run(include_inactive: bool) -> tuple[list[dict], dict]:
    sql = """
        SELECT s.id, s.user_id, s.maxx_id, s.is_active, s.days, s.schedule_context,
               u.onboarding->>'timezone' AS tz
        FROM user_schedules s
        JOIN app_users u ON u.id = s.user_id
        {where}
        ORDER BY s.user_id, s.maxx_id
    """.format(where="" if include_inactive else "WHERE s.is_active = true")
    findings: list[dict] = []
    async with engine.connect() as conn:
        # Read-only by construction: a plain connection, SELECTs only, never a
        # commit. The AGENTS.md rule is "never touch the production DB in a
        # write path" — this script has no write path.
        db_now = (await conn.execute(text("SELECT now()"))).scalar()
        if db_now.tzinfo is None:
            db_now = db_now.replace(tzinfo=ZoneInfo("UTC"))
        res = await conn.execute(text(sql))
        rows = [dict(r) for r in res.mappings()]
    await engine.dispose()
    for row in rows:
        f = _scan_schedule(row, db_now)
        if f:
            findings.append(f)
    summary = {
        "db_now_utc": db_now.astimezone(ZoneInfo("UTC")).isoformat(),
        "schedules_scanned": len(rows),
        "schedules_affected": len(findings),
        "users_affected": len({f["user_id"] for f in findings}),
        "future_resolved_tasks": sum(f["future_resolved_count"] for f in findings),
        "shifted_tasks": sum(f["shifted_count"] for f in findings),
        "mode": "DRY-RUN (report only; nothing written)",
    }
    return findings, summary


def _print_report(findings: list[dict], summary: dict) -> None:
    print("=== repair_shifted_completions — DRY RUN (nothing is written) ===")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    print()
    for f in findings:
        print(
            f"- schedule {f['schedule_id']} user {f['user_id']} max={f['maxx_id']} "
            f"active={f['is_active']} tz={f['timezone']} today={f['local_today']} "
            f"days={f['days_start']}..(+{f['day_count']}) "
            f"last_regen={f['last_regen_reason']}@{f['last_regen_at']}"
        )
        print(f"    {f['future_resolved_count']} resolved task(s) after today "
              f"({f['shifted_count']} provably shifted):")
        for t in f["tasks"]:
            print(
                f"      {t['date']} (+{t['days_ahead']}d) {t['status']:<9} {t['verdict']:<9} "
                f"{t['catalog_id'] or '-':<28} stamp={t['stamp']} task_id={t['task_id']}"
            )
    if not findings:
        print("No schedules with resolved tasks after the user's local today.")
    print()
    print("Proposed repair (NOT applied): set status='pending' and drop the stamp on every "
          "task listed above; task_id unchanged. Review before any write is authored.")


async def _apply(findings: list[dict]) -> int:
    """Write the repair for the listed tasks: status → 'pending', stamps
    dropped, task_id untouched. One transaction per schedule, re-reading the
    row so a task the user resolved since the scan is left alone. Requires
    REPAIR_APPLY_CONFIRM=yes in the environment — the owner's explicit,
    per-run go-ahead for a production write."""
    import os
    if os.environ.get("REPAIR_APPLY_CONFIRM") != "yes":
        raise SystemExit("refusing to write: set REPAIR_APPLY_CONFIRM=yes to apply (owner approval required)")
    fixed = 0
    for f in findings:
        targets = {(t["date"], t["task_id"]) for t in f["tasks"] if t.get("verdict") == "shifted" and t.get("task_id")}
        if not targets:
            continue
        async with engine.begin() as conn:
            row = (await conn.execute(
                text("SELECT days FROM user_schedules WHERE id = :id FOR UPDATE"), {"id": f["schedule_id"]}
            )).mappings().first()
            if not row:
                continue
            days = row["days"] if isinstance(row["days"], list) else json.loads(row["days"] or "[]")
            changed = 0
            for d in days:
                for t in d.get("tasks") or []:
                    if (str(d.get("date")), str(t.get("task_id"))) in targets and \
                            str(t.get("status") or "").lower() in ("completed", "skipped") and \
                            not t.get("completed_at") and not t.get("skipped_at"):
                        t["status"] = "pending"
                        changed += 1
            if changed:
                await conn.execute(
                    text("UPDATE user_schedules SET days = CAST(:days AS json), updated_at = now() WHERE id = :id"),
                    {"days": json.dumps(days), "id": f["schedule_id"]},
                )
                fixed += changed
                print(f"  repaired {changed} task(s) on schedule {f['schedule_id']}")
    await engine.dispose()
    return fixed


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON instead of the text report")
    ap.add_argument("--include-inactive", action="store_true", help="also scan is_active=false rows")
    ap.add_argument("--apply", action="store_true",
                    help="WRITE the repair for provably-shifted tasks (needs REPAIR_APPLY_CONFIRM=yes; owner approval)")
    args = ap.parse_args()
    findings, summary = asyncio.run(_run(include_inactive=args.include_inactive))
    if args.json:
        print(json.dumps({"summary": summary, "findings": findings}, indent=2, default=str))
    else:
        _print_report(findings, summary)
    if args.apply:
        n = asyncio.run(_apply(findings))
        print(f"APPLIED: {n} task(s) reset to pending")


if __name__ == "__main__":
    main()

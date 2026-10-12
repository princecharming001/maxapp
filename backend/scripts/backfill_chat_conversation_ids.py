"""DRY-RUN report: chat_history rows saved with conversation_id NULL since the
multi-chat migration, and the thread each one WOULD be assigned to.

WHY: until H2 (api/chat.py `_send_message_locked` resolves the thread once, up
front) every chat branch that bypassed the agent — the deterministic onboarding
questioner (intake questions + answers), context changes ("i wake up at 7 now"),
broad-question MCQs and generic schedule edits — persisted its ChatHistory rows
WITHOUT a conversation_id. /history filters by thread, so those rows are
invisible in every thread: a user's whole fitmax intake vanished on reload.

This script only READS. It never writes, and it deliberately has no --apply
flag: the assignment below is a heuristic and the owner reviews the report
before any repair is run.

HEURISTIC (per user, rows in time order): a NULL row belongs to the thread that
was active when it was written — the thread holding the most recent threaded
row at or before the NULL row's created_at (the intake's opener always went
through the agent path, so it IS threaded and sits in the "<Max> plan" thread
seconds before the intake rows). A NULL row with no threaded row before it
takes the earliest thread created at or before it; failing that the user's
earliest thread; failing that it is reported as UNASSIGNABLE (the user has no
conversation at all — a repair would have to create a "Chat history" thread,
exactly like the original migration did).

Run from backend/:
    .venv/bin/python -m scripts.backfill_chat_conversation_ids [--since ISO] [--user UUID]
                                                              [--limit N] [--csv PATH] [--verbose]

Defaults: --since = the moment the multi-chat migration ran (MIN(created_at)
of chat_conversations); NULL rows older than that were backfilled by the
migration itself. SMS rows are excluded (never threaded by design).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from bisect import bisect_right
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy import text


@dataclass
class ThreadRow:
    id: str
    title: str
    created_at: datetime
    is_archived: bool


@dataclass
class NullRow:
    id: str
    user_id: str
    role: str
    content: str
    created_at: datetime


@dataclass
class Assignment:
    row: NullRow
    thread_id: Optional[str]
    thread_title: Optional[str]
    reason: str


@dataclass
class UserPlan:
    user_id: str
    assignments: list = field(default_factory=list)


def assign_rows(
    null_rows: list[NullRow],
    threads: list[ThreadRow],
    threaded_marks: list[tuple[datetime, str]],
) -> list[Assignment]:
    """Pure assignment for ONE user.

    `threaded_marks` = (created_at, conversation_id) of the user's rows that DO
    carry a thread, ascending by time. `threads` = the user's conversations.
    """
    by_id = {t.id: t for t in threads}
    mark_times = [m[0] for m in threaded_marks]
    threads_by_created = sorted(threads, key=lambda t: t.created_at)
    out: list[Assignment] = []
    for row in sorted(null_rows, key=lambda r: r.created_at):
        i = bisect_right(mark_times, row.created_at)
        if i > 0:
            tid = threaded_marks[i - 1][1]
            t = by_id.get(tid)
            out.append(Assignment(row, tid, t.title if t else None, "active thread at write time"))
            continue
        before = [t for t in threads_by_created if t.created_at <= row.created_at]
        if before:
            t = before[0]
            out.append(Assignment(row, t.id, t.title, "earliest thread existing at write time"))
            continue
        if threads_by_created:
            t = threads_by_created[0]
            out.append(Assignment(row, t.id, t.title, "user's earliest thread (created later)"))
            continue
        out.append(Assignment(row, None, None, "UNASSIGNABLE: user has no conversation"))
    return out


async def _load(since: Optional[str], user: Optional[str], limit: Optional[int]):
    from db import AsyncSessionLocal  # backend engine; read-only SELECTs below

    async with AsyncSessionLocal() as db:
        if since is None:
            since_dt = (await db.execute(text("SELECT MIN(created_at) FROM chat_conversations"))).scalar()
        else:
            since_dt = datetime.fromisoformat(since)
        if since_dt is None:
            print("no chat_conversations rows at all — nothing to report")
            return since_dt, [], {}, {}

        params: dict = {"since": since_dt}
        user_clause = ""
        if user:
            user_clause = " AND ch.user_id = CAST(:uid AS uuid)"
            params["uid"] = user
        limit_clause = ""
        if limit:
            limit_clause = " LIMIT :lim"
            params["lim"] = int(limit)

        rows = (await db.execute(text(f"""
            SELECT ch.id, ch.user_id, ch.role, LEFT(COALESCE(ch.content, ''), 80), ch.created_at
            FROM chat_history ch
            WHERE ch.conversation_id IS NULL
              AND (ch.channel = 'app' OR ch.channel IS NULL)
              AND ch.created_at >= :since{user_clause}
            ORDER BY ch.user_id, ch.created_at{limit_clause}
        """), params)).all()
        null_rows = [NullRow(str(r[0]), str(r[1]), r[2] or "", r[3] or "", r[4]) for r in rows]
        user_ids = sorted({r.user_id for r in null_rows})
        if not user_ids:
            return since_dt, null_rows, {}, {}

        threads: dict[str, list[ThreadRow]] = defaultdict(list)
        marks: dict[str, list[tuple[datetime, str]]] = defaultdict(list)
        # Chunk the IN-lists so a big report doesn't build one giant statement.
        for i in range(0, len(user_ids), 200):
            chunk = user_ids[i:i + 200]
            trs = (await db.execute(text("""
                SELECT id, user_id, title, created_at, is_archived
                FROM chat_conversations
                WHERE user_id = ANY(CAST(:uids AS uuid[]))
                ORDER BY created_at
            """), {"uids": chunk})).all()
            for t in trs:
                threads[str(t[1])].append(ThreadRow(str(t[0]), t[2] or "", t[3], bool(t[4])))
            mrs = (await db.execute(text("""
                SELECT user_id, conversation_id, created_at
                FROM chat_history
                WHERE conversation_id IS NOT NULL
                  AND user_id = ANY(CAST(:uids AS uuid[]))
                ORDER BY created_at
            """), {"uids": chunk})).all()
            for m in mrs:
                marks[str(m[0])].append((m[2], str(m[1])))
        return since_dt, null_rows, threads, marks


def _print_report(since_dt, null_rows, threads, marks, *, verbose: bool, csv_path: Optional[str]):
    by_user: dict[str, list[NullRow]] = defaultdict(list)
    for r in null_rows:
        by_user[r.user_id].append(r)

    plans: list[UserPlan] = []
    reasons = Counter()
    per_thread = Counter()
    unassignable = 0
    for uid, rows in by_user.items():
        plan = UserPlan(uid, assign_rows(rows, threads.get(uid, []), marks.get(uid, [])))
        plans.append(plan)
        for a in plan.assignments:
            reasons[a.reason] += 1
            if a.thread_id is None:
                unassignable += 1
            else:
                per_thread[(uid, a.thread_id, a.thread_title or "")] += 1

    print("DRY RUN — no rows were or will be modified by this script.")
    print(f"since: {since_dt}  (multi-chat migration moment unless --since given)")
    print(f"NULL-conversation app rows: {len(null_rows)} across {len(by_user)} users")
    print("assignment reasons:")
    for reason, n in reasons.most_common():
        print(f"  {n:6d}  {reason}")
    print(f"unassignable rows: {unassignable}")
    print()
    print("proposed assignments (user, thread title → rows):")
    for (uid, tid, title), n in sorted(per_thread.items(), key=lambda kv: -kv[1])[:50]:
        print(f"  {uid[:8]}…  {tid[:8]}…  {title!r:32}  {n} rows")
    if len(per_thread) > 50:
        print(f"  … {len(per_thread) - 50} more (user, thread) pairs — use --csv for the full list")

    if verbose:
        print()
        for plan in plans:
            print(f"── user {plan.user_id}")
            for a in plan.assignments:
                tgt = f"{a.thread_id[:8]}… {a.thread_title!r}" if a.thread_id else "—"
                print(f"   {a.row.created_at:%Y-%m-%d %H:%M:%S} {a.row.role:9} → {tgt:40} [{a.reason}] {a.row.content!r}")

    if csv_path:
        with open(csv_path, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["chat_history_id", "user_id", "role", "created_at", "proposed_conversation_id",
                        "proposed_thread_title", "reason", "content_preview"])
            for plan in plans:
                for a in plan.assignments:
                    w.writerow([a.row.id, a.row.user_id, a.row.role, a.row.created_at.isoformat(),
                                a.thread_id or "", a.thread_title or "", a.reason, a.row.content])
        print(f"\nfull assignment list written to {csv_path}")

    print("\nA repair, if approved, would be: UPDATE chat_history SET conversation_id = <proposed>"
          " WHERE id = <row id> AND conversation_id IS NULL — per row, from the reviewed CSV."
          " This script does not implement it.")


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", help="ISO timestamp; default = multi-chat migration moment")
    ap.add_argument("--user", help="restrict to one user id")
    ap.add_argument("--limit", type=int, help="cap the number of NULL rows loaded (smoke runs)")
    ap.add_argument("--csv", help="write the full per-row assignment list here")
    ap.add_argument("--verbose", action="store_true", help="print every row")
    # Checked BEFORE argparse so the refusal is explicit rather than an
    # "unrecognized arguments" error that looks like a typo.
    if any(a in ("--apply", "--write", "--execute") for a in (argv if argv is not None else sys.argv[1:])):
        print("refusing: this script is dry-run only and has no write path", file=sys.stderr)
        return 2
    args = ap.parse_args(argv)
    since_dt, null_rows, threads, marks = asyncio.run(_load(args.since, args.user, args.limit))
    _print_report(since_dt, null_rows, threads, marks, verbose=args.verbose, csv_path=args.csv)
    return 0


if __name__ == "__main__":
    sys.exit(main())

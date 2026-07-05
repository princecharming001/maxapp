#!/usr/bin/env python3
"""runner.py — async battery runner.

Usage:
    python runner.py --battery scenarios/battery.yaml --paraphrase-seed 3
    python runner.py --only VIS-01,XMEM-02 --paraphrase-seed 7
    python runner.py --smoke                      # runs scenarios/smoke.yaml only

Writes state/runs/<UTC-ts>/{results.jsonl, transcript-<id>.md, summary.json}.
Exit code 0 iff every scenario is "deterministic-clean" (all checks in every
turn passed). Judging (the 4 RUBRIC.md dimensions) is NOT done here — it's a
job for the iteration agent reading the transcripts, because it needs
qualitative judgment a script can't reliably automate. Turns that declare
`expect.judge` are flagged `needs_judge` in the record so the agent knows
which ones to read.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx

import client as chatclient
from checks import run_checks
from scenarios import load_battery, load_smoke, pick_variant, filter_ids

SEMAPHORE_N = 4  # concurrent scenarios (Anthropic quota guard)
RALPH_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = RALPH_DIR / "state"


def _now_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def _turn_record(scenario_id: str, turn_index: int, variant: str, request: dict,
                  result: chatclient.TurnResult, checks_spec: list, judge_dims: list) -> dict:
    body = result.body if result.ok else (result.body or {})
    response_text = body.get("response", "") if isinstance(body, dict) else ""
    check_results = run_checks(
        checks_spec or [],
        response=response_text,
        body=body if isinstance(body, dict) else {},
        status_code=result.status_code,
        latency_s=result.latency_s,
    )
    # A non-200 turn where the spec didn't explicitly assert http_ok is still
    # a hard failure (a hang/error IS the finding) unless the scenario kind
    # explicitly expects non-200 (rate_limit / concurrency handle that path
    # themselves and don't call this helper the same way).
    transport_ok = result.ok or any(c["name"] == "http_ok" for c in check_results)
    turn_ok = transport_ok and all(c["passed"] for c in check_results)
    return {
        "scenario": scenario_id,
        "turn_index": turn_index,
        "variant": variant,
        "request": request,
        "response_body": body if isinstance(body, dict) else {"_error": result.error},
        "status_code": result.status_code,
        "latency_s": round(result.latency_s, 2),
        "transport_error": result.error,
        "checks": check_results,
        "needs_judge": judge_dims or [],
        "turn_ok": turn_ok,
    }


async def _run_standard(http: httpx.AsyncClient, scenario: dict, seed: int) -> list[dict]:
    user = await chatclient.mint_user(http, scenario["user"])
    conv_id = None
    records = []
    for i, turn in enumerate(scenario["turns"]):
        send = turn["send"]
        message = pick_variant(send["message"], seed)
        result = await chatclient.send_turn(
            http, user, message,
            conversation_id=conv_id,
            init_context=send.get("init_context"),
            chat_intent=send.get("chat_intent"),
        )
        if result.ok and conv_id is None:
            conv_id = result.body.get("conversation_id")
        expect = turn.get("expect", {})
        rec = _turn_record(
            scenario["id"], i, message,
            {"message": message, "conversation_id": conv_id, **{k: v for k, v in send.items() if k != "message"}},
            result, expect.get("deterministic", []), expect.get("judge", []),
        )
        records.append(rec)
    return records


async def _run_cross_conversation(http: httpx.AsyncClient, scenario: dict, seed: int) -> list[dict]:
    user = await chatclient.mint_user(http, scenario["user"])
    records = []

    conv_a_id = await chatclient.new_conversation(http, user, title="ralph-chat convo A")
    for i, turn in enumerate(scenario["conversation_a"]["turns"]):
        send = turn["send"]
        message = pick_variant(send["message"], seed)
        result = await chatclient.send_turn(http, user, message, conversation_id=conv_a_id)
        expect = turn.get("expect", {})
        records.append(_turn_record(
            f"{scenario['id']}:A", i, message, {"message": message, "conversation_id": conv_a_id},
            result, expect.get("deterministic", []), expect.get("judge", []),
        ))

    sleep_s = scenario.get("conversation_b", {}).get("sleep_before_s", 0)
    if sleep_s:
        await asyncio.sleep(sleep_s)

    conv_b_id = await chatclient.new_conversation(http, user, title="ralph-chat convo B")
    for i, turn in enumerate(scenario["conversation_b"]["turns"]):
        send = turn["send"]
        message = pick_variant(send["message"], seed)
        result = await chatclient.send_turn(http, user, message, conversation_id=conv_b_id)
        expect = turn.get("expect", {})
        records.append(_turn_record(
            f"{scenario['id']}:B", i, message, {"message": message, "conversation_id": conv_b_id},
            result, expect.get("deterministic", []), expect.get("judge", []),
        ))
    return records


async def _run_onboarding_intake(http: httpx.AsyncClient, scenario: dict, seed: int) -> list[dict]:
    user = await chatclient.mint_user(http, scenario["user"])
    records = []
    conv_id = None

    start = scenario["start"]
    result = await chatclient.send_turn(
        http, user, start["message"],
        init_context=start.get("init_context"), chat_intent=start.get("chat_intent"),
    )
    if result.ok:
        conv_id = result.body.get("conversation_id")
    each = scenario.get("checks_each_turn", {})
    records.append(_turn_record(
        scenario["id"], 0, start["message"], {"message": start["message"], "phase": "start"},
        result, each.get("deterministic", []), each.get("judge", []),
    ))

    answers = list(scenario.get("answers", []))
    max_turns = scenario.get("max_turns", len(answers) + 2)
    interrupt_after = scenario.get("interrupt_after_turn")
    turn_n = 1

    while answers and turn_n < max_turns:
        if interrupt_after == turn_n:
            interrupt_msg = scenario["interrupt_message"]
            r = await chatclient.send_turn(http, user, interrupt_msg, conversation_id=conv_id)
            ic = scenario.get("interrupt_checks", {})
            records.append(_turn_record(
                scenario["id"], turn_n, interrupt_msg, {"message": interrupt_msg, "phase": "interrupt"},
                r, ic.get("deterministic", []), ic.get("judge", []),
            ))
            turn_n += 1
            if scenario.get("resume_check"):
                hist = await chatclient.get_history(http, user, conversation_id=conv_id)
                resumed = bool(hist.get("pending_question"))
                records.append({
                    "scenario": scenario["id"], "turn_index": turn_n, "variant": "(history check)",
                    "request": {"phase": "resume_check"}, "response_body": {"pending_question": hist.get("pending_question")},
                    "status_code": 200, "latency_s": 0.0, "transport_error": None,
                    "checks": [{"name": "onboarding_resumed", "passed": resumed,
                                "detail": "pending_question present after interrupt" if resumed else "pending_question missing — intake may have been dropped by the interrupt"}],
                    "needs_judge": [], "turn_ok": resumed,
                })
            continue

        answer = answers.pop(0)
        r = await chatclient.send_turn(http, user, answer, conversation_id=conv_id)
        records.append(_turn_record(
            scenario["id"], turn_n, answer, {"message": answer, "phase": "answer"},
            r, each.get("deterministic", []), each.get("judge", []),
        ))
        turn_n += 1

    final = scenario.get("checks_final")
    if final and records:
        last_body = records[-1]["response_body"]
        last_result = chatclient.TurnResult(ok=True, status_code=200, latency_s=0.0, body=last_body)
        rec = _turn_record(
            scenario["id"], turn_n, "(final check on last response)", {"phase": "final"},
            last_result, final.get("deterministic", []), final.get("judge", []),
        )
        records.append(rec)

    return records


async def _run_concurrency(http: httpx.AsyncClient, scenario: dict) -> list[dict]:
    user = await chatclient.mint_user(http, scenario["user"])
    messages = scenario["messages"]
    # Pin both concurrent turns to ONE explicit conversation so the probe
    # isolates what it's meant to test — the per-user chat lock serializing
    # two in-thread turns without cross-answer bleed — rather than a
    # different hazard (a race in "no conversation_id -> auto-create/reuse
    # latest" when two first-ever requests land at the same instant).
    conv_id = await chatclient.new_conversation(http, user, title="ralph-chat concurrency probe")
    results = await asyncio.gather(*[
        chatclient.send_turn(http, user, m, conversation_id=conv_id) for m in messages
    ])
    records = []
    all_ok = all(r.ok for r in results)
    replies = [r.body.get("response", "") if r.ok else "" for r in results]
    distinct = len(set(replies)) == len(replies) if all(replies) else False
    lat_ok = all(r.latency_s < scenario.get("expect_latency_lt", 120) for r in results)
    for i, (m, r) in enumerate(zip(messages, results)):
        records.append({
            "scenario": scenario["id"], "turn_index": i, "variant": m,
            "request": {"message": m, "concurrent_with": len(messages) - 1},
            "response_body": r.body if r.ok else {"_error": r.error},
            "status_code": r.status_code, "latency_s": round(r.latency_s, 2),
            "transport_error": r.error,
            "checks": [
                {"name": "concurrent_ok", "passed": r.ok, "detail": f"status={r.status_code} error={r.error}"},
                {"name": "concurrent_latency_lt", "passed": r.latency_s < scenario.get("expect_latency_lt", 120), "detail": f"{r.latency_s:.1f}s"},
                {"name": "concurrent_distinct_replies", "passed": distinct, "detail": f"{len(set(replies))}/{len(replies)} distinct"},
            ],
            "needs_judge": [],
            "turn_ok": r.ok and lat_ok and distinct,
        })
    return records


async def _run_rate_limit(http: httpx.AsyncClient, scenario: dict) -> list[dict]:
    user = await chatclient.mint_user(http, scenario["user"])
    message = scenario["message"]
    count = scenario["count"]
    gap_s = scenario.get("gap_s", 0.2)

    async def _fire(i: int) -> chatclient.TurnResult:
        await asyncio.sleep(i * gap_s)
        return await chatclient.send_turn(http, user, f"{message} ({i})")

    results = await asyncio.gather(*[_fire(i) for i in range(count)])
    records = []
    for i, r in enumerate(results):
        clean = r.status_code == 200 or r.status_code == 429
        never_hang_or_500 = r.error != "timeout" and r.status_code not in (500, 502, 503)
        records.append({
            "scenario": scenario["id"], "turn_index": i, "variant": message,
            "request": {"message": message, "burst_index": i},
            "response_body": r.body if r.ok else {"_error": r.error},
            "status_code": r.status_code, "latency_s": round(r.latency_s, 2),
            "transport_error": r.error,
            "checks": [
                {"name": "rate_limit_clean_status", "passed": clean, "detail": f"status={r.status_code}"},
                {"name": "rate_limit_no_hang_or_500", "passed": never_hang_or_500, "detail": f"status={r.status_code} error={r.error}"},
            ],
            "needs_judge": [],
            "turn_ok": clean and never_hang_or_500,
        })
    return records


_RUNNERS = {
    "standard": _run_standard,
    "cross_conversation": _run_cross_conversation,
    "onboarding_intake": _run_onboarding_intake,
    "concurrency": _run_concurrency,
    "rate_limit": _run_rate_limit,
}


async def _run_scenario(http_factory, scenario: dict, seed: int) -> list[dict]:
    kind = scenario.get("kind", "standard")
    fn = _RUNNERS.get(kind)
    if fn is None:
        return [{
            "scenario": scenario["id"], "turn_index": 0, "variant": "(n/a)",
            "request": {}, "response_body": {}, "status_code": 0, "latency_s": 0.0,
            "transport_error": f"unknown scenario kind: {kind!r}",
            "checks": [{"name": "known_kind", "passed": False, "detail": f"unknown kind {kind!r}"}],
            "needs_judge": [], "turn_ok": False,
        }]
    async with http_factory() as http:
        if kind in ("concurrency", "rate_limit"):
            return await fn(http, scenario)
        return await fn(http, scenario, seed)


def _write_transcript(run_dir: Path, scenario_id: str, records: list[dict]) -> None:
    lines = [f"# {scenario_id}\n"]
    for rec in records:
        lines.append(f"## turn {rec['turn_index']} ({rec.get('variant', '')!r})\n")
        req = rec.get("request", {})
        if "message" in req:
            lines.append(f"**user:** {req['message']}\n")
        body = rec.get("response_body", {}) or {}
        lines.append(f"**assistant:** {body.get('response', '(no prose)')}\n")
        if body.get("choices"):
            lines.append(f"- choices: {body['choices']} (multi={body.get('multi_choice')})\n")
        if body.get("visual_blocks"):
            lines.append(f"- visual_blocks:\n```json\n{json.dumps(body['visual_blocks'], indent=2)}\n```\n")
        if body.get("method_metadata"):
            lines.append(f"- method_metadata:\n```json\n{json.dumps(body['method_metadata'], indent=2)}\n```\n")
        if body.get("products"):
            lines.append(f"- products: {len(body['products'])} item(s)\n")
        lines.append(f"- status={rec.get('status_code')} latency={rec.get('latency_s')}s error={rec.get('transport_error')}\n")
        lines.append("- checks:\n")
        for c in rec.get("checks", []):
            mark = "PASS" if c["passed"] else "FAIL"
            lines.append(f"  - [{mark}] {c['name']}: {c['detail']}\n")
        if rec.get("needs_judge"):
            lines.append(f"- needs_judge: {rec['needs_judge']}\n")
        lines.append("\n")
    (run_dir / f"transcript-{scenario_id.replace(':', '_')}.md").write_text("".join(lines))


async def main_async(args) -> int:
    battery = load_smoke(args.smoke_path) if args.smoke else load_battery(args.battery)
    battery = filter_ids(battery, args.only.split(",") if args.only else None)

    run_dir = STATE_DIR / "runs" / _now_ts()
    run_dir.mkdir(parents=True, exist_ok=True)

    sem = asyncio.Semaphore(SEMAPHORE_N)
    results_path = run_dir / "results.jsonl"
    all_records: dict[str, list[dict]] = {}

    async def _bounded(scenario):
        async with sem:
            recs = await _run_scenario(
                lambda: httpx.AsyncClient(), scenario, args.paraphrase_seed
            )
            return scenario["id"], recs

    # Serial scenarios (concurrency/rate_limit probes) run AFTER everything
    # else so their deliberate load can't skew other scenarios' latency.
    parallel_scenarios = [s for s in battery if s.get("kind") not in ("concurrency", "rate_limit")]
    serial_scenarios = [s for s in battery if s.get("kind") in ("concurrency", "rate_limit")]

    tasks = [_bounded(s) for s in parallel_scenarios]
    for coro in asyncio.as_completed(tasks):
        sid, recs = await coro
        all_records[sid] = recs

    for s in serial_scenarios:
        sid, recs = await _bounded(s)
        all_records[sid] = recs

    with open(results_path, "w") as f:
        for sid, recs in all_records.items():
            for rec in recs:
                f.write(json.dumps(rec) + "\n")

    summary = {"run_id": run_dir.name, "started": run_dir.name, "scenarios": {}}
    deterministic_clean = True
    for sid, recs in all_records.items():
        _write_transcript(run_dir, sid, recs)
        scenario_ok = all(r["turn_ok"] for r in recs)
        failed_checks = [
            f"turn{r['turn_index']}:{c['name']}" for r in recs for c in r["checks"] if not c["passed"]
        ]
        needs_judge = any(r.get("needs_judge") for r in recs)
        summary["scenarios"][sid] = {
            "status": "pass" if scenario_ok else "fail",
            "failed_checks": failed_checks,
            "needs_judge": needs_judge,
        }
        if not scenario_ok:
            deterministic_clean = False

    summary["deterministic_clean"] = deterministic_clean
    (run_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    print(f"Run: {run_dir}")
    n_pass = sum(1 for v in summary["scenarios"].values() if v["status"] == "pass")
    print(f"Scenarios: {n_pass}/{len(summary['scenarios'])} deterministic-pass")
    if not deterministic_clean:
        for sid, v in summary["scenarios"].items():
            if v["status"] == "fail":
                print(f"  FAIL {sid}: {v['failed_checks']}")

    return 0 if deterministic_clean else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--battery", default=None, help="path to battery.yaml (default: scenarios/battery.yaml)")
    ap.add_argument("--only", default=None, help="comma-separated scenario ids")
    ap.add_argument("--paraphrase-seed", type=int, default=0)
    ap.add_argument("--smoke", action="store_true", help="run scenarios/smoke.yaml instead of the battery")
    ap.add_argument("--smoke-path", default=None)
    args = ap.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())

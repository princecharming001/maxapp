#!/usr/bin/env python3
"""preflight.py — health gate the loop runs before every iteration.

Checks (in order), any failure exits non-zero with a one-line reason on stdout
(the agent maps this to a `BLOCKED (env)` PROGRESS entry, never a FINDINGS item):

  1. Backend up on :8002 with db:true. If down, or if the tracked git HEAD /
     backend dirty-hash changed since we last started it (prompt cache + code
     are load-once at process start — a fix that edits a fallback prompt or
     extraction function needs a restart to actually take effect), restart it
     via a pidfile we own. NEVER touches the OTHER uvicorn on :8000 (a
     different project's server).
  2. A real LLM answer: mint a throwaway user, send one smoke turn, assert a
     substantive reply that isn't one of the three friendly-error copies.
  3. Snapshot which PromptKeys resolve from Supabase vs the in-code fallback
     (state/prompt_sources.json) — tells the fix step where a prompt edit must
     land to be locally testable.

Run standalone: `python preflight.py --ensure-backend`
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import httpx

RALPH_DIR = Path(__file__).resolve().parent.parent  # /Users/home/maxapp/ralph-chat
APP_ROOT = RALPH_DIR.parent  # /Users/home/maxapp
BACKEND_DIR = APP_ROOT / "backend"
VENV_PYTHON = APP_ROOT / ".venv" / "bin" / "python"
STATE_DIR = RALPH_DIR / "state"
RALPH_STATE = RALPH_DIR / ".ralph"

HEALTH_URL = "http://localhost:8002/health"
BASE_URL = "http://localhost:8002/api"

FRIENDLY_ERROR_MARKERS = (
    "usage or billing limit",
    "trouble reaching my brain",
    "took too long",
)


def _backend_dirty_hash() -> str:
    """A cheap fingerprint of backend/ so an UNCOMMITTED fix (edited a fallback
    prompt string, tweaked an extraction fn) still forces a restart even though
    git HEAD hasn't moved yet."""
    h = hashlib.sha256()
    try:
        out = subprocess.run(
            ["git", "-C", str(APP_ROOT), "diff", "--", "backend/"],
            capture_output=True, text=True, timeout=15,
        ).stdout
        h.update(out.encode("utf-8", "ignore"))
        head = subprocess.run(
            ["git", "-C", str(APP_ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
        h.update(head.encode())
    except Exception:
        pass
    return h.hexdigest()[:16]


def _read_server_head() -> str | None:
    p = RALPH_STATE / "server_head"
    return p.read_text().strip() if p.exists() else None


def _write_server_head(head: str) -> None:
    RALPH_STATE.mkdir(parents=True, exist_ok=True)
    (RALPH_STATE / "server_head").write_text(head)


def _pidfile() -> Path:
    return RALPH_STATE / "backend.pid"


def _pid_listening_on_8002() -> int | None:
    """Whatever process currently owns :8002 — regardless of who started it.
    Port 8002 is maxapp's backend exclusively (unlike :8000, which a separate
    project's server squats), so it's safe for the loop to manage across
    restarts even if it didn't originally start the process."""
    try:
        out = subprocess.run(
            ["lsof", "-tiTCP:8002", "-sTCP:LISTEN"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        pids = [int(p) for p in out.splitlines() if p.strip()]
        return pids[0] if pids else None
    except Exception:
        return None


def _stop_backend_on_8002() -> None:
    pid = _pid_listening_on_8002()
    if pid is None:
        _pidfile().unlink(missing_ok=True)
        return
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(20):
            time.sleep(0.5)
            if _pid_listening_on_8002() != pid:
                break
    except ProcessLookupError:
        pass
    _pidfile().unlink(missing_ok=True)


def _start_backend() -> None:
    RALPH_STATE.mkdir(parents=True, exist_ok=True)
    log_path = RALPH_STATE / "backend.log"
    with open(log_path, "a") as log:
        proc = subprocess.Popen(
            [str(VENV_PYTHON), "-m", "uvicorn", "main:app", "--host", "0.0.0.0",
             "--port", "8002", "--log-level", "warning"],
            cwd=str(BACKEND_DIR),
            stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    _pidfile().write_text(str(proc.pid))


def _health_ok() -> bool:
    try:
        r = httpx.get(HEALTH_URL, timeout=5.0)
        return r.status_code == 200 and r.json().get("db") is True
    except Exception:
        return False


def ensure_backend(max_wait_s: float = 90.0) -> tuple[bool, str]:
    current_head = _backend_dirty_hash()
    tracked_head = _read_server_head()
    needs_restart = tracked_head is not None and tracked_head != current_head

    if _health_ok() and not needs_restart:
        # First-ever check with a healthy server and no tracked head yet:
        # adopt it (record its fingerprint) without restarting — whoever
        # started :8002 (us on a prior run, or a manual `preview_start`) is
        # fine; we only need to know WHEN to bounce it next time.
        if tracked_head is None:
            _write_server_head(current_head)
        return True, "backend already healthy, no restart needed"

    if needs_restart:
        _stop_backend_on_8002()

    if not _health_ok():
        _start_backend()

    deadline = time.monotonic() + max_wait_s
    while time.monotonic() < deadline:
        if _health_ok():
            _write_server_head(current_head)
            return True, "backend started/restarted and healthy"
        time.sleep(1.0)
    return False, f"backend did not become healthy within {max_wait_s}s (see .ralph/backend.log)"


async def _smoke_llm_check() -> tuple[bool, str]:
    from client import mint_user, send_turn  # local import: harness/ on sys.path

    async with httpx.AsyncClient() as http:
        try:
            user = await mint_user(http, "skip")
        except Exception as e:
            return False, f"could not mint faux user: {e}"

        result = await send_turn(http, user, "In one short sentence, why does sunscreen matter?")
        if not result.ok:
            return False, f"smoke turn failed: status={result.status_code} error={result.error}"

        reply = (result.body or {}).get("response", "") or ""
        if len(reply.strip()) < 40:
            return False, f"smoke reply too short ({len(reply.strip())} chars): {reply!r}"
        low = reply.lower()
        for marker in FRIENDLY_ERROR_MARKERS:
            if marker in low:
                return False, f"smoke reply is the friendly-error fallback (marker: {marker!r}) — check LLM keys/quota"
        if result.latency_s > 60:
            return False, f"smoke turn took {result.latency_s:.1f}s (>60s ceiling)"
        return True, f"real LLM answer in {result.latency_s:.1f}s: {reply[:80]!r}"


def _snapshot_prompt_sources() -> tuple[bool, str]:
    """Best-effort: ask the running backend, in-process via its own venv, which
    PromptKeys resolve from Supabase vs fallback. Never fatal — if this fails we
    just don't have the hint and the fix step falls back to grepping the code."""
    script = (
        "import asyncio, json, sys; sys.path.insert(0, '.'); "
        "from services.prompt_loader import refresh_prompt_cache, _CACHE, PromptKey; "
        "asyncio.run(refresh_prompt_cache()); "
        "keys = [k for k in dir(PromptKey) if not k.startswith('_')]; "
        "out = {k: ('supabase' if getattr(PromptKey, k) in _CACHE else 'fallback') for k in keys}; "
        "print(json.dumps(out))"
    )
    try:
        proc = subprocess.run(
            [str(VENV_PYTHON), "-c", script],
            cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=30,
        )
        if proc.returncode != 0:
            return False, f"prompt-source snapshot failed (non-fatal): {proc.stderr[-300:]}"
        data = json.loads(proc.stdout.strip().splitlines()[-1])
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        (STATE_DIR / "prompt_sources.json").write_text(json.dumps(data, indent=2))
        n_supabase = sum(1 for v in data.values() if v == "supabase")
        return True, f"{len(data)} prompt keys snapshotted ({n_supabase} from supabase, {len(data)-n_supabase} fallback)"
    except Exception as e:
        return False, f"prompt-source snapshot failed (non-fatal): {e}"


def _record_baseline_pytest_if_absent() -> None:
    baseline = STATE_DIR / "baseline_pytest.txt"
    if baseline.exists():
        return
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    # Scoped to tests/ — bare `pytest -q` from backend/ also collects
    # test_supabase.py and scripts/test_db_connection.py (standalone
    # diagnostic scripts, not real tests) which error at collection with no
    # pytest.ini to exclude them.
    proc = subprocess.run(
        [str(VENV_PYTHON), "-m", "pytest", "tests/", "-q"],
        cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=600,
    )
    baseline.write_text((proc.stdout or "") + "\n" + (proc.stderr or ""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ensure-backend", action="store_true")
    ap.add_argument("--skip-baseline", action="store_true")
    args = ap.parse_args()

    if args.ensure_backend:
        ok, msg = ensure_backend()
        print(f"[backend] {'OK' if ok else 'FAIL'}: {msg}")
        if not ok:
            return 1

    ok, msg = asyncio.run(_smoke_llm_check())
    print(f"[llm-smoke] {'OK' if ok else 'FAIL'}: {msg}")
    if not ok:
        return 1

    ok, msg = _snapshot_prompt_sources()
    print(f"[prompt-sources] {'OK' if ok else 'WARN'}: {msg}")

    if not args.skip_baseline:
        _record_baseline_pytest_if_absent()
        print("[baseline] state/baseline_pytest.txt present")

    print("PREFLIGHT PASS")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())

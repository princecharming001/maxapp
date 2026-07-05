#!/usr/bin/env bash
# ralph.sh — the ralph-chat loop driver, adapted from the forgefiles pattern
# (/Users/home/Downloads/forgefiles/scripts/ralph.sh): a stateless while-loop
# invoking `claude -p` with fresh context each pass. State lives entirely on
# disk (FINDINGS.md / PROGRESS.md / .ralph/*) — never in this shell's memory.
#
# Usage: ./ralph.sh [max_iterations]   (default 60 — battery passes cost real
#                                        LLM calls, kept lower than forge's 400)
set -uo pipefail

ROOT="/Users/home/maxapp/ralph-chat"
APP="/Users/home/maxapp"
cd "$APP"   # the agent works from the app repo root, not ralph-chat/

MAX="${1:-60}"
i=0
nostall=0
mkdir -p "$ROOT/.ralph"

echo "ralph-chat loop starting (max $MAX iterations). Kill anytime: touch $ROOT/.ralph/STOP"

while [ "$i" -lt "$MAX" ]; do
  i=$((i + 1))

  if [ -f "$ROOT/.ralph/STOP" ]; then
    echo "STOP file present. Halting."
    break
  fi

  # Done when: no open findings AND two consecutive clean battery runs.
  # clean_streak is written only by the agent's post-battery triage step
  # (RALPH_PROMPT.md step 2a) — it is the sole authority on this count.
  streak=$(cat "$ROOT/.ralph/clean_streak" 2>/dev/null || echo 0)
  if ! grep -q '^- \[ \]' "$ROOT/FINDINGS.md" 2>/dev/null && [ "$streak" -ge 2 ]; then
    if grep -q '^- \[!\]' "$ROOT/FINDINGS.md" 2>/dev/null; then
      echo "No open findings and two consecutive clean batteries — but QUARANTINED [!] items remain. Human review needed."
    else
      echo "Two consecutive clean battery runs, zero open findings. DONE."
    fi
    break
  fi

  echo "===== ralph-chat iteration $i  $(date -u +%FT%TZ) ====="
  before=$(wc -l < "$ROOT/PROGRESS.md" 2>/dev/null || echo 0)

  claude -p "$(cat "$ROOT/RALPH_PROMPT.md")" --dangerously-skip-permissions 2>&1 \
    | tee -a "$ROOT/.ralph/iter-$i.log"

  after=$(wc -l < "$ROOT/PROGRESS.md" 2>/dev/null || echo 0)
  if [ "$after" -le "$before" ]; then
    nostall=$((nostall + 1))
  else
    nostall=0
  fi
  if [ "$nostall" -ge 3 ]; then
    echo "No PROGRESS.md growth in 3 consecutive passes. Halting for review."
    break
  fi

  sleep 2
done

echo "Loop finished after $i iteration(s)."
/Users/home/maxapp/.venv/bin/python "$ROOT/harness/report.py" 2>/dev/null || true
echo "Report: $ROOT/state/FINAL_REPORT.md"

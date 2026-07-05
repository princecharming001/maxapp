#!/usr/bin/env python3
"""report.py — final report generator. Reads FINDINGS.md, PROGRESS.md,
DEPLOY_NOTES.md, and every state/runs/*/summary.json, and writes
state/FINAL_REPORT.md. Run standalone any time for a status snapshot; the
loop also runs it unconditionally when it stops (PROJECT COMPLETE or driver
cap/circuit-breaker exit)."""
from __future__ import annotations

import json
import re
from pathlib import Path

RALPH_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = RALPH_DIR / "state"

_FINDING_RE = re.compile(r"^- \[([ x!])\] (F-\d+)\s+(.*?)(?:\s*\|\s*class:\s*(\S+))?$")


def _parse_findings() -> list[dict]:
    path = RALPH_DIR / "FINDINGS.md"
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        m = _FINDING_RE.match(line.strip())
        if m:
            status, fid, title, cls = m.groups()
            out.append({
                "id": fid,
                "status": {"x": "fixed", "!": "quarantined", " ": "open"}[status],
                "title": title.strip(),
                "class": cls,
            })
    return out


def _all_run_summaries() -> list[dict]:
    runs_dir = STATE_DIR / "runs"
    if not runs_dir.exists():
        return []
    out = []
    for d in sorted(runs_dir.iterdir()):
        sp = d / "summary.json"
        if sp.exists():
            try:
                out.append({"run": d.name, **json.loads(sp.read_text())})
            except Exception:
                pass
    return out


def _progress_iteration_count() -> int:
    path = RALPH_DIR / "PROGRESS.md"
    if not path.exists():
        return 0
    return len(re.findall(r"^### .* — iter \d+", path.read_text(), re.MULTILINE))


def main() -> int:
    findings = _parse_findings()
    fixed = [f for f in findings if f["status"] == "fixed"]
    open_ = [f for f in findings if f["status"] == "open"]
    quarantined = [f for f in findings if f["status"] == "quarantined"]
    runs = _all_run_summaries()
    last_run = runs[-1] if runs else None

    lines = ["# ralph-chat — final report\n"]
    lines.append(f"Iterations run: {_progress_iteration_count()}\n")
    lines.append(f"Total findings: {len(findings)} — {len(fixed)} fixed, {len(open_)} open, {len(quarantined)} quarantined\n")

    if last_run:
        lines.append(f"\n## Latest battery run: `{last_run['run']}`\n")
        clean = last_run.get("deterministic_clean")
        lines.append(f"Deterministic-clean: **{clean}**\n")
        n_pass = sum(1 for v in last_run.get("scenarios", {}).values() if v.get("status") == "pass")
        n_total = len(last_run.get("scenarios", {}))
        lines.append(f"Scenarios: {n_pass}/{n_total} passed deterministic checks\n")
        if not clean:
            lines.append("\nFailing scenarios:\n")
            for sid, v in last_run.get("scenarios", {}).items():
                if v.get("status") != "pass":
                    lines.append(f"- `{sid}`: {v.get('failed_checks')}\n")

    if fixed:
        lines.append("\n## Fixed\n")
        for f in fixed:
            lines.append(f"- **{f['id']}** ({f['class']}) — {f['title']}\n")

    if open_:
        lines.append("\n## Still open\n")
        for f in open_:
            lines.append(f"- **{f['id']}** ({f['class']}) — {f['title']}\n")

    if quarantined:
        lines.append("\n## Quarantined (needs human review)\n")
        for f in quarantined:
            lines.append(f"- **{f['id']}** ({f['class']}) — {f['title']}\n")

    deploy_path = RALPH_DIR / "DEPLOY_NOTES.md"
    if deploy_path.exists():
        deploy_text = deploy_path.read_text()
        entries_marker = "## Per-fix entries"
        if entries_marker in deploy_text:
            after = deploy_text.split(entries_marker, 1)[1]
            after = after.split("<!-- Format:", 1)[0].strip()
            if after:
                lines.append("\n## Deploy follow-ups (from DEPLOY_NOTES.md)\n")
                lines.append(after + "\n")

    out_path = STATE_DIR / "FINAL_REPORT.md"
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text("".join(lines))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

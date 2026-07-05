"""scenarios.py — battery.yaml loader + paraphrase-variant selection.

variant selection: for a `message` field that is a list of paraphrase
strings, the chosen variant = `seed % len(variants)`. The runner passes the
current iteration number (or an explicit --paraphrase-seed) as `seed` so a
verification re-run after a fix naturally lands on a DIFFERENT wording than
whatever failed — the anti-overfit mechanism RALPH_PROMPT.md's fix policy
relies on.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "scenarios"


def load_battery(path: str | Path | None = None) -> list[dict]:
    p = Path(path) if path else (SCENARIOS_DIR / "battery.yaml")
    with open(p) as f:
        data = yaml.safe_load(f) or []
    ids = [s["id"] for s in data]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"duplicate scenario ids in {p}: {dupes}")
    return data


def load_smoke(path: str | Path | None = None) -> list[dict]:
    p = Path(path) if path else (SCENARIOS_DIR / "smoke.yaml")
    with open(p) as f:
        return yaml.safe_load(f) or []


def pick_variant(message: Any, seed: int) -> str:
    """`message` is either a bare string or a list of paraphrase variants."""
    if isinstance(message, str):
        return message
    if isinstance(message, list) and message:
        return message[seed % len(message)]
    raise ValueError(f"malformed message field: {message!r}")


def filter_ids(scenarios: list[dict], only: list[str] | None) -> list[dict]:
    if not only:
        return scenarios
    wanted = set(only)
    return [s for s in scenarios if s["id"] in wanted]

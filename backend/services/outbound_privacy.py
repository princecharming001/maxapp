"""Nothing that leaves the app for a lock screen, an SMS thread or a calendar
names a peptide or a medication.

Peptidemax data is consumer health data (Washington's My Health My Data Act,
Nevada, Connecticut). Pushes pass through Apple, SMS through Sendblue and the
carrier, mirrored events through Google, and all three show up where other
people can see them: a lock screen, a shared work calendar. So:

  * Peptidemax tasks travel under a neutral title ("Private reminder").
  * Every push alert and proactive SMS gets a last check: if it names a
    peptide (any catalog name, brand or nickname) or says peptide/injection,
    it's replaced with neutral copy. AI-written check-ins can't leak either.

Inside the app (the chat, the plan) nothing changes.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Optional

PEPTIDE_PROGRAM = "peptidemax"
PRIVATE_TITLE = "Private reminder"
PRIVATE_BODY = "you have a private reminder. open superpower to see it."

_EXTRA = ("peptide", "peptides", "peptidemax", "glp-1", "glp1", "glp-1s", "injection", "injections",
          "inject", "injecting", "injectable", "syringe", "syringes", "sharps")


@lru_cache(maxsize=1)
def _pattern() -> re.Pattern:
    from services.peptide_intake import CATALOG
    words = {a.lower() for p in CATALOG for a in p.aliases} | {p.name.lower() for p in CATALOG} | set(_EXTRA)
    alts = sorted((re.escape(w) for w in words if w), key=len, reverse=True)
    return re.compile(rf"(?<![a-z0-9])(?:{'|'.join(alts)})(?![a-z0-9])", re.I)


def mentions_health_detail(text: Optional[str]) -> bool:
    return bool(text) and bool(_pattern().search(str(text)))


def is_private_task(task: dict) -> bool:
    """A Peptidemax task, however the row records its program."""
    prov = task.get("provenance") if isinstance(task.get("provenance"), dict) else {}
    progs = (task.get("maxx_id"), prov.get("program_id"), str(task.get("catalog_id") or "").split(".")[0])
    return any(str(p or "").strip().lower() == PEPTIDE_PROGRAM for p in progs)


def task_title(task: dict, title: Optional[str] = None) -> str:
    """The title a task travels under outside the app."""
    title = str(title if title is not None else task.get("title") or "")
    if is_private_task(task) or mentions_health_detail(title):
        return PRIVATE_TITLE
    return title


def scrub_alert(title: str, body: str, custom: Optional[dict[str, Any]] = None) -> tuple[str, str, Optional[dict]]:
    """A push's visible text and its data payload, made safe for a lock screen."""
    if mentions_health_detail(title) or mentions_health_detail(body):
        title, body = "Superpower", PRIVATE_BODY
    if custom:
        custom = dict(custom)
        for k in ("title", "task", "task_title"):
            if isinstance(custom.get(k), str) and mentions_health_detail(custom[k]):
                custom[k] = PRIVATE_TITLE
        params = custom.get("params")
        if isinstance(params, dict) and isinstance(params.get("title"), str) and mentions_health_detail(params["title"]):
            custom["params"] = {**params, "title": PRIVATE_TITLE}
    return title, body, custom


def scrub_sms(message: str) -> str:
    return PRIVATE_BODY if mentions_health_detail(message) else message

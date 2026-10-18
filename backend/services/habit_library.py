"""Raw habit-library entries and dose ranges, for task guides and product picks.

`services.ai_programs.parse_program_doc` keeps only the fields the planner
needs. Task guides also need the rest of a habit's entry (dose note, timing,
avoid if, and the C1 `kind` line once the docs carry it), so this module reads
every `- key: value` line of one `### \`habit_id\`` block straight from the
program doc's text. Read-only; the docs stay owned by ai_programs.

Dose ranges: "0.5–3 mg", "1,000–2,000 IU", "2.5 to 10 g". A product's
strength ("3 mg", "1000 IU") is compared against the range in the library's
`how` (the pick the library recommends) or, failing that, the dose note.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

_HEAD = re.compile(r"^###\s+`([a-z0-9_]+)`\s*[—–-]\s*(.+?)\s*$")
_FIELD = re.compile(r"^-\s*([a-z /]+?):\s*(.*)$", re.IGNORECASE)

# units a serving is labelled in; grams only from an explicit catalog field
# (a "500g" in a product name is the tub, not the serving)
_UNIT = r"(mcg|µg|ug|mg|iu|g)"
_NUM = r"(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)"
_RANGE = re.compile(_NUM + r"\s*(?:" + _UNIT + r"\s*)?(?:–|—|-|to)\s*" + _NUM + r"\s*" + _UNIT + r"\b", re.IGNORECASE)
_SINGLE = re.compile(_NUM + r"\s*" + _UNIT + r"\b", re.IGNORECASE)


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def _unit(u: str) -> str:
    u = (u or "").lower()
    return {"µg": "mcg", "ug": "mcg"}.get(u, u)


# everything in mg where a conversion exists; IU stays IU
_TO_MG = {"mg": 1.0, "mcg": 0.001, "g": 1000.0}


def _mg(v: float, unit: str) -> tuple[float, str]:
    if unit in _TO_MG:
        return v * _TO_MG[unit], "mg"
    return v, unit


@dataclass(frozen=True)
class DoseRange:
    lo: float
    hi: float
    unit: str
    text: str            # as written, e.g. "0.5–3 mg"

    def contains(self, value: float, unit: str) -> Optional[bool]:
        """True/False when comparable, None when the units differ (mg vs IU)."""
        a, ua = _mg(self.lo, self.unit)
        b, _ = _mg(self.hi, self.unit)
        v, uv = _mg(value, _unit(unit))
        if ua != uv:
            return None
        return a - 1e-9 <= v <= b + 1e-9

    def at_low_end(self, value: float, unit: str) -> bool:
        a, ua = _mg(self.lo, self.unit)
        v, uv = _mg(value, _unit(unit))
        return ua == uv and abs(v - a) < 1e-9


def _fmt(v: float) -> str:
    return f"{v:g}" if v < 1000 else f"{int(v):,}"


def parse_range(text: str) -> Optional[DoseRange]:
    m = _RANGE.search(text or "")
    if not m:
        return None
    lo, hi = _num(m.group(1)), _num(m.group(3))
    unit = _unit(m.group(4))
    if lo > hi:
        lo, hi = hi, lo
    return DoseRange(lo=lo, hi=hi, unit=unit, text=f"{_fmt(lo)}–{_fmt(hi)} {unit_label(unit)}")


def parse_strength(text: str) -> Optional[tuple[float, str]]:
    """First labelled serving strength in a product name: 'Melatonin 3mg' → (3, 'mg')."""
    for m in _SINGLE.finditer(text or ""):
        unit = _unit(m.group(2))
        if unit == "g":          # tub size or grams of protein, not a serving strength
            continue
        return _num(m.group(1)), unit
    return None


def unit_label(unit: str) -> str:
    return "IU" if unit.lower() == "iu" else unit.lower()


def format_strength(value: float, unit: str) -> str:
    return f"{_fmt(value)} {unit_label(unit)}"


def dose_numbers(text: str) -> set[float]:
    """Every number written next to a dose unit (ranges count both ends)."""
    out: set[float] = set()
    for m in _RANGE.finditer(text or ""):
        out |= {_num(m.group(1)), _num(m.group(3))}
    for m in _SINGLE.finditer(text or ""):
        out.add(_num(m.group(1)))
    return out


def mentions_dose(text: str) -> bool:
    return bool(_SINGLE.search(text or ""))


@lru_cache(maxsize=512)
def _entry(maxx_id: str, habit_id: str) -> tuple[tuple[str, str], ...]:
    try:
        from services.ai_programs import get_program_doc
        doc = get_program_doc(maxx_id)
    except Exception:
        doc = None
    if doc is None:
        return ()
    fields: list[tuple[str, str]] = []
    inside = False
    for line in doc.text.splitlines():
        s = line.strip()
        if s.startswith("## "):
            if inside:
                break
            continue
        m = _HEAD.match(s)
        if m:
            if inside:
                break
            inside = m.group(1) == habit_id
            if inside:
                fields.append(("title", m.group(2).strip()))
            continue
        if inside:
            f = _FIELD.match(s)
            if f:
                fields.append((f.group(1).strip().lower(), f.group(2).strip()))
    return tuple(fields)


def library_entry(maxx_id: Optional[str], habit_id: Optional[str]) -> dict:
    """{title, minutes, anchor, frequency, kind, why, how, dose note, timing,
    avoid if, ...} for one habit, or {} when the program/habit is unknown."""
    if not maxx_id or not habit_id:
        return {}
    d = dict(_entry(str(maxx_id), str(habit_id)))
    if d:
        d["habit_id"] = habit_id
        d["maxx_id"] = maxx_id
    return d


def entry_kind(entry: dict, task: Optional[dict] = None) -> str:
    """C1 kind: the task's own `kind`, else the library's, else inferred from
    the library's prose ("0 / 0 (a rule)", "once in week 1"), else action."""
    k = str((task or {}).get("kind") or entry.get("kind") or "").strip().lower().split(" ")[0]
    if k in ("action", "rule", "setup", "checkin"):
        return k
    minutes = str(entry.get("minutes") or "")
    if re.search(r"\brule\b", minutes) or re.match(r"^\s*0\s*/\s*0\b", minutes):
        return "rule"
    if re.search(r"\bonce\b(?!\s+(?:a|per|every)\b)", str(entry.get("frequency") or ""), re.IGNORECASE):
        return "setup"
    return "action"


def library_range(entry: dict) -> Optional[DoseRange]:
    """The serving range the library recommends picking from: the `how` (it
    names the strength to choose), else the dose note's 'start' sentence, else
    the dose note's first range."""
    how = str(entry.get("how") or "")
    r = parse_range(how)
    if r:
        return r
    note = str(entry.get("dose note") or "")
    for sent in re.split(r"(?<=[.;])\s+", note):
        if re.search(r"\b(start|most people|common labels?|usually)\b", sent, re.IGNORECASE):
            r = parse_range(sent)
            if r:
                return r
    return parse_range(note)


# Products-tab need id → the Suppmax habit that need serves.
_NEED_TO_SUPP = {"collagen": "collagen_peptides", "fiber": "psyllium"}


def supp_entry_for_need(need: str) -> dict:
    hid = _NEED_TO_SUPP.get(need, need)
    e = library_entry("suppmax", hid)
    if e:
        return e
    try:
        from services.ai_programs import get_program_doc
        doc = get_program_doc("suppmax")
        for h in (doc.habits if doc else []):
            if h.id.startswith(need) or need in h.id:
                return library_entry("suppmax", h.id)
    except Exception:
        pass
    return {}


def need_range(need: str) -> Optional[DoseRange]:
    return library_range(supp_entry_for_need(need)) if need else None

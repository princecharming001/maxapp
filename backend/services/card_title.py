"""Habit-card titles that fit ONE line at full size on the smallest common
iPhone (375pt wide). The app never shrinks or wraps a title (owner rule,
2026-10-21): a title that would not fit is shortened here, server-side, using
the card font's real advance widths (Matter-SemiBold 17pt, -0.3 tracking).

Budget = 375 - 2*24 page pad - 2*14 card pad - 48 check - 2*12 gaps - 58 time
column ≈ 168pt. Keep in sync with GradientHabit in mobile/screens/home/HomeScreen.tsx.
"""
from __future__ import annotations

import re

MAX_WIDTH = 168.0
_TRACKING = -0.3

# Matter-SemiBold advance widths at 17pt, per character.
_W = {" ": 4.08, "!": 4.981, "\"": 7.106, "#": 11.781, "$": 10.047, "%": 13.362, "&": 11.56, "'": 3.842, "(": 4.964, ")": 4.964, "*": 8.279, "+": 9.469, ",": 5.1, "-": 6.392, ".": 4.743, "/": 7.786, "0": 10.863, "1": 6.443, "2": 9.758, "3": 9.996, "4": 10.727, "5": 9.877, "6": 10.472, "7": 9.52, "8": 9.894, "9": 10.54, ":": 4.743, ";": 5.185, "<": 9.333, "=": 9.333, ">": 9.333, "?": 8.976, "@": 15.521, "A": 11.543, "B": 10.71, "C": 12.41, "D": 11.713, "E": 9.86, "F": 9.69, "G": 12.784, "H": 12.087, "I": 4.556, "J": 6.154, "K": 11.424, "L": 9.163, "M": 14.722, "N": 11.866, "O": 13.243, "P": 10.234, "Q": 13.277, "R": 11.05, "S": 10.047, "T": 10.013, "U": 11.628, "V": 11.135, "W": 17.153, "X": 10.574, "Y": 10.557, "Z": 10.234, "[": 5.406, "\\": 7.786, "]": 5.406, "^": 9.894, "_": 8.5, "`": 18.207, "a": 9.163, "b": 10.285, "c": 9.537, "d": 10.285, "e": 9.69, "f": 6.477, "g": 10.115, "h": 10.132, "i": 4.216, "j": 4.284, "k": 9.537, "l": 4.216, "m": 15.249, "n": 10.064, "o": 10.098, "p": 10.285, "q": 10.285, "r": 6.902, "s": 7.837, "t": 6.562, "u": 10.081, "v": 8.517, "w": 13.396, "x": 8.721, "y": 8.976, "z": 8.415, "{": 5.746, "|": 4.59, "}": 5.763, "~": 10.166, "·": 4.692, "×": 9.673, "à": 9.163, "ç": 9.537, "è": 9.69, "é": 9.69, "ñ": 10.064, "ö": 10.098, "ü": 10.081, "–": 8.5, "—": 17.0, "‘": 4.471, "’": 4.471, "“": 7.667, "”": 7.667, "•": 8.007}


def width(title: str) -> float:
    t = title or ""
    if not t:
        return 0.0
    fallback = _W["m"]
    return sum(_W.get(c, fallback) for c in t) + _TRACKING * (len(t) - 1)


def fits(title: str) -> bool:
    return width(title) <= MAX_WIDTH


_CLAUSE = re.compile(r"\s+(?:with|before|after|for|to|on|when|at|in|from|during)\s+|\s*[,;:–—]\s*|\s+-\s+", re.I)


_DANGLING = {"a", "an", "and", "the", "to", "of", "for", "with", "at", "in", "on", "or", "+", "&", "before", "after", "your", "my"}


def shorten(title: str) -> str:
    """The title as-is when it fits; else its leading phrase; else whole words
    from the start until it fits. Never empty, never cut mid-word."""
    t = re.sub(r"\s+", " ", (title or "").strip())
    if fits(t):
        return t
    bare = re.sub(r"\s*\([^)]*\)", "", t).strip()
    if bare and fits(bare):
        return bare
    head = _CLAUSE.split(bare or t, maxsplit=1)[0].strip()
    if head and fits(head) and len(head.split()) >= 2:
        return head
    words = (bare or t).split()
    out = words[0]
    for w in words[1:]:
        if not fits(f"{out} {w}"):
            break
        out = f"{out} {w}"
    # never end on a dangling joiner ("Walk to the park with")
    parts = out.split()
    while len(parts) > 1 and parts[-1].lower().strip(",") in _DANGLING:
        parts.pop()
    out = " ".join(parts)
    while not fits(out) and len(out) > 1:   # one very long word
        out = out[:-1]
    return out.rstrip(" +&,-")


def supplement_slot_title(hhmm: str) -> str:
    """A name for several supplements taken together, by time of day."""
    try:
        h = int(str(hhmm or "").split(":")[0])
    except ValueError:
        return "Supplements"
    if h < 11:
        return "Morning supplements"
    if h < 16:
        return "Midday supplements"
    if h < 21:
        return "Evening supplements"
    return "Bedtime supplements"


def fit_task_titles(schedules: list) -> list:
    """Read-time pass over schedule documents: every task title the app shows
    on a card fits one line. Grouped supplements that don't fit become their
    slot name ("Morning supplements"); anything else is shortened. Mutates and
    returns the list (the documents are per-request copies). Never raises."""
    try:
        for s in schedules or []:
            for d in (s or {}).get("days") or []:
                for t in (d or {}).get("tasks") or []:
                    title = t.get("title") or ""
                    if not title or fits(title):
                        continue
                    if t.get("group"):
                        t["title"] = supplement_slot_title(t.get("time") or "")
                    else:
                        t["title"] = shorten(title)
    except Exception:  # noqa: BLE001 — a title pass must never break the payload
        pass
    return schedules

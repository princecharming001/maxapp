"""Library docs (backend/ai_programs/*.md): every habit says what kind of thing it
is (C1 in BETA1_CONTRACTS.md), and the steps of anything people tick off only
describe what they do at that moment: no shopping, no night-before prep, no
alarms, no clock times, no "before anything else".

Reads the raw markdown, so it holds whether or not the parser keeps the fields."""
import re
from pathlib import Path

import pytest

import services.ai_programs as ap

DOC_DIR = Path(__file__).resolve().parent.parent / "ai_programs"
DOCS = sorted(DOC_DIR.glob("*.md"))

KINDS = {"action", "rule", "setup", "checkin"}
BANNED = ("buy ", "pick up", "order ", "the night before", "set an alarm", "set your alarm",
          "before anything else")
CLOCK = re.compile(r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", re.IGNORECASE)
CYCLE = re.compile(r"^(\d+ on / \d+ off|trial \d+)$")
HEAD = re.compile(r"^###\s+`([a-z0-9_]+)`\s*[—–-]")
FIELD = re.compile(r"^-\s*([a-z /]+?):\s*(.*)$", re.IGNORECASE)


def _sections(path: Path) -> list[tuple[str, list[tuple[str, str]]]]:
    """(habit_id, [(field, value), ...]) for each habit in the Habit library."""
    out, cur, in_lib = [], None, False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_lib = line.strip().lower().startswith("## habit library")
            cur = None
            continue
        if line.startswith("### "):
            m = HEAD.match(line.strip())
            cur = (m.group(1), []) if (m and in_lib) else None
            if cur:
                out.append(cur)
            continue
        if cur is not None:
            f = FIELD.match(line.strip())
            if f:
                cur[1].append((f.group(1).strip().lower(), f.group(2).strip()))
    return out


ALL = [(p.stem, hid, fields) for p in DOCS for hid, fields in _sections(p)]
ALL_IDS = {hid for _, hid, _ in ALL}


def _ids():
    return [f"{doc}.{hid}" for doc, hid, _ in ALL]


def test_every_doc_has_habits():
    assert DOCS
    for p in DOCS:
        assert _sections(p), p.name


@pytest.mark.parametrize("doc,hid,fields", ALL, ids=_ids())
def test_habit_has_exactly_one_valid_kind(doc, hid, fields):
    kinds = [v for k, v in fields if k == "kind"]
    assert len(kinds) == 1, f"{doc}.{hid}: {len(kinds)} kind lines"
    assert kinds[0] in KINDS, f"{doc}.{hid}: kind {kinds[0]!r}"


@pytest.mark.parametrize("doc,hid,fields", ALL, ids=_ids())
def test_ticked_habits_only_have_in_the_moment_steps(doc, hid, fields):
    kind = next((v for k, v in fields if k == "kind"), "")
    if kind not in ("action", "checkin"):
        return
    for k, how in fields:
        if k != "how":
            continue
        low = how.lower()
        for bad in BANNED:
            assert bad not in low, f"{doc}.{hid}: how says {bad!r}: {how}"
        assert not CLOCK.search(how), f"{doc}.{hid}: how names a clock time: {how}"


@pytest.mark.parametrize("doc,hid,fields", ALL, ids=_ids())
def test_cycle_and_after_lines_are_well_formed(doc, hid, fields):
    for k, v in fields:
        if k == "cycle":
            assert CYCLE.match(v), f"{doc}.{hid}: bad cycle {v!r}"
        elif k == "after":
            assert v in ALL_IDS and v != hid, f"{doc}.{hid}: after {v!r} is not a habit"
        elif k == "order":
            assert v == "first", f"{doc}.{hid}: bad order {v!r}"


def test_wake_order_water_then_light():
    by = {(doc, hid): dict(fields) for doc, hid, fields in ALL}
    assert by[("energymax", "water_on_waking")].get("order") == "first"
    for doc in ("energymax", "sleepmax"):
        assert by[(doc, "morning_light")].get("after") == "water_on_waking"


def test_time_limited_supplements_carry_a_cycle():
    by = {hid: dict(fields) for doc, hid, fields in ALL if doc == "suppmax"}
    assert by["melatonin"]["cycle"] == "4 on / 1 off"
    assert by["collagen_peptides"]["cycle"] == "trial 12"
    assert by["ashwagandha"]["cycle"] == "trial 8"
    e = by["electrolytes"]
    assert e["kind"] == "action" and "never daily" in e["frequency"]
    assert "3 hours of bedtime" in e["timing"]
    d3 = " ".join(by["vitamin_d3"][k] for k in ("why", "how", "timing")).lower()
    assert "breakfast" not in d3


def test_parser_still_reads_every_doc():
    """New lines must not knock the parsed library out of shape."""
    for mid in ap.AI_PROGRAMS:
        pd = ap.get_program_doc(mid)
        assert pd and pd.habits, mid
        ids = {doc_hid for doc, doc_hid, _ in ALL if doc == Path(ap.AI_PROGRAMS[mid]["doc"]).stem}
        assert {h.id for h in pd.habits} == ids, mid
        for h in pd.habits:
            assert h.how and h.why, (mid, h.id)

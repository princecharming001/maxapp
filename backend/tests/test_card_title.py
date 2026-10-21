"""Habit-card titles fit one line at full size (no wrap, no shrink)."""
import re
from pathlib import Path

from services import card_title as ct
from services.ai_programs import _group_same_time


def test_library_titles_fit_one_line():
    for p in Path(__file__).resolve().parents[1].joinpath("ai_programs").glob("*.md"):
        for m in re.finditer(r"^### `([^`]+)` — (.+)$", p.read_text(), re.M):
            card = re.sub(r"\s*\([^)]*\)", "", m.group(2)).strip()
            assert ct.fits(card), f"{p.stem}.{m.group(1)}: {card!r} is {ct.width(card):.0f}pt"


def test_grouped_supplements_get_a_slot_name_when_too_long():
    tasks = [
        {"time": "07:30", "title": "Vitamin B12 (vegans, 50+)", "description": "", "catalog_id": "b12"},
        {"time": "07:30", "title": "Vitamin C with breakfast", "description": "", "catalog_id": "c"},
        {"time": "12:00", "title": "Creatine", "description": "", "catalog_id": "cr"},
        {"time": "12:00", "title": "Omega-3", "description": "", "catalog_id": "o3"},
    ]
    titles = {t["time"]: t["title"] for t in _group_same_time(tasks)}
    assert titles == {"07:30": "Morning supplements", "12:00": "Creatine + Omega-3"}


def test_shorten_keeps_whole_words_and_fits():
    for t in ["Walk to the park with the dog after dinner", "Read before bed (20 min)", "Supercalifragilisticexpialidocious"]:
        out = ct.shorten(t)
        assert out and ct.fits(out)
        assert not out.endswith((" to", " the", " with", " +"))
    assert ct.shorten("Gym") == "Gym"


def test_read_time_pass_fixes_stored_titles():
    docs = [{"days": [{"tasks": [
        {"title": "Vitamin D3 + Omega-3 + Magnesium", "time": "08:00", "group": ["d3", "o3", "mg"]},
        {"title": "Walk to the park with the dog after dinner", "time": "19:00"},
        {"title": "Gym", "time": "18:00"},
    ]}]}]
    out = [t["title"] for t in ct.fit_task_titles(docs)[0]["days"][0]["tasks"]]
    assert out[0] == "Morning supplements" and out[2] == "Gym"
    assert all(ct.fits(t) for t in out)

"""Chat visual-block + method-confidence marker extraction.

The invariants that matter: a malformed marker must NEVER raise and must degrade
to clean prose (no leaked [VISUAL_BLOCK] text), types are allow-listed, confidence
is normalized 0-100, and hallucinated sources are dropped when RAG chunks are known.
"""
from __future__ import annotations

from api.chat import (
    _extract_visual_blocks,
    _extract_method_confidence,
    _extract_markdown_tables,
    _extract_inline_choices,
)


# ── visual blocks ────────────────────────────────────────────────────────────
def test_no_markers_is_passthrough():
    text = "here's a normal answer with no blocks."
    clean, blocks = _extract_visual_blocks(text)
    assert clean == text and blocks == []


def test_well_formed_table_extracted_and_stripped():
    text = ('do this.\n[VISUAL_BLOCK]{"type":"table","title":"Plan",'
            '"data":{"columns":["A","B"],"rows":[["1","2"]]}}[/VISUAL_BLOCK]')
    clean, blocks = _extract_visual_blocks(text)
    assert "[VISUAL_BLOCK]" not in clean.upper()  # stripped
    assert clean.strip() == "do this."
    assert len(blocks) == 1
    assert blocks[0]["type"] == "table"
    assert blocks[0]["title"] == "Plan"
    assert blocks[0]["data"]["columns"] == ["A", "B"]


def test_malformed_json_degrades_to_prose():
    text = 'answer.\n[VISUAL_BLOCK]{"type":"table", BROKEN json[/VISUAL_BLOCK]'
    clean, blocks = _extract_visual_blocks(text)
    assert blocks == []                       # dropped
    assert "[VISUAL_BLOCK]" not in clean.upper()  # marker still stripped
    assert clean.strip() == "answer."


def test_unknown_type_dropped():
    text = '[VISUAL_BLOCK]{"type":"pie_chart","data":{}}[/VISUAL_BLOCK]'
    _clean, blocks = _extract_visual_blocks(text)
    assert blocks == []


def test_multiple_blocks_and_case_insensitive():
    text = ('[visual_block]{"type":"checklist","data":{"items":["a","b"]}}[/visual_block]'
            '[VISUAL_BLOCK]{"type":"stat_cards","data":{"cards":[{"value":"9","label":"x"}]}}[/VISUAL_BLOCK]')
    _clean, blocks = _extract_visual_blocks(text)
    assert [b["type"] for b in blocks] == ["checklist", "stat_cards"]


# ── method confidence ────────────────────────────────────────────────────────
def test_confidence_float_normalized_to_100():
    text = '[METHOD_CONFIDENCE]{"methods":[{"title":"Mewing","confidence":0.45}]}[/METHOD_CONFIDENCE]'
    clean, meta = _extract_method_confidence(text)
    assert "[METHOD_CONFIDENCE]" not in clean.upper()
    assert meta["methods"][0]["confidence"] == 45


def test_confidence_int_clamped():
    text = '[METHOD_CONFIDENCE]{"methods":[{"title":"X","confidence":150}]}[/METHOD_CONFIDENCE]'
    _clean, meta = _extract_method_confidence(text)
    assert meta["methods"][0]["confidence"] == 100


def test_confidence_malformed_degrades():
    text = 'answer.\n[METHOD_CONFIDENCE]{not json}[/METHOD_CONFIDENCE]'
    clean, meta = _extract_method_confidence(text)
    assert meta is None
    assert "[METHOD_CONFIDENCE]" not in clean.upper()
    assert clean.strip() == "answer."


def test_sources_grounded_against_chunk_ids():
    text = ('[METHOD_CONFIDENCE]{"methods":[{"title":"X","confidence":70,'
            '"sources":["chunk_1","hallucinated_9"]}]}[/METHOD_CONFIDENCE]')
    _clean, meta = _extract_method_confidence(text, chunk_ids={"chunk_1"})
    assert meta["methods"][0]["sources"] == ["chunk_1"]  # hallucinated dropped


def test_method_without_title_skipped():
    text = '[METHOD_CONFIDENCE]{"methods":[{"confidence":50},{"title":"Y","confidence":80}]}[/METHOD_CONFIDENCE]'
    _clean, meta = _extract_method_confidence(text)
    assert len(meta["methods"]) == 1 and meta["methods"][0]["title"] == "Y"


# ── markdown tables (the LLM's natural output) → native blocks ───────────────
def test_markdown_table_converted_and_removed():
    text = (
        "here's your routine:\n\n"
        "| exercise | sets | reps |\n"
        "|---|---|---|\n"
        "| neck curls | 3 | 15 |\n"
        "| chin tucks | 2 | 20 |\n\n"
        "stay consistent."
    )
    clean, blocks = _extract_markdown_tables(text)
    assert "|" not in clean                     # table lifted out of prose
    assert clean.startswith("here's your routine")
    assert "stay consistent." in clean
    assert len(blocks) == 1
    b = blocks[0]
    assert b["type"] == "table"
    assert b["data"]["columns"] == ["exercise", "sets", "reps"]
    assert b["data"]["rows"][0] == ["neck curls", "3", "15"]
    assert len(b["data"]["rows"]) == 2


def test_unclosed_marker_stripped_not_leaked():
    # Model output truncated mid-JSON — no closing [/VISUAL_BLOCK] tag.
    # The raw marker must not appear in the clean text.
    text = 'here is your guide.\n\n[visual_block]{"type":"stat_cards","data":{"cards":[{"value":"0.05'
    clean, blocks = _extract_visual_blocks(text)
    assert "[visual_block]" not in clean.lower()
    assert "visual_block" not in clean.lower()
    assert blocks == []  # truncated block yields nothing
    assert "here is your guide" in clean


def test_unclosed_marker_after_valid_block():
    # A valid closed block followed by a truncated unclosed one — valid extracted, unclosed stripped.
    valid = '[VISUAL_BLOCK]{"type":"checklist","data":{"items":["a"]}}[/VISUAL_BLOCK]'
    truncated = '[visual_block]{"type":"stat_cards","data":{"cards":[{"value":"99%"'
    text = f"intro.\n{valid}\nmiddle.\n{truncated}"
    clean, blocks = _extract_visual_blocks(text)
    assert len(blocks) == 1 and blocks[0]["type"] == "checklist"
    assert "[visual_block]" not in clean.lower()
    assert "intro" in clean and "middle" in clean


def test_prose_pipes_are_not_a_table():
    text = "use a|b as a separator, it's fine."
    clean, blocks = _extract_markdown_tables(text)
    assert blocks == [] and clean == text


# ── inline choices marker stripping ──────────────────────────────────────────
def test_choices_marker_stripped_and_options_extracted():
    text = "what's your goal?\n[CHOICES]muscle|fat loss|strength[/CHOICES]"
    clean, opts, multi = _extract_inline_choices(text)
    assert "choices" not in clean.lower()
    assert opts == ["muscle", "fat loss", "strength"]
    assert multi is False


def test_choices_lowercase_marker_stripped():
    # Model may emit lowercase [choices] — must be stripped regardless of case.
    text = "pick one:\n[choices]option a|option b|option c[/choices]"
    clean, opts, multi = _extract_inline_choices(text)
    assert "[choices]" not in clean.lower()
    assert len(opts) == 3


def test_multi_choices_block_stripped_single_choices_also_stripped():
    # When both [choices_multi] and [choices] appear, both must be stripped.
    text = (
        "tell me your hair type:\n"
        "[choices]oily|dry|combo[/choices]\n"
        "and texture:\n"
        "[CHOICES_MULTI]straight|wavy|curly|coily[/CHOICES_MULTI]"
    )
    clean, opts, multi = _extract_inline_choices(text)
    assert "[choices]" not in clean.lower()
    assert "choices_multi" not in clean.lower()
    # Options come from the first found (CHOICES_MULTI wins as it's checked first)
    assert set(opts) == {"straight", "wavy", "curly", "coily"}
    assert multi is True

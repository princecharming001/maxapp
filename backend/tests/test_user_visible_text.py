"""Nothing internal reaches the user: citations, file paths, docs talk, model vendor, em dashes.
Cases are real replies from chat_history (Sept 2026) plus edge cases that must survive intact."""

from services.user_visible_text import scrub_internal_refs, strip_em_dashes, user_visible
from api.chat import _render_history_assistant


def test_source_tags_both_formats():
    raw = ("1. **Masseter training**: thicken the jaw musculature [source=rag_documents/bonemax/Why BoneMax "
           "matters | section=Why BoneMax matters].\n2. **Tongue posture**: train it "
           "[source: rag_content/hairmax/minoxidil.md > Minoxidil (Rogaine)].")
    assert user_visible(raw) == ("1. **Masseter training**: thicken the jaw musculature.\n"
                                 "2. **Tongue posture**: train it.")


def test_docs_talk_removed_rest_kept():
    raw = ("Evidence is thin on minoxidil timeline specifics. Your docs say \"results take several months\" "
           "but don't map week-by-week expectations. I'll build this using standard progression.")
    assert user_visible(raw) == "I'll build this using standard progression."
    assert user_visible("don't see a stretching routine in your current docs. here's a solid one: hamstring stretch 30s.") \
        == "here's a solid one: hamstring stretch 30s."
    assert "docs" not in user_visible("those are the two core acne drivers in your docs and they work differently.")


def test_links_and_decimals_survive():
    raw = "use 0.05% tretinoin, see [the guide](https://example.com/a.b) [2], then rest... really?"
    assert user_visible(raw) == "use 0.05% tretinoin, see [the guide](https://example.com/a.b), then rest... really?"


def test_markers_untouched_and_no_false_positives():
    block = '[VISUAL_BLOCK]{"type":"table","data":{"rows":[["a [1]","source: x — y"]]}}[/VISUAL_BLOCK]'
    assert block in user_visible("here " + block + " done")
    for keep in ["see your doc if it gets worse.", "niacinamide is easy to source.", "- nested\n   - item"]:
        assert scrub_internal_refs(keep) == keep


def test_model_identity_and_em_dashes():
    assert user_visible("i'm a large language model, trained by google.") == "i'm max, your coach."
    assert strip_em_dashes("your plan is live — 14 days. quick step — pick habits") == "your plan is live, 14 days. quick step, pick habits"


def test_history_render_lifts_markers():
    raw = ('masseter training works. [METHOD_CONFIDENCE]{"methods":[{"title":"Masseter","confidence":70,'
           '"sources":["abc"]}]}[/METHOD_CONFIDENCE] what\'s your face shape? [choices]oval|round[/choices]')
    text, blocks, meta = _render_history_assistant(raw)
    assert "[" not in text and "{" not in text
    assert meta["methods"][0]["title"] == "Masseter" and meta["methods"][0]["sources"] is None

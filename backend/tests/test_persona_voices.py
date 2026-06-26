"""Persona voices reach BOTH chat prompts AND notification copy (RALPH_PERSONAS).

Deterministic, no-LLM proofs that the three named coaches — Goggins (`hardcore`),
Clavicular (`influencer`), Big Daddy (`gentle`) — are real distinct voices that
drive chat replies AND push notifications, and that the safety rails hold.

SC2 signature phrases in each preamble · SC3 persona reaches assembled chat
prompt · SC4 notification copy threads + applies coaching_tone (distinct per
persona) · SC5 safety rails (no slurs, Goggins-not-the-real-person, Clavicular
bans harmful practices).
"""

from __future__ import annotations

import asyncio

import pytest

from services.persona_prompts import (
    tone_preamble,
    notification_persona_preamble,
    TONE_PROMPTS,
)
from services.persona_notifications import (
    normalize_persona,
    persona_push_copy,
    _PERSONA_BANKS,
    LIVE_PERSONAS,
)
from services.notification_copy import (
    compose,
    _slots,
    passes_taste_bar,
    CAT_TASK_DUE,
    CAT_STREAK,
    CAT_REENGAGE,
    CAT_MILESTONE,
)
from services.notification_candidates import build_candidates
from services.copy_filter import check_content
from services.lc_agent import build_agent_system_prompt

LIVE = ("hardcore", "influencer", "gentle")

# A signature marker that must appear in each persona's CHAT preamble (SC2).
_CHAT_MARKERS = {
    "hardcore": ("GOGGINS", "stay hard", "callus your mind"),
    "influencer": ("CLAVICULAR", "ascending", "mog"),
    "gentle": ("BIG DADDY", "champ", "proud"),
}


# ----- SC2: each live slug carries its full persona + signature phrases -------

@pytest.mark.parametrize("slug", LIVE)
def test_tone_prompt_carries_persona_signature(slug):
    pre = tone_preamble(slug)
    for marker in _CHAT_MARKERS[slug]:
        assert marker in pre, f"{slug} preamble missing signature {marker!r}"


def test_three_live_slugs_route_to_distinct_preambles():
    g, i, n = tone_preamble("hardcore"), tone_preamble("influencer"), tone_preamble("gentle")
    assert len({g, i, n}) == 3
    # and they are not the generic mediumcore default
    assert g != tone_preamble("default")


def test_ui_slugs_all_present_in_tone_prompts():
    for slug in LIVE:
        assert slug in TONE_PROMPTS


# ----- SC3: the persona reaches the assembled CHAT prompt for each slug -------

@pytest.mark.parametrize("slug", LIVE)
def test_persona_reaches_assembled_chat_prompt(slug):
    ctx = {"coaching_context": tone_preamble(slug), "onboarding": {}}
    prompt = asyncio.run(build_agent_system_prompt(ctx, "app"))
    assert any(m in prompt for m in _CHAT_MARKERS[slug]), f"{slug} persona did not reach chat prompt"


# ----- SC4: notification copy threads + applies coaching_tone ----------------

def test_persona_push_copy_distinct_and_applied_per_persona():
    # Same signals, three personas -> three distinct bodies, none equal to base.
    base = compose(CAT_TASK_DUE, name="anish", task="morning skincare", streak=6, why="a sharper jaw")
    bodies = {}
    for slug in LIVE:
        out = compose(CAT_TASK_DUE, name="anish", task="morning skincare", streak=6,
                      why="a sharper jaw", coaching_tone=slug)
        assert out["template_id"].startswith("persona:"), f"{slug} push fell back to base copy"
        assert out["body"] != base["body"], f"{slug} push identical to base"
        bodies[slug] = out["body"]
    assert len(set(bodies.values())) == 3, "personas produced non-distinct push copy"


def test_unknown_tone_keeps_base_push_copy():
    base = compose(CAT_STREAK, name="anish", streak=4)
    same = compose(CAT_STREAK, name="anish", streak=4, coaching_tone="nonsense")
    assert base["template_id"] == same["template_id"]
    assert not same["template_id"].startswith("persona:")
    assert persona_push_copy("nonsense", CAT_STREAK, {"streak": 4}, {"streak"}, 0) is None


def test_every_persona_push_line_is_safe_and_applied():
    # Every persona/category line, filled with rich signals, must clear the taste
    # bar (so it is actually used, not silently dropped) and pass content filter.
    slots, available = _slots(name="anish", task="morning skincare", streak=6,
                              count=3, why="a sharper jaw", plan="skinmax")
    for persona, banks in _PERSONA_BANKS.items():
        for category in banks:
            pc = persona_push_copy(persona, category, slots, available, 0)
            assert pc is not None
            assert passes_taste_bar(pc["title"]) and passes_taste_bar(pc["body"]), \
                f"{persona}/{category} trips taste bar: {pc}"
            assert check_content(pc["title"]) == [] and check_content(pc["body"]) == []


def test_build_candidates_threads_coaching_tone_into_push():
    # End-to-end: the candidate builder must hand coaching_tone to compose so the
    # generated push for a real task is in the persona's voice.
    task = {"uuid": "t1", "title": "morning skincare", "time_min": 8 * 60,
            "maxx": "skinmax", "pending": True}
    cands = build_candidates(
        tasks=[task], now_min=7 * 60, wake_min=7 * 60, sleep_min=23 * 60, weekday=0,
        name="anish", why="a sharper jaw", streak=6, active_plans={"skinmax"},
        rotation=0, lapsed=False, coaching_tone="hardcore",
    )
    task_due = [c for c in cands if c.category == CAT_TASK_DUE]
    assert task_due, "no task-due candidate produced"
    assert any("nobody is coming" in c.body for c in task_due), \
        "Goggins persona did not reach the built candidate"
    assert any(c.template_id.startswith("persona:") for c in task_due)


def test_notification_persona_preamble_distinct_and_safe():
    pres = {slug: notification_persona_preamble(slug) for slug in LIVE}
    assert all(pres.values())
    assert len(set(pres.values())) == 3
    assert notification_persona_preamble(None) == ""
    assert notification_persona_preamble("default") == ""


# ----- SC5: safety rails -----------------------------------------------------

_SLURS = ("nigger", "faggot", "retard", "kike", "spic", "chink", "tranny")


def _all_persona_text() -> str:
    parts = [TONE_PROMPTS[s] for s in LIVE]
    parts += [notification_persona_preamble(s) for s in LIVE]
    for banks in _PERSONA_BANKS.values():
        for cat in banks.values():
            for t in cat:
                parts.append(t.title)
                parts.append(t.body)
    return "\n".join(parts).lower()


def test_no_slurs_anywhere_in_personas():
    blob = _all_persona_text()
    for s in _SLURS:
        assert s not in blob, f"slur {s!r} present in persona copy"


def test_goggins_never_claims_to_be_the_real_person():
    pre = tone_preamble("hardcore").lower()
    assert "not david goggins" in pre or "archetype" in pre
    # never asserts identity as the real person
    assert "i am david goggins" not in pre


def test_clavicular_bans_harmful_practices_and_redirects_to_safe_maxxing():
    pre = tone_preamble("influencer").lower()
    assert "never endorse" in pre
    for harmful in ("bonesmashing", "starvation", "peds"):
        assert harmful in pre, f"Clavicular rail missing mention of {harmful}"
    # the safe alternatives are named
    assert any(safe in pre for safe in ("skincare", "posture", "sunscreen", "mewing"))


def test_persona_normalizer_aliases_and_live_set():
    assert normalize_persona("goggins") == "hardcore"
    assert normalize_persona("clavicular") == "influencer"
    assert normalize_persona("bigdaddy") == "gentle"
    assert normalize_persona("default") is None
    assert normalize_persona(None) is None
    assert LIVE_PERSONAS == frozenset({"hardcore", "influencer", "gentle"})

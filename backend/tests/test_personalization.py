"""Hyper-personalization spine — coercion, conflict resolution, source
normalizers, brief assembly, and downstream signals.

Pure-function heavy (no DB) plus a fake-DB happy path for remember_fact,
mirroring tests/test_onairos.py's style (the suite runs without a live DB).
"""

from __future__ import annotations

from uuid import uuid4

import pytest

import services.personalization as P


# --------------------------------------------------------------------------- #
#  Coercion helpers                                                            #
# --------------------------------------------------------------------------- #

def test_coerce_dimension_normalizes_and_falls_back():
    assert P._coerce_dimension("DIET ") == "diet"
    assert P._coerce_dimension("comms style") == "comms_style"
    assert P._coerce_dimension("not-a-real-dim") == "misc"
    assert P._coerce_dimension(None) == "misc"


def test_coerce_source_and_confidence():
    assert P._coerce_source("CHAT") == "chat"
    assert P._coerce_source("bogus") == "chat"
    assert P._coerce_confidence(2.0) == 1.0
    assert P._coerce_confidence(-1) == 0.0
    assert P._coerce_confidence("x") == 0.8


def test_as_list_splits_strings_and_passes_lists():
    assert P._as_list("dairy, gluten; soy and nuts") == ["dairy", "gluten", "soy", "nuts"]
    assert P._as_list(["a", "", "b"]) == ["a", "b"]
    assert P._as_list(None) == []


# --------------------------------------------------------------------------- #
#  Conflict resolution (the heart of "newer/explicit beats inferred/old")      #
# --------------------------------------------------------------------------- #

def test_resolve_keyed_conflict_dedupes_identical():
    assert P.resolve_keyed_conflict(
        existing_text="vegetarian", existing_value=None, existing_source="chat",
        new_text="Vegetarian", new_value=None, new_source="chat",
    ) == "dedupe"


def test_resolve_keyed_conflict_supersedes_on_equal_or_higher_rank():
    # chat (5) updating a prior chat fact with a NEW value -> supersede
    assert P.resolve_keyed_conflict(
        existing_text="vegetarian", existing_value=None, existing_source="chat",
        new_text="pescatarian", new_value=None, new_source="chat",
    ) == "supersede"
    # onboarding (4) over onairos (2) -> supersede
    assert P.resolve_keyed_conflict(
        existing_text="introvert", existing_value=None, existing_source="onairos",
        new_text="extrovert", new_value=None, new_source="onboarding",
    ) == "supersede"


def test_resolve_keyed_conflict_keeps_explicit_over_weaker_inference():
    # onairos (2) inference must NOT overwrite an explicit chat (5) statement
    assert P.resolve_keyed_conflict(
        existing_text="vegetarian", existing_value=None, existing_source="chat",
        new_text="eats meat", new_value=None, new_source="onairos",
    ) == "keep"


# --------------------------------------------------------------------------- #
#  Source normalizers -> per-dimension profile                                 #
# --------------------------------------------------------------------------- #

def test_apply_onboarding_maps_fields():
    profile = P._blank_profile()
    P._apply_onboarding(profile, {
        "age": 24, "gender": "he/him", "work_location": "hybrid",
        "work_start": "09:00", "work_end": "18:00", "commute_minutes": 30,
        "chronotype": "evening", "wake_time": "07:00", "dietary_restrictions": "dairy, gluten",
        "goals": ["skinmax", "fitmax"], "response_length": "concise",
    }, coaching_tone="hardcore")
    assert profile["identity"]["age"] == 24
    assert profile["work"]["location_type"] == "hybrid"
    assert profile["work"]["commute_minutes"] == 30
    assert profile["lifestyle"]["chronotype"] == "evening"
    assert "dairy" in profile["diet"]["restrictions"]
    assert profile["goals"]["maxxes"] == ["skinmax", "fitmax"]
    assert profile["comms_style"]["length"] == "concise"
    assert profile["comms_style"]["tone"] == "hardcore"


def test_apply_user_facts_folds_legacy_blob():
    profile = P._blank_profile()
    P._apply_user_facts(profile, {
        "diet": ["vegetarian"], "allergies": ["peanuts"],
        "equipment": ["dumbbells"], "health": ["eczema"], "lifestyle": ["travels a lot"],
    })
    assert "vegetarian" in profile["diet"]["restrictions"]
    assert profile["diet"]["allergies"] == ["peanuts"]
    assert profile["constraints"]["equipment"] == ["dumbbells"]
    assert profile["constraints"]["conditions"] == ["eczema"]


def test_apply_onairos_personality_interests_and_forward_compat_extras():
    """Production Onairos returns richer categories under `extra` — they must
    flow into the right dimensions with NO schema change."""
    profile = P._blank_profile()
    P._apply_onairos(profile, {
        "traits": {
            "positive_traits": {"conscientiousness": 0.82, "openness": 0.7},
            "traits_to_improve": {"discipline": 0.6},
        },
        "inference": {"affinities": {"fitness": 0.9, "skincare": 0.7, "gaming": 0.3}},
        "extra": {
            "Food": {"south indian": 0.9, "spicy": 0.8},
            "Demographics": {"age": 24, "gender": "male"},
            "Communication": {"prefers": "direct"},
            "WeirdNewCategory": ["mystery"],
        },
    })
    # personality
    assert profile["personality"]["strengths"]["conscientiousness"] == 0.82
    assert profile["personality"]["to_improve"]["discipline"] == 0.6
    # interests from affinities (top-ranked)
    assert "fitness" in profile["interests"]["topics"]
    # forward-compat: Food -> diet, Demographics -> identity, Communication -> comms_style
    assert "south indian" in profile["diet"]["signals"]
    assert profile["identity"]["age"] == 24
    assert profile["comms_style"]["prefers"] == "direct"
    # unknown category never dropped -> lands in misc
    assert "mystery" in profile["misc"]["signals"]


def test_apply_memories_keyed_overlays_and_newest_wins():
    from datetime import datetime, timezone

    class _M:
        def __init__(self, dimension, key, text, value=None, updated_at=None):
            self.dimension = dimension; self.key = key; self.text = text
            self.value = value
            self.updated_at = updated_at or datetime.now(timezone.utc)

    profile = P._blank_profile()
    profile["diet"]["pattern"] = "omnivore"  # e.g. from an older source
    older = _M("diet", "diet.pattern", "vegetarian",
               updated_at=datetime(2024, 1, 1, tzinfo=timezone.utc))
    newer = _M("diet", "diet.pattern", "pescatarian",
               updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    anecdote = _M("interests", None, "rock climbing")
    P._apply_memories(profile, [newer, older, anecdote])
    # newest keyed memory wins
    assert profile["diet"]["pattern"] == "pescatarian"
    # keyless memory becomes a note
    assert "rock climbing" in profile["interests"]["notes"]


# --------------------------------------------------------------------------- #
#  Brief + signals + tone                                                      #
# --------------------------------------------------------------------------- #

def _rich_profile():
    return {
        "identity": {"name": "Anish", "age": 24, "gender": "he/him", "location": "SF",
                     "languages": ["English", "Tamil"]},
        "culture": {"culture": "Tamil-American", "religion": "Hindu"},
        "diet": {"pattern": "vegetarian", "cuisines": ["South Indian"],
                 "foods_avoided": ["dairy"], "allergies": ["peanuts"]},
        "work": {"role": "software engineer", "location_type": "hybrid",
                 "start": "09:00", "end": "18:00", "commute_minutes": 30},
        "lifestyle": {"chronotype": "evening", "workout_window": "evenings"},
        "personality": {"strengths": {"conscientiousness": 0.82, "openness": 0.7},
                        "motivations": ["looking good in photos"]},
        "comms_style": {"tone": "blunt", "length": "concise", "humor": "a little"},
        "goals": {"maxxes": ["skinmax", "fitmax"], "why": "feel more confident"},
        "interests": {"topics": ["climbing", "specialty coffee"]},
        "constraints": {"equipment": ["dumbbells"], "conditions": ["eczema"]},
    }


def test_build_brief_renders_dimensions_and_none_when_empty():
    assert P.build_personalization_brief({}) is None
    assert P.build_personalization_brief(P._blank_profile()) is None
    brief = P.build_personalization_brief(_rich_profile())
    assert brief is not None
    assert "WHAT MAX KNOWS" in brief
    assert "diet: vegetarian" in brief
    assert "allergic to peanuts" in brief
    assert "Tamil-American" in brief
    assert "talk to them: blunt" in brief
    assert "~30min commute" in brief


# Robotic / AI-assistant phrasings the personalized copy must never emit (RC12).
_BANNED_PHRASES = (
    "as an ai",
    "i've updated your preferences",
    "here is your personalized",
    "great job",
    "you're doing amazing",
)


def test_brief_voice_guidance_off_by_default_is_byte_identical():
    # Default (no flag, no arg) → no guidance, identical to the legacy brief.
    base = P.build_personalization_brief(_rich_profile())
    explicit_off = P.build_personalization_brief(_rich_profile(), voice_guidance=False)
    assert base == explicit_off
    assert "How to use what you know" not in base


def test_brief_voice_guidance_on_carries_human_voice_instruction():
    brief = P.build_personalization_brief(_rich_profile(), voice_guidance=True)
    assert brief is not None
    # RC8/RC12: the human-voice / accountability instruction is present…
    assert "How to use what you know" in brief
    low = brief.lower()
    assert "remembers what they told you" in low
    assert "holds them to it" in low
    assert "never invent facts" in low
    # …and the data-derived dimensions still assemble alongside it.
    assert "WHAT MAX KNOWS" in brief
    assert "diet: vegetarian" in brief
    assert "why: feel more confident" in brief  # goal `why` survives


def test_brief_with_values_and_why_assembles_with_guidance():
    # RC8: a brief carrying values/why/motivations must still assemble cleanly.
    prof = {
        "personality": {"values": ["discipline", "confidence"],
                        "motivations": ["look good at the wedding"]},
        "goals": {"maxxes": ["fitmax"], "why": "feel strong", "timeline": "summer"},
    }
    brief = P.build_personalization_brief(prof, voice_guidance=True)
    assert brief is not None
    assert "values discipline, confidence" in brief
    assert "motivated by look good at the wedding" in brief
    assert "why: feel strong" in brief


def test_generated_brief_never_emits_banned_robotic_phrasings():
    # RC12: neither the data-derived copy NOR the guidance text contains any of
    # the banned AI-assistant / hollow-affirmation phrasings.
    for vg in (False, True):
        brief = P.build_personalization_brief(_rich_profile(), voice_guidance=vg)
        low = (brief or "").lower()
        for phrase in _BANNED_PHRASES:
            assert phrase not in low, f"banned phrasing leaked (voice_guidance={vg}): {phrase!r}"


def test_profile_to_state_signals_extracts_and_merges():
    sig = P.profile_to_state_signals(_rich_profile(), brief="(b)")
    assert sig["dietary_pattern"] == "vegetarian"
    # allergies + avoided merged into the restriction set
    assert set(sig["dietary_restrictions"]) >= {"peanuts", "dairy"}
    assert sig["food_allergies"] == ["peanuts"]
    assert sig["culture"] == "Tamil-American"
    assert sig["work_location"] == "hybrid"
    assert sig["occupation"] == "software engineer"
    assert sig["comms_tone"] == "hardcore"      # "blunt" -> hardcore enum
    assert sig["comms_length"] == "concise"
    assert sig["conditions"] == ["eczema"]
    assert sig["personalization_brief"] == "(b)"


def test_comms_to_tone_maps_words_to_enums():
    assert P.comms_to_tone({"comms_style": {"tone": "blunt"}}) == ("hardcore", None)
    assert P.comms_to_tone({"comms_style": {"tone": "gentle and supportive", "length": "detailed"}}) == ("gentle", "detailed")
    assert P.comms_to_tone({"comms_style": {"notes": ["keep it short"]}})[1] == "concise"
    assert P.comms_to_tone({}) == (None, None)


# --------------------------------------------------------------------------- #
#  remember_fact — fake-DB happy path                                          #
# --------------------------------------------------------------------------- #

class _Scalars:
    def __init__(self, rows): self._rows = rows
    def first(self): return self._rows[0] if self._rows else None
    def all(self): return list(self._rows)


class _Result:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return _Scalars(self._rows)
    def scalar_one_or_none(self): return self._rows[0] if self._rows else None


class _FakeDB:
    """Returns no existing rows, so remember_fact takes the create path."""
    def __init__(self): self.added = []; self.commits = 0

    async def execute(self, _stmt): return _Result([])

    def add(self, obj): self.added.append(obj)

    async def commit(self): self.commits += 1

    async def refresh(self, _obj): pass


@pytest.mark.asyncio
async def test_remember_fact_creates_active_fact():
    db = _FakeDB()
    uid = str(uuid4())
    mem = await P.remember_fact(
        db, uid, dimension="diet", text="vegetarian", key="diet.pattern", rebuild=False,
    )
    assert mem is not None
    assert mem.dimension == "diet"
    assert mem.key == "diet.pattern"
    assert mem.text == "vegetarian"
    assert mem.source == "chat"
    assert mem.status == "active"
    assert db.commits >= 1
    assert len(db.added) == 1


@pytest.mark.asyncio
async def test_remember_fact_rejects_empty_text():
    db = _FakeDB()
    assert await P.remember_fact(db, str(uuid4()), dimension="diet", text="  ", rebuild=False) is None

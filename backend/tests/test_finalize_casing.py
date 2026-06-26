"""Smart-casing of user-facing chat replies (RALPH_PROMPT_AUDIT RC3).

Max's voice is lowercase, but the old blanket .lower() mangled acronyms, brands,
units, and the pronoun "I". These lock the smarter behavior: ordinary prose goes
lowercase, meaning-bearing casing survives.
"""

from __future__ import annotations

from api.chat import _smart_lowercase, _finalize_assistant_message


def test_acronyms_and_units_survive():
    assert _smart_lowercase("Use SPF in the AM and PM") == "use SPF in the AM and PM"
    assert _smart_lowercase("take D3 and K2 daily") == "take D3 and K2 daily"
    assert _smart_lowercase("your PSL is fine") == "your PSL is fine"
    assert _smart_lowercase("SPF30 minimum") == "SPF30 minimum"


def test_brands_and_proper_nouns_survive():
    assert "CeraVe" in _smart_lowercase("grab the CeraVe hydrating cleanser")
    assert "EltaMD" in _smart_lowercase("EltaMD UV Clear is great")
    assert "La Roche-Posay" in _smart_lowercase("try la roche-posay cleanser")
    assert "The Ordinary" in _smart_lowercase("the ordinary niacinamide works")


def test_pronoun_I_survives_but_ordinary_words_lowercase():
    assert _smart_lowercase("I think You should start now") == "I think you should start now"
    assert _smart_lowercase("Honestly, Skip That Serum") == "honestly, skip that serum"
    assert _smart_lowercase("I'm telling You it works") == "I'm telling you it works"


def test_already_lowercase_is_unchanged():
    s = "wash with a gentle cleanser morning and night"
    assert _smart_lowercase(s) == s


def test_finalize_preserves_casing_end_to_end():
    out = _finalize_assistant_message("Use SPF every AM. CeraVe is solid. I like it.")
    assert "SPF" in out and "AM" in out and "CeraVe" in out
    assert out.startswith("use ")  # sentence-initial Title-case still lowercased
    # bold markers survive
    bold = _finalize_assistant_message("**Cleanser**: use a gentle one")
    assert bold.startswith("**cleanser**")

"""facial_scan_summary must survive every onboarding save, and the scan-
completion write must never clobber answers saved during the analysis.

Prod evidence (2026-09-23, read-only): 67/69 recently scanned not-yet-onboarded
users and every recent paying V4 user had onboarding.facial_scan_summary = NULL.
POST /users/onboarding REPLACES the blob with the pydantic dump (whose
facial_scan_summary defaults to None) and only _SERVER_OWNED keys survive —
the scan headline was not in that set, so the very next quiz save wiped it
and the AI coach behaved as if the user had never scanned.

(The scan-completion half of this file was retired with the face scan API in
the 2026-10 biohacking pivot; the server-owned-key guard below stays.)

Run:
    pytest tests/test_onboarding_server_owned.py -v
"""
from __future__ import annotations

import inspect


# ---------------------------------------------------------------------------
# users.py — the server-owned key set
# ---------------------------------------------------------------------------

def _apply_server_owned(onboarding_data: dict, existing: dict, keys) -> dict:
    """The exact preserve loop save_onboarding runs (kept in lock-step so the
    behavioural assertion below means what it says)."""
    for k in keys:
        if k in existing:
            onboarding_data[k] = existing[k]
        else:
            onboarding_data.pop(k, None)
    return onboarding_data


def test_scan_keys_are_server_owned():
    from api.users import ONBOARDING_SERVER_OWNED_KEYS

    assert "facial_scan_summary" in ONBOARDING_SERVER_OWNED_KEYS
    assert "scan_completed_at" in ONBOARDING_SERVER_OWNED_KEYS
    # The pre-existing set must not have lost anything.
    for k in (
        "maxx_entered_at", "lock_ins", "confirmed_facts", "notif_category_prefs",
        "sendblue_sms_opt_in", "app_notifications_opt_in", "main_app_tour_completed",
        "post_subscription_onboarding", "sendblue_connect_completed",
        "notification_channels_completed", "module_select_completed",
    ):
        assert k in ONBOARDING_SERVER_OWNED_KEYS, k


def test_save_onboarding_uses_the_module_level_set():
    from api import users as users_module

    src = inspect.getsource(users_module.save_onboarding)
    assert "ONBOARDING_SERVER_OWNED_KEYS" in src, (
        "save_onboarding no longer preserves the module-level server-owned set"
    )


def test_quiz_save_keeps_the_scan_headline():
    from api.users import ONBOARDING_SERVER_OWNED_KEYS
    from models.user import OnboardingData

    # What the V4 quiz sends at the end of the intro (no scan fields at all).
    payload = OnboardingData(
        goals=["skinmax"], priority_order=["skinmax"], age_band="18-24",
        gender="male", completed=False,
    ).model_dump()
    assert payload.get("facial_scan_summary") is None  # the pydantic default that wiped it

    existing = {
        "facial_scan_summary": {"archetype": "Rugged", "psl_score": 6.1},
        "scan_completed_at": "2026-09-22T03:00:00Z",
        "post_subscription_onboarding": True,
    }
    merged = _apply_server_owned(payload, existing, ONBOARDING_SERVER_OWNED_KEYS)
    assert merged["facial_scan_summary"] == existing["facial_scan_summary"]
    assert merged["scan_completed_at"] == existing["scan_completed_at"]
    assert merged["post_subscription_onboarding"] is True
    assert merged["goals"] == ["skinmax"]  # the client's own answers still land

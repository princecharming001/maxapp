"""facial_scan_summary must survive every onboarding save, and the scan-
completion write must never clobber answers saved during the analysis.

Prod evidence (2026-09-23, read-only): 67/69 recently scanned not-yet-onboarded
users and every recent paying V4 user had onboarding.facial_scan_summary = NULL.
POST /users/onboarding REPLACES the blob with the pydantic dump (whose
facial_scan_summary defaults to None) and only _SERVER_OWNED keys survive —
the scan headline was not in that set, so the very next quiz save wiped it
and the AI coach behaved as if the user had never scanned.

Run:
    pytest tests/test_onboarding_server_owned.py -v
"""
from __future__ import annotations

import inspect
import json
import uuid

from sqlalchemy.dialects import postgresql


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


# ---------------------------------------------------------------------------
# scans.py — atomic first-scan completion (no stale-object write-back)
# ---------------------------------------------------------------------------

class _ExecResult:
    def __init__(self, rowcount):
        self.rowcount = rowcount


class _CaptureDB:
    def __init__(self, rowcount=1):
        self.calls = []
        self.commits = 0
        self._rowcount = rowcount

    async def execute(self, stmt, params=None):
        self.calls.append((stmt, params))
        return _ExecResult(self._rowcount)

    async def commit(self):
        self.commits += 1


def _run(coro):
    import asyncio
    return asyncio.run(coro)


def test_completion_sql_merges_instead_of_replacing_onboarding():
    from api.scans import _FIRST_SCAN_COMPLETION_SQL

    sql = str(_FIRST_SCAN_COMPLETION_SQL.compile(dialect=postgresql.asyncpg.dialect()))
    # Server-side merge of the existing column, never `onboarding = <blob>`.
    assert "onboarding::jsonb" in sql and "||" in sql
    assert "onboarding = (" in sql and "onboarding = $" not in sql
    # A racing duplicate upload must not become a second "first scan".
    assert "first_scan_completed IS NOT TRUE" in sql
    # A chosen avatar is never clobbered.
    assert "avatar_url" in sql and "ELSE profile" in sql


def test_complete_first_scan_patches_only_the_scan_keys():
    from api.scans import _complete_first_scan

    db = _CaptureDB(rowcount=1)
    uid = uuid.uuid4()
    summary = {"archetype": "Rugged", "psl_score": 6.1, "first_move": ["skinmax"]}
    claimed = _run(_complete_first_scan(db, uid, summary, "https://x/front.jpg"))

    assert claimed is True
    assert db.commits == 1
    (_stmt, params), = db.calls
    patch = json.loads(params["patch"])
    # ONLY the scan headline rides in the patch — the quiz's goals/age/gender
    # written during the 75s analysis are untouched by the merge.
    assert set(patch.keys()) == {"facial_scan_summary"}
    assert patch["facial_scan_summary"] == summary
    assert params["avatar_url"] == "https://x/front.jpg"
    assert params["uid"] == str(uid)


def test_complete_first_scan_reports_when_another_upload_won():
    from api.scans import _complete_first_scan

    db = _CaptureDB(rowcount=0)
    assert _run(_complete_first_scan(db, uuid.uuid4(), {}, None)) is False


def test_upload_handler_no_longer_writes_onboarding_from_the_orm_object():
    from api import scans as scans_module

    src = inspect.getsource(scans_module.upload_scan_triple)
    assert "user.onboarding = " not in src, "stale-object onboarding write-back is back"
    assert "_complete_first_scan(" in src

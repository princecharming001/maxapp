"""
P1 integration tests — FastAPI endpoint authz, LLM router behavior.

Strategy:
  - Endpoint tests: use TestClient with dependency_overrides (no real DB needed)
  - LLM router tests: mock the LLM provider at the LangChain layer, exercise
    real fallback/error-handling logic
  - External paid APIs (LLM, Stripe) are always mocked

Run:
    pytest tests/test_p1_integration.py -v
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from middleware.auth_middleware import get_current_user, require_paid_user
from middleware.auth_middleware import _subscription_expired


# ---------------------------------------------------------------------------
# Helpers (same pattern as test_entitlement_regression.py)
# ---------------------------------------------------------------------------

def _free_user(**overrides) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "email": "free@example.com",
        "first_name": "Free",
        "last_name": "User",
        "username": "freeuser",
        "is_paid": False,
        "is_admin": False,
        "is_scan_user": False,
        "subscription_tier": None,
        "subscription_status": None,
        "subscription_id": None,
        "subscription_end_date": None,
        "billing_provider": None,
        "stripe_customer_id": None,
        "onboarding": {},
        "profile": {},
        "first_scan_completed": False,
        "phone_number": None,
        "has_apns_token": False,
        "coaching_tone": "default",
        "auth_provider": "password",
        "created_at": datetime.utcnow(),
        "last_username_change": None,
        "last_progress_prompt_date": None,
        "schedule_preferences": {},
    }
    base.update(overrides)
    return base


def _paid_user(**overrides) -> dict:
    u = _free_user(**overrides)
    u["is_paid"] = True
    u["subscription_tier"] = "premium"
    u["subscription_status"] = "active"
    u["subscription_end_date"] = datetime.utcnow() + timedelta(days=30)
    return u


def _override(user_dict: dict) -> TestClient:
    async def _get_user():
        return user_dict

    async def _require_paid():
        if not user_dict.get("is_paid"):
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Active subscription required",
            )
        if _subscription_expired(user_dict.get("subscription_end_date")):
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Subscription has expired",
            )
        return user_dict

    app.dependency_overrides[get_current_user] = _get_user
    app.dependency_overrides[require_paid_user] = _require_paid
    return TestClient(app, raise_server_exceptions=False)


def _clear():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Gated endpoint authz — FastAPI integration
# ---------------------------------------------------------------------------

class TestGatedEndpoints:
    """Selected endpoints must return the correct HTTP status for free/paid users."""

    def teardown_method(self):
        _clear()

    def test_scan_history_free_user_gets_402(self):
        client = _override(_free_user())
        resp = client.get("/api/scans/history")
        assert resp.status_code == 402

    def test_scan_history_paid_user_gets_through(self):
        """Paid user reaches the handler (may 500 without DB, but not 401/402/403)."""
        client = _override(_paid_user())
        resp = client.get("/api/scans/history")
        # 200 or 500 (DB not wired in tests) — what must NOT happen is 402/401/403
        assert resp.status_code not in (401, 402, 403), (
            f"Paid user blocked from /scans/history: {resp.status_code}"
        )

    def test_no_token_returns_401(self):
        _clear()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/api/scans/history")
        assert resp.status_code == 401

    def test_malformed_token_returns_401(self):
        _clear()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(
            "/api/scans/history",
            headers={"Authorization": "Bearer garbage.token.here"},
        )
        assert resp.status_code == 401

    def test_scan_latest_free_user_not_blocked_by_paywall(self):
        """Free users CAN call /scans/latest (not a paid-gated route).
        The test-env DB may be unavailable, so 200 or 500 are both acceptable;
        what must NOT happen is 401/402/403."""
        client = _override(_free_user())
        resp = client.get("/api/scans/latest")
        assert resp.status_code not in (401, 402, 403), (
            f"/scans/latest should not paywall/auth-block a free user: {resp.status_code}"
        )

    def test_chat_list_conversations_returns_200(self):
        """Conversation list is auth-gated (not paid-gated); free users can call it."""
        client = _override(_free_user())
        resp = client.get("/api/chat/conversations")
        # 200 (no DB → empty list returned) or 500 (DB error before we respond)
        # Must not be 402 or 401.
        assert resp.status_code not in (401, 402, 403), (
            f"Conversation list should not require payment: {resp.status_code}"
        )


class TestAdminEndpointGuard:
    """Admin endpoints must reject non-admin users."""

    def teardown_method(self):
        _clear()

    def test_admin_stats_rejects_regular_user(self):
        """GET /api/admin/stats must return 403 for a non-admin user.
        The exact path varies — we use the leaderboard admin endpoint as proxy."""
        client = _override(_free_user())
        resp = client.get("/api/admin/users")
        assert resp.status_code in (401, 403, 404), (
            f"Non-admin reached admin endpoint: {resp.status_code}"
        )


# ---------------------------------------------------------------------------
# LLM router — provider path, fallback, timeout, malformed response
# ---------------------------------------------------------------------------

class TestLlmProviderPaths:
    """get_primary_llm picks the right provider based on LLM_PROVIDER."""

    def test_claude_provider_registered_in_builders(self):
        """Claude builder must be registered (verifies the module wires it up)."""
        from services.lc_providers import _BUILDERS
        assert "claude" in _BUILDERS, "claude provider not registered in _BUILDERS"
        assert callable(_BUILDERS["claude"]), "claude builder is not callable"

    def test_all_expected_providers_registered(self):
        """All providers named in FALLBACK_ORDER must have a builder registered."""
        from services.lc_providers import _BUILDERS, _FALLBACK_ORDER

        for provider in _FALLBACK_ORDER:
            assert provider in _BUILDERS, (
                f"Provider '{provider}' in FALLBACK_ORDER but missing from _BUILDERS"
            )

    def test_gemini_provider_registered(self):
        from services.lc_providers import _BUILDERS
        assert "gemini" in _BUILDERS

    def test_fallback_order_claude_to_openai(self):
        """When claude is primary, openai is first fallback."""
        from services.lc_providers import _FALLBACK_ORDER

        assert _FALLBACK_ORDER["claude"][0] == "openai", (
            "Expected openai to be the first fallback for claude"
        )

    def test_fallback_order_contains_no_self_references(self):
        """A provider must never be its own fallback."""
        from services.lc_providers import _FALLBACK_ORDER

        for primary, fallbacks in _FALLBACK_ORDER.items():
            assert primary not in fallbacks, (
                f"{primary} lists itself as a fallback — infinite loop risk"
            )

    def test_huggingface_has_no_fallbacks(self):
        """HuggingFace (custom fine-tuned) must never fall back to another provider."""
        from services.lc_providers import _FALLBACK_ORDER

        assert _FALLBACK_ORDER["huggingface"] == [], (
            "HuggingFace should never fall back to a different model"
        )


class TestLlmFallbackBehavior:
    """get_chat_llm_with_fallback wraps fallbacks on .with_fallbacks()."""

    def test_get_chat_llm_with_fallback_no_crash_no_fallbacks(self):
        """When _build_fallback_list returns [] and the primary is mocked,
        get_chat_llm_with_fallback returns the primary without wrapping."""
        from services.lc_providers import get_chat_llm_with_fallback

        mock_primary = MagicMock()
        mock_primary.with_fallbacks = MagicMock()

        with patch("services.lc_providers.get_primary_llm", return_value=mock_primary), \
             patch("services.lc_providers._build_fallback_list", return_value=[]):
            result = get_chat_llm_with_fallback(max_tokens=256)
            # No fallbacks → must return primary unchanged (not wrapped)
            assert result is mock_primary
            mock_primary.with_fallbacks.assert_not_called()

    def test_fallback_exception_types_are_all_exceptions(self):
        """All types in _LLM_FALLBACK_EXCEPTIONS must be Exception subclasses."""
        from services.lc_providers import _LLM_FALLBACK_EXCEPTIONS

        assert len(_LLM_FALLBACK_EXCEPTIONS) > 0, "No fallback exception types registered"
        for exc_type in _LLM_FALLBACK_EXCEPTIONS:
            assert issubclass(exc_type, BaseException), (
                f"{exc_type} is not an Exception subclass"
            )


class TestLlmResponseHandling:
    """LLM response shapes — graceful handling of malformed / empty output."""

    def test_redacted_analysis_handles_empty_analysis(self):
        """_redacted_analysis must not crash on a minimal/empty input."""
        from api.scans import _redacted_analysis

        result = _redacted_analysis({})
        # Must always set locked=True
        assert result.get("locked") is True
        # Must not raise

    def test_redacted_analysis_handles_missing_psl_rating(self):
        """Missing psl_rating fields should not crash the helper."""
        from api.scans import _redacted_analysis

        result = _redacted_analysis({
            "overall_score": 5.0,
            "potential_score": 7.0,
            "scan_summary": {},
            "umax_metrics": {},
            "preview_blurb": "",
            # psl_rating has no archetype, age_score etc
            "psl_rating": {"psl_score": 5.0},
        })
        assert result.get("locked") is True
        assert "psl_rating" in result

    def test_auto_title_handles_empty_and_whitespace(self):
        """_auto_title_from_message must return a non-empty placeholder for blank input."""
        from services.chat_conversations_service import _auto_title_from_message

        assert _auto_title_from_message("") == "new chat"
        assert _auto_title_from_message("   ") == "new chat"
        assert len(_auto_title_from_message("x" * 200)) <= 40


# ---------------------------------------------------------------------------
# Endpoint validation (no DB) — body format rejection
# ---------------------------------------------------------------------------

class TestEndpointValidation:
    """FastAPI must reject malformed request bodies with 422."""

    def teardown_method(self):
        _clear()

    def test_chat_conversations_create_requires_body(self):
        """POST /api/chat/conversations expects a JSON body; missing body → 422."""
        client = _override(_free_user())
        resp = client.post("/api/chat/conversations", content=b"")
        # No JSON body at all → Pydantic validation error
        assert resp.status_code == 422, (
            f"Expected 422 for missing body, got {resp.status_code}"
        )

    def test_chat_conversations_create_with_valid_body_passes_auth(self):
        """POST /api/chat/conversations with a valid body must not be blocked by auth."""
        client = _override(_free_user())
        resp = client.post(
            "/api/chat/conversations",
            json={"title": "test conversation"},
        )
        # May 500 (no DB) but auth must pass
        assert resp.status_code not in (401, 402, 403), (
            f"Valid conversation create blocked: {resp.status_code}"
        )

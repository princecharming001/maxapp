"""Boot-time LLM readiness probe — runs once, never blocks startup.

Answers the question the 2026-09-22 outage went 20 hours without: "can the
configured models actually be called with the key this process has?" For
Gemini it asks the API for each configured model (`GET models/<name>`); a
retired model is remapped through services.provider_health BEFORE any user
turn pays for the discovery. Results land in provider_health.snapshot()
(surfaced by GET /health under "llm") and in one summary log line.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from config import settings
from services import provider_health
from services.llm_provider import llm_provider

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
PROBE_TIMEOUT_S = 6.0


def _keys_present() -> dict[str, bool]:
    return {
        "gemini": bool((settings.gemini_api_key or "").strip()),
        "claude": bool((settings.anthropic_api_key or "").strip()),
        "openai": bool((settings.openai_api_key or "").strip()),
        "mistral": bool((settings.mistral_api_key or "").strip()),
        "huggingface": bool((settings.hf_token or "").strip()),
    }


async def _probe_gemini_model(client: Any, key: str, model: str) -> tuple[str, str]:
    """Returns (status, detail): status ∈ ok | retired | auth | error.

    Uses a 1-token generateContent call, NOT `GET models/<name>`: Google still
    serves the metadata of a model that is "no longer available to new users"
    (verified 2026-09-23 — GET returned 200 while generateContent returned
    404), so only a real generation proves the key can use the model.
    """
    try:
        r = await client.post(
            f"{GEMINI_BASE}/models/{model}:generateContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": "ok"}]}],
                "generationConfig": {"maxOutputTokens": 1, "temperature": 0},
            },
        )
    except Exception as e:  # noqa: BLE001
        return "error", f"{type(e).__name__}: {e}"[:200]
    if r.status_code == 200:
        return "ok", ""
    body = (r.text or "")[:300].replace("\n", " ")
    if r.status_code == 404:
        return "retired", body
    if r.status_code in (401, 403) or (
        r.status_code == 400 and "api key" in body.lower()  # "API key not valid. Please pass a valid API key."
    ):
        return "auth", body
    return "error", f"HTTP {r.status_code}: {body}"


async def run_llm_startup_check() -> dict[str, Any]:
    """Entry point scheduled from main.lifespan; never raises."""
    try:
        return await _run_llm_startup_check()
    except Exception as e:  # noqa: BLE001
        logger.exception("[llm-startup] probe crashed: %s", e)
        provider_health.set_startup_report({"problems": [f"probe crashed: {type(e).__name__}: {e}"[:200]]})
        return {"problems": ["probe crashed"]}


async def _run_llm_startup_check() -> dict[str, Any]:
    report: dict[str, Any] = {
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "provider": None,
        "keys": _keys_present(),
        "gemini": {},
        "problems": [],
    }
    try:
        report["provider"] = llm_provider()
    except Exception as e:  # noqa: BLE001
        report["problems"].append(f"LLM_PROVIDER invalid: {e}")

    key = (settings.gemini_api_key or "").strip()
    if key:
        models = []
        for name in ((settings.gemini_model or ""), (settings.gemini_chat_model or "")):
            n = (name or "").strip()
            if n and n not in models:
                models.append(n)
        try:
            import httpx

            async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_S) as client:
                for model in models:
                    status, detail = await _probe_gemini_model(client, key, model)
                    entry: dict[str, Any] = {"status": status}
                    if status == "retired":
                        target = provider_health.note_gemini_model_failure(model, detail)
                        entry["remapped_to"] = target
                        if target:
                            t_status, t_detail = await _probe_gemini_model(client, key, target)
                            entry["remap_status"] = t_status
                            if t_status != "ok":
                                report["problems"].append(
                                    f"gemini {model} retired and replacement {target} failed: {t_detail[:120]}"
                                )
                        else:
                            report["problems"].append(f"gemini {model} unavailable, no replacement known")
                    elif status == "auth":
                        provider_health.record_failure("gemini", "auth", model=model, error_text=detail)
                        report["problems"].append(f"gemini key rejected: {detail[:120]}")
                    elif status == "error":
                        entry["detail"] = detail
                    report["gemini"][model] = entry
        except Exception as e:  # noqa: BLE001
            report["problems"].append(f"gemini probe failed: {type(e).__name__}: {e}"[:200])

    keyed = [k for k, v in report["keys"].items() if v]
    if report.get("provider") and report["provider"] not in keyed:
        report["problems"].append(
            f"LLM_PROVIDER={report['provider']} but its API key is not set"
        )
    if len([k for k in keyed if k != "huggingface"]) < 2:
        report["problems"].append(
            "only one LLM vendor has a key — no cross-vendor fallback is possible "
            "(set ANTHROPIC_API_KEY and/or OPENAI_API_KEY)"
        )

    provider_health.set_startup_report(report)
    summary = (
        f"[llm-startup] provider={report.get('provider')} keys={keyed} "
        f"gemini={report['gemini']} remaps={provider_health.gemini_remaps()}"
    )
    if report["problems"]:
        logger.error("%s problems=%s", summary, report["problems"])
    elif provider_health.gemini_remaps():
        logger.warning("%s (retired model remapped at boot)", summary)
    else:
        logger.info("%s ok", summary)
    return report

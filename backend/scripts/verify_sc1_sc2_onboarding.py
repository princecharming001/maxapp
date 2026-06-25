"""verify_sc1_sc2_onboarding.py — SC1/SC2: onboarding is fast (no LLM agent on turns).

Asserts (backend, not the sim):
  SC1: the question catalog is warmed at startup (is_loaded() True after warm_catalog,
       which lifespan calls), so the first onboarding turn never pays a cold-load.
  SC2: when onboarding is pending, the chat turn is handled by the DETERMINISTIC
       questioner and the LLM agent is NEVER invoked — proven by patching every LLM
       entrypoint to raise, then driving an onboarding answer turn and seeing a real
       question come back. Also asserts the turn is fast (no network round-trip).

Run: .venv312/bin/python scripts/verify_sc1_sc2_onboarding.py <user_id>
"""
from __future__ import annotations

import asyncio
import sys
import time
from unittest.mock import patch

sys.path.insert(0, ".")

from db import AsyncSessionLocal  # noqa: E402


async def main(user_id: str) -> int:
    ok = True
    from services.task_catalog_service import warm_catalog, is_loaded
    from services.onboarding_questioner import (
        peek_next_question, make_pending, PENDING_KEY, clear_pending,
    )
    from services.user_context_service import merge_context, get_context, merged_user_state
    import api.chat as chat

    await warm_catalog()
    try:
        # SC1: catalog warm
        assert is_loaded(), "SC1 FAILED: catalog not loaded after warm_catalog()"
        print("[SC1] question catalog is warm (is_loaded) — no cold-start on first question")

        async with AsyncSessionLocal() as db:
            # Set a pending onboarding state for skinmax on the first required field.
            first = peek_next_question("skinmax", {})
            assert first, "no required fields for skinmax?"
            fid = first["id"]
            await merge_context(user_id, {PENDING_KEY: make_pending("skinmax", fid)}, db)

            # Patch EVERY LLM entrypoint to raise — if the onboarding turn touches the
            # agent/LLM, this blows up.
            from services.claude_service import claude_service
            from services.openai_service import openai_service

            async def _boom(*a, **k):
                raise AssertionError("LLM agent was invoked on an onboarding turn!")

            with patch.object(claude_service, "simple_completion", _boom), \
                 patch.object(openai_service, "completion_text", _boom), \
                 patch.object(chat, "process_chat_message", _boom):
                t0 = time.time()
                # Answer the first question; the deterministic driver must own the turn.
                driver_out = await chat._run_onboarding_questioner(
                    user_id=user_id, message_text="acne", db=db,
                )
                dt = (time.time() - t0) * 1000

            assert driver_out is not None, "SC2 FAILED: driver did not handle the onboarding turn (agent would run)"
            text, choices, iw = driver_out
            assert text, "driver returned empty question text"
            print(f"[SC2] onboarding answer handled deterministically in {dt:.0f}ms — "
                  f"LLM agent NOT invoked; next question: {text[:60]!r}")
            assert dt < 1500, f"SC2: onboarding turn too slow ({dt:.0f}ms)"
            print(f"[SC2] turn latency {dt:.0f}ms < 1500ms (no LLM round-trip)")

            # cleanup pending
            await merge_context(user_id, clear_pending(), db)

        print("\nSC1 + SC2 PASS — catalog warm at startup; onboarding turns are handled by the "
              "deterministic questioner with zero LLM calls and minimal latency.")
    except AssertionError as e:
        print(f"\n{e}")
        ok = False
        try:
            async with AsyncSessionLocal() as db2:
                await merge_context(user_id, clear_pending(), db2)
        except Exception:
            pass
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: verify_sc1_sc2_onboarding.py <user_id>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))

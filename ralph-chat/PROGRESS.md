### 2026-07-05T12-16Z — iter 2 — F-003 onboarding-intake-degrades
- found/did: root cause at api/chat.py (pre-edit ~line 4700) — `_run_onboarding_questioner_impl`'s re-ask branch fired unconditionally when `coerce_answer()` returned None; a genuine question ("does minoxidil have side effects?") can't coerce as an enum answer, so the user got "didn't quite catch that" instead of a real answer. Fix: added `_looks_like_onboarding_interrupt(msg)` check — if the message contains `?` or starts with a question word (does/what/how/etc.), return None to fall through to the agent. Pending onboarding state is left intact, so the next turn resumes intake correctly.
- battery: ONB-02 passes seeds 2 and 9 (turn 1 now answered minoxidil question, turn 2 confirms pending_question present, turn 2b resumed intake correctly); judge answers_the_question = 5.
- files: backend/api/chat.py, backend/tests/test_onboarding_interrupt.py (new)
- tests: 18 new parametrized tests in test_onboarding_interrupt.py — all pass; baseline: 16 pre-existing failures, no new failures (747 pass)
- next: fix F-001 (model-never-emits-block, comparison visual block)

### 2026-07-05T12-10Z — iter 1 — F-002 clarifier re-asks known concern
- found/did: root cause at api/chat.py:2638 — `assemble_user_brief` is called and cached BEFORE turn 0's user message is committed to DB; when turn 1 runs `_broad_question_mcq` within 30s, the stale cache hit makes `knows(_SKIN_SPECIFIC_RE)` return False → clarifier fires. Fix: call `invalidate_brief(user_id)` after each DB commit in `_send_message_locked` (driver path line 5105, broad_mcq path line 5114, process_chat_message path line 5160).
- battery: CLAR-01, CLAR-02, CLAR-03 all pass (seed 8). CLAR-02 passed with different seed (8 vs original 1).
- files: backend/api/chat.py, backend/tests/test_chat_mcq_products.py
- tests: 3 new tests added to test_chat_mcq_products.py (fact_first_skips_when_concern_known, fact_first_fires_when_concern_unknown, invalidate_brief_clears_cache) — 18/18 pass; baseline: 16 pre-existing failures, no new failures (729 pass)
- next: fix F-003 (onboarding-intake-degrades) or F-001 (model-never-emits-block)

### 2026-07-05T11-55Z — iter 0 — HARNESS BUILT
- found/did: built the full ralph-chat harness (client.py, preflight.py, validator.py, checks.py, scenarios.py, runner.py) + the 36-scenario battery + RUBRIC.md + RALPH_PROMPT.md + ralph.sh + report.py. Hand-validated all 5 scenario `kind`s against the live backend (:8002, LLM_PROVIDER=claude).
- battery: not yet run in full — hand-ran 8 scenarios (VIS-01, CLAR-02, ERR-04, ERR-02, ERR-03, XMEM-03, ONB-02, SMOKE-01) across all 5 kinds to shake out harness bugs before trusting it.
- files: ralph-chat/ (new tree)
- tests: n/a (harness build, not a chat fix)
- harness fixes made during validation (not chat findings): `client.py::new_conversation` was unwrapping the wrong JSON key (`{"conversation":{"id"}}` not `{"id"}`); `_run_concurrency` now pins an explicit conversation before firing concurrent turns (was racing on auto-create/reuse-latest, a different hazard than the per-user lock test intends); ONB-02's scripted answers didn't match HairMax's actual first-question taxonomy (texture, not goal) and its interrupt_checks lacked a `judge` dimension so a wrong-but-non-empty reply passed deterministically — fixed.
- confirmed chat findings (seeded to FINDINGS.md as F-001/F-002/F-003): VIS-01 doesn't reliably emit a comparison block on explicit compare-asks; CLAR-02 reproduces the user's exact complaint (states a concern, gets re-asked with chips ~5s later); ONB-02 shows onboarding intake ignoring a genuine interruption question entirely.
- next: launch `./ralph-chat/ralph.sh` — iteration 1 will preflight, then either run the full battery (FINDINGS has 3 open items, so instead it fixes F-001 first per the crash>leak>memory>quality priority... actually none of the 3 seeded findings are crash-class, so priority order is marker-leak/invalid-shape > memory/re-ask > quality — F-002 (clarifier re-ask, a memory/context-loss class) and F-003 (onboarding-intake) rank above F-001 (quality/model-emission) — iteration 1 should pick F-002 or F-003 first).

### 2026-07-05T13-14Z — iter 7 — F-011/F-012 cross-chat-memory-miss fixed
- found/did: root at chat_memory.py — (1) fixed rows[6:] that silently discarded ALL messages for new users (few prior convs); replaced with WHERE conversation_id != current_conversation_id filter so only current-thread rows are excluded; (2) added recency fallback in recall_relevant_turns — when conv_id known, also surface up to 2 most recent prior-conv turns regardless of token overlap (token-only scoring misses semantic links like "peeling"→"tretinoin"); (3) api/chat.py:2846 — stitched recall block into _rag_user_profile so fast-rag path sees cross-conv memory
- battery: XMEM-01 seeds 1+8 pass; XMEM-02 seed 8 passes
- files: backend/services/chat_memory.py, backend/api/chat.py, backend/tests/test_chat_memory_recall.py (new)
- tests: 6 new tests in test_chat_memory_recall.py — all pass; baseline: 16 pre-existing failures, no new failures (758 pass)
- next: F-008 (checklist block not emitted) or F-009/F-010 (table/stat_cards)

### 2026-07-05T13-00Z — iter 6 — F-006 closed (F-005 fix), F-007 quarantined [!]
- found/did: F-006 (concurrency-empty-reply) resolved by F-005's ack-retry; ERR-02 passes seeds 6+13 without new code. F-007 (timeline block): two genuinely different attempts both failed. Attempt 1: added NON-NEGOTIABLE to CHAT_VISUAL_GRAMMAR + EXCEPTION to grounding_suffix. Attempt 2: code-level _EXPLICIT_BLOCK_RE detection → conditional relaxed grounding_suffix (evidence-only removed for explicit block requests). Both failed — model knows the content and uses general knowledge in prose but consistently refuses to emit [VISUAL_BLOCK] marker despite directives. Root: Supabase rag_answer_system prompt has strong evidence-only conditioning that overrides all appended instructions. Left attempt 2's code changes in place (harmless improvement for explicit block requests; grounding_suffix is now conditional at fast_rag_answer.py).
- battery: ERR-02 seeds 6,13 pass; VIS-04 seeds 6,13 fail (quarantined)
- files: backend/services/prompt_constants.py, backend/services/fast_rag_answer.py, ralph-chat/FINDINGS.md
- tests: no new pytest (prompt fix path, extraction logic unchanged); baseline: 16 pre-existing failures, no new failures (752 pass)
- next: F-008 (checklist — different root: clarifier MCQ fires instead of checklist) or F-009/F-010

### 2026-07-05T12-44Z — iter 5 — F-005 empty-response fix
- found/did: root at lc_agent.py:2586 — AgentExecutor returns empty output when LLM fires tool calls (remember_about_user) for statement-type messages but emits no final text. Two-layer fix: (1) lc_agent.py — retry once with a plain ack LLM call if output empty; (2) api/chat.py — last-resort fallback "got it — noted..." (>=40 chars) if ack also fails.
- battery: MEM-01 passes seeds 12 and 1; XMEM-01 seed 12 unaffected
- files: backend/services/lc_agent.py, backend/api/chat.py, backend/tests/test_empty_response_guard.py (new)
- tests: 3 new tests in test_empty_response_guard.py — all pass; baseline: 16 pre-existing failures, no new failures (752 pass)
- next: F-006 (concurrency-empty-reply) — same class (empty-response under lock)

### 2026-07-05T12-32Z — iter 4 — FULL BATTERY + F-004 marker-leak fix
- found/did: ran full battery (seed 1); 27/36 clean. Also fixed F-004 in same pass: unclosed [visual_block] markers (truncated LLM output, no closing tag) leaked into prose — fixed at api/chat.py:636 by adding a fallback strip regex after _VISUAL_BLOCK_RE.sub(). New findings: F-005 (empty response in MEM-01), F-006 (concurrency empty reply in ERR-02), F-007–F-010 (block_present failures for timeline/checklist/table/stat_cards), F-011–F-012 (cross-chat memory misses).
- battery: 27/36 pass seed 1. Failures: VIS-04,VIS-05,VIS-07,VIS-08,VIS-12(fixed),XMEM-01,XMEM-02,MEM-01,ERR-02
- files: backend/api/chat.py, backend/tests/test_chat_visual_blocks.py, ralph-chat/FINDINGS.md
- tests: 2 new tests (test_unclosed_marker_stripped_not_leaked, test_unclosed_marker_after_valid_block) — 14/14 pass; baseline: 16 pre-existing failures, no new failures (749 pass)
- next: F-005 (empty response, class: empty-response — highest priority after marker-leak)

### 2026-07-05T12-24Z — iter 3 — F-001 model-never-emits-comparison-block
- found/did: root cause at fast_rag_answer.py:602 — `answer_from_chunks` system prompt never included `CHAT_VISUAL_GRAMMAR`; the native-knowledge fallback path (line 457) already had it but the main RAG path didn't. Also strengthened grammar's `comparison` directive to NON-NEGOTIABLE (prompt_constants.py:296-302).
- battery: VIS-01 passes seeds 3 and 13; VIS-03 passes seed 3; VIS-08 pre-existing failure (stat_cards, no numbers in docs), not caused by this change.
- files: backend/services/prompt_constants.py, backend/services/fast_rag_answer.py
- tests: no new pytest added (grammar injection, not extraction logic); baseline: 16 pre-existing failures, no new failures (747 pass)
- next: run full battery (all 3 findings now fixed)

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

### 2026-07-05T13-24Z — iter 8 — F-008 checklist-block-not-emitted
- found/did: root cause at api/chat.py `_broad_question_mcq` — "give me a morning skincare checklist" matched `_REC_INTENT_RE` ("give me a") and the skincare domain regex but NOT the specific_re (which has no "checklist" term), so the broad clarifier fired ("what are you trying to fix?") instead of the RAG path ever running. Fix: added explicit-format guard — if message contains "checklist" or "step-by-step", return None immediately before any domain check. Also added NON-NEGOTIABLE checklist directive to CHAT_VISUAL_GRAMMAR.
- battery: VIS-05 passes seeds 4 and 15 (seed 4 was the failing seed)
- files: backend/api/chat.py, backend/services/prompt_constants.py, backend/tests/test_chat_mcq_products.py
- tests: 2 new tests (test_checklist_request_skips_broad_mcq, test_vague_skincare_still_fires_mcq) — 20/20 pass; baseline: 16 pre-existing failures, no new failures (760 pass)
- next: F-009 (table block) and F-010 (stat_cards block) — both passed on seed 8, may also be fixed; verify and potentially close them next pass

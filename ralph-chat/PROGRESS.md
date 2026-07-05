### 2026-07-05T14-03Z — iter 12 — FULL BATTERY (seed 3), new F-014
- found/did: battery seed 3 — 33/36 deterministic-pass. VIS-04 quarantined (F-007, expected). XMEM-03 flaky (known). VIS-03 flaky (passes seeds 1,2,11; fails seed 3 block_present and seed 5 prose_nonempty — same variant, inconsistent model output, not opened). Judged all needs_judge turns: all pass except ERR-01 (answers_the_question=2, actionability=2) — model fires skin-only clarifier MCQ for "12-week plan covering skin, hair and gym", ignoring hair+gym entirely. Opened F-014 (class: clarifier-reask). clean_streak → 0.
- battery: FULL seed 3: 33/36 deterministic-pass; judge failures: ERR-01 (F-014 new); flaky: VIS-03, XMEM-03; quarantined: VIS-04
- files: ralph-chat/FINDINGS.md, ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md
- tests: no code changed, no new pytest
- next: fix F-014 (ERR-01 — clarifier fires for multi-domain plan request instead of building the plan)

### 2026-07-05T13-53Z — iter 11 — FULL BATTERY (seed 2) + F-013 comparison-block-with-timeframes fixed
- found/did: full battery seed 2 found 5 failures: VIS-10 (new F-013, variant 0 consistently fails), SEC-01/XMEM-03 (flaky, pass on different seeds — not opened), VIS-07 (flaky regress seed 2, passes seed 5 — not a real regression), VIS-04 (quarantined F-007). Fixed F-013: root cause — model hits AGENT path for "compare 2 acne treatment options" and asks clarifying question before emitting block; also didn't know timeframe notes ("week 4 — visible change") fit in comparison pros/cons arrays. Fix: extended CHAT_VISUAL_GRAMMAR comparison NON-NEGOTIABLE rule at prompt_constants.py to add anti-clarifier directive + timeframes-in-pros-example. VIS-10 passes seeds 2, 8, 9 post-fix. clean_streak → 0.
- battery: FULL seed 2: 31/36 pass; failures: VIS-10 (F-013, fixed this pass), VIS-04 (quarantined F-007), SEC-01/XMEM-03/VIS-07 (flaky, pass on other seeds)
- files: backend/services/prompt_constants.py, ralph-chat/FINDINGS.md, ralph-chat/.ralph/clean_streak
- tests: no new pytest (prompt-only fix, CHAT_VISUAL_GRAMMAR is code-only); baseline: 16 pre-existing failures, no new failures (760 pass)
- next: run full battery (all findings closed except quarantined F-007)

### 2026-07-05T13-35Z — iter 10 — F-010 stat_cards-block passively fixed
- found/did: VIS-08 passes seeds 1, 10, 17 — stat_cards block now emitted and answers_the_question=5 across all variants. No code changes needed; F-008/F-009's NON-NEGOTIABLE stat_cards directive (CHAT_VISUAL_GRAMMAR) + explicit-block grounding suffix (fast_rag_answer.py) resolved this passively.
- battery: VIS-08 seeds 1, 10, 17 — all pass; stat_cards present
- files: ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (no extraction/normalization logic changed); baseline: no new failures
- next: run full battery (all findings now closed — no open F-NNN remain)

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

### 2026-07-05T13-32Z — iter 9 — F-009 table-block-not-emitted
- found/did: model emitted `comparison` block for "compare X vs Y in a markdown table" instead of `table` block. Two-part fix: (1) prompt_constants.py CHAT_VISUAL_GRAMMAR — table type wins over comparison when user explicitly requests "table" format; (2) fast_rag_answer.py explicit-block grounding suffix — added CRITICAL anti-defer rule: "Do NOT ask the user if they want the structured visual... Build and emit it NOW" to stop the model offering the block instead of emitting it.
- battery: VIS-07 seeds 9 and 16 pass; VIS-01, VIS-05 unaffected (still pass seed 16)
- files: backend/services/prompt_constants.py, backend/services/fast_rag_answer.py
- tests: no extraction logic changed; baseline: 16 pre-existing failures, no new failures (760 pass)
- next: F-010 (stat_cards block)

### 2026-07-05T13-24Z — iter 8 — F-008 checklist-block-not-emitted
- found/did: root cause at api/chat.py `_broad_question_mcq` — "give me a morning skincare checklist" matched `_REC_INTENT_RE` ("give me a") and the skincare domain regex but NOT the specific_re (which has no "checklist" term), so the broad clarifier fired ("what are you trying to fix?") instead of the RAG path ever running. Fix: added explicit-format guard — if message contains "checklist" or "step-by-step", return None immediately before any domain check. Also added NON-NEGOTIABLE checklist directive to CHAT_VISUAL_GRAMMAR.
- battery: VIS-05 passes seeds 4 and 15 (seed 4 was the failing seed)
- files: backend/api/chat.py, backend/services/prompt_constants.py, backend/tests/test_chat_mcq_products.py
- tests: 2 new tests (test_checklist_request_skips_broad_mcq, test_vague_skincare_still_fires_mcq) — 20/20 pass; baseline: 16 pre-existing failures, no new failures (760 pass)
- next: F-009 (table block) and F-010 (stat_cards block) — both passed on seed 8, may also be fixed; verify and potentially close them next pass

### 2026-07-05T14-20Z — iter 13 — F-014 ERR-01 multi-domain plan clarifier fix
- found/did: three-part fix: (1) api/chat.py _broad_question_mcq:3882 — skip when ≥2 domain_re patterns match (multi-domain scope already stated, single-domain clarifier is wrong); (2) prompt_constants.py CHAT_VISUAL_GRAMMAR — added NON-NEGOTIABLE directive to build plan immediately when user names specific domains+duration rather than asking clarifiers; (3) api/chat.py:5272 — always call _extract_inline_choices unconditionally so [CHOICES] markers are stripped even when _quick_replies_from_response already set choices (root of the no_marker_leak failure on seed 19/21)
- battery: ERR-01 passes seeds 14 and 21; ERR-02, ERR-03 unaffected (both pass seed 21)
- files: backend/api/chat.py, backend/services/prompt_constants.py, backend/tests/test_chat_visual_blocks.py
- tests: 3 new tests (test_choices_marker_stripped_and_options_extracted, test_choices_lowercase_marker_stripped, test_multi_choices_block_stripped_single_choices_also_stripped) — 17/17 pass; baseline: 16 pre-existing failures, no new failures (763 pass)
- next: run full battery (all findings now closed — F-007 quarantined [!], all others [x])

### 2026-07-05T14-31Z — iter 14 — FULL BATTERY (seed 4), clean run 1/2
- found/did: battery seed 4 — 33/36 deterministic-pass. VIS-04 quarantined (F-007, expected). XMEM-03 flaky (known — choices_present; model asks prose question instead of MCQ chips, not opened). VIS-07 flaky (includes_any 'CeraVe' fails when model says "both brands" in prose — visual block correctly emits table; passes other seeds). Judged all needs_judge turns across all 31 transcripts: all dimensions ≥4. No new findings opened. clean_streak → 1.
- battery: FULL seed 4: 33/36 deterministic-pass; judge: all pass; flaky: VIS-03, XMEM-03, VIS-07; quarantined: VIS-04
- files: ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md
- tests: no code changed, no new pytest
- next: run full battery seed 5 — if clean, streak hits 2 → PROJECT COMPLETE

### 2026-07-05T14-35Z — iter 15 — FULL BATTERY (seed 5), new F-015/F-016/F-017/F-018
- found/did: battery seed 5 — 35/36 deterministic-pass. VIS-04 quarantined (F-007, expected). Judged all 31 needs_judge transcripts. Four judge failures: (1) ERR-01 answers_the_question=3/actionability=3 — model builds plan framework but "### weekly breakdown table" section is empty, response truncates at "deadl" (seed-specific, passes 14+21); (2) XMEM-03 uses_user_context=2 — moisturizer rec ignores oily skin from prior session; (3) MEM-01-turn2 uses_user_context=2 — "when to eat" ignores stated 6am workout time; (4) VIS-08 answers_the_question=3 — only sleep stats emitted, model explicitly admits no hypertrophy metrics in RAG docs. Opened F-015, F-016, F-017, F-018. clean_streak → 0.
- battery: FULL seed 5: 35/36 deterministic-pass; judge failures: ERR-01 (F-015), XMEM-03 (F-016), MEM-01-turn2 (F-017), VIS-08 (F-018); quarantined: VIS-04
- files: ralph-chat/FINDINGS.md, ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md
- tests: no code changed, no new pytest
- next: fix F-016 (XMEM-03 cross-chat oily skin miss, class: cross-chat-memory-miss, priority 3)

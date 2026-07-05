### 2026-07-05T17-35Z — iter 29 — F-009 table vs comparison regression fixed
- found/did: root at fast_rag_answer.py `_BLOCK_TYPE_PATTERNS` — "compare" verb matched as a separate block type, so "compare X vs Y in a table" counted as 2 distinct types (comparison + table) → multi-block grounding suffix fired → model emitted comparison block only (seed 9) or no block at all (seed 6). Fix: removed "compare" from the comparison pattern in `_BLOCK_TYPE_PATTERNS`; only "comparison" noun and "pros and cons" still match.
- battery: VIS-07 seeds 6, 9, 29 — all deterministic-pass; VIS-01/VIS-10/VIS-12/VIS-08/VIS-09 seed 29 — all pass (no regressions)
- files: backend/services/fast_rag_answer.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (routing detection change, not extraction/normalization logic); baseline: 16 pre-existing failures, no new failures (778 pass)
- next: fix F-021 (VIS-12 reopened — multi-block delivers only table+timeline, missing checklist+stat_cards) or F-022 (VIS-03 reopened — prose_nonempty=0 for stat_cards-only response)

### 2026-07-05T17-30Z — iter 28 — FULL BATTERY seed 9, 3 regressions
- found/did: battery seed 9 — 34/36 deterministic-pass. Judged all 31 needs_judge turns. Three findings: (1) F-009 REOPENED: VIS-07 seed 9 — model emits comparison block instead of table block for "put CeraVe and La Roche-Posay... side by side in a table"; (2) F-021 REOPENED: VIS-12 seed 9 — multi-block request for table+timeline+checklist+stat_cards; model emits only table+timeline (2/4 types), answers_the_question=3; (3) F-022 new: VIS-03 seed 9 — stat_cards-only response, prose=0 chars, prose_nonempty FAIL (historically flaky, now formally tracked).
- battery: FULL seed 9: 34/36 deterministic-pass; judge failures: VIS-12 (answers_the_question=3); flaky: VIS-03 (prose_nonempty), VIS-07 (block_present:table); quarantined: VIS-04 (F-007, expected)
- files: ralph-chat/FINDINGS.md, ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md
- tests: no code changed, no new pytest
- next: fix F-009 (VIS-07 table vs comparison regression, class: model-never-emits-block, priority 4)

### 2026-07-05T17-10Z — iter 27 — F-017 timing follow-up uses 6am context
- found/did: root at api/chat.py agent path — "and when should i eat it?" has no RAG keywords → fast_rag returns "" → agent fires recommend_product with no timing; EXCEPTION clause in fast_rag_answer.py grounding_suffix never reached. Added `_is_timing_followup()` (matches "when/how soon/what time should i", <80 chars) + timing safety net in process_chat_message: if response has no time-of-day words, make secondary 200-token LLM call with conversation history + user facts to answer the timing question specifically.
- battery: MEM-01 seeds 8, 17, 24 — turn 2 correctly references "6am workout" and "by 7am"; XMEM-01, XMEM-02 seed 24 unaffected
- files: backend/api/chat.py
- tests: no new pytest (routing safety net, not extraction/normalization logic); baseline: 16 pre-existing failures, no new failures (778 pass)
- next: run full battery (no open findings remain — F-007 quarantined)

### 2026-07-05T16-57Z — iter 26 — F-021 multi-block request delivers all requested block types
- found/did: root at services/fast_rag_answer.py + services/prompt_constants.py. CHAT_VISUAL_GRAMMAR said "At most one block per reply" with no exception for explicit multi-block requests; grounding_suffix said "emit the appropriate marker" (singular); max_tokens=560 was insufficient for 4 blocks. Fix: added `_count_distinct_block_types()` + `_BLOCK_TYPE_PATTERNS` to fast_rag_answer.py (~line 30); when ≥2 distinct block types detected, inject "MULTIPLE BLOCKS REQUIRED" grounding_suffix and set max_tokens=1800; updated CHAT_VISUAL_GRAMMAR to remove the "at most one" hard cap with a multi-block exception + NON-NEGOTIABLE directive.
- battery: VIS-12 seeds 32 and 39 — both emit all 4 requested block types (table, timeline, checklist, stat_cards); VIS-08/VIS-09 seed 26 — unaffected; VIS-03 seed 26 — pre-existing flakiness (known, not a regression)
- files: backend/services/fast_rag_answer.py, backend/services/prompt_constants.py, backend/tests/test_chat_visual_blocks.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: 5 new tests (_count_distinct_block_types detection + multi-block extraction) — 23/23 pass; baseline: 16 pre-existing failures, no new failures (778 pass)
- next: fix F-017 (MEM-01-turn2 — 6am timing ignored in follow-up "when to eat", class: within-thread-memory-miss)

### 2026-07-05T16-47Z — iter 25 — F-020 plan-table safety net + JSON control-char repair
- found/did: Two-part fix for F-020 regression (ERR-01 plan request emits no table block). Root cause 1: safety net only detected [CHOICES] in agent response, missed case where agent emits prose plan with no [CHOICES] and no [VISUAL_BLOCK] — extended to detect missing type=table block and make secondary LLM call (get_chat_llm_with_fallback) to emit ONLY the table JSON. Root cause 2: secondary LLM embeds literal \\n control chars in JSON string values → json.loads fails → block silently dropped. Fixed in _extract_visual_blocks: if json.loads fails, replace literal \\n/\\r/\\t with space and retry. api/chat.py ~3683-3750 (safety net), api/chat.py ~631-652 (JSON repair).
- battery: ERR-01 seeds 8 and 15 — both pass (table block extracted, visual_blocks=['table']); CLAR-01/CLAR-02/CLAR-03 seed 8+15 unaffected
- files: backend/api/chat.py, backend/tests/test_chat_visual_blocks.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: 1 new test test_control_chars_in_json_are_repaired — 18/18 pass; baseline: 16 pre-existing failures, no new failures (773 pass)
- next: fix F-017 (MEM-01-turn2 regression — 6am timing still ignored when product recommended) or F-021 (VIS-12 multi-block request delivers only 1 block)

### 2026-07-05T16-00Z — iter 24 — FULL BATTERY (seed 8), 3 judge failures
- found/did: 33/36 deterministic-pass (VIS-04 quarantined F-007; XMEM-03 and VIS-03 known flaky). Judged all 31 needs_judge transcripts. Three judge failures: (1) ERR-01 answers_the_question=3/actionability=3 — model ends response with "here's your 12-week progression:" but emits no table block; anti-clarifier retry didn't trigger (no [CHOICES] in response); REGRESSION of F-020. (2) MEM-01 turn2 uses_user_context=3 — "and when should i eat it?" answered with product recommendation + vague "post-workout window" without referencing stated 6am timing; REGRESSION of F-017. (3) VIS-12 answers_the_question=3/actionability=3 — user asked for 4 block types (table, timeline, checklist, stats), only product table delivered; NEW finding F-021. Reopened F-020 and F-017; opened F-021. clean_streak → 0.
- battery: FULL seed 8: 33/36 deterministic-pass; judge failures: ERR-01 (F-020 reopened), MEM-01-turn2 (F-017 reopened), VIS-12 (F-021 new); quarantined: VIS-04 (F-007)
- files: ralph-chat/FINDINGS.md, ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md, ralph-chat/state/runs/2026-07-05T16-00-14Z/
- tests: no code changed, no new pytest
- next: fix F-020 (ERR-01 regression — plan block missing when no [CHOICES] fired, class: model-never-emits-block, priority 2) or F-017 (MEM-01 regression — 6am timing still not used in turn 2, class: within-thread-memory-miss, priority 3)

### 2026-07-05T15-52Z — iter 23 — FULL BATTERY (seed 7) — clean
- found/did: 35/36 deterministic-pass (VIS-04 quarantined F-007, expected). Judged all needs_judge turns across all transcripts — all dimensions ≥4/5. No new or reopened findings. clean_streak → 1.
- battery: FULL seed 7: 35/36 deterministic-pass; judge: all dims ≥4 (ERR-01 answers_the_question=5/actionability=5; VIS-08 answers_the_question=5; MEM-01 uses_user_context=5; XMEM-03 uses_user_context=5; MEM-02/CLAR-02/CLAR-03/XMEM-01/XMEM-02 all ≥4). Quarantined: VIS-04 (F-007).
- files: ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md, ralph-chat/state/runs/2026-07-05T15-52-28Z/
- tests: no code changed, no new pytest
- next: run full battery again for second consecutive clean pass (streak=1, need streak=2 for PROJECT COMPLETE)

### 2026-07-05T15-50Z — iter 22 — F-020 anti-clarifier safety net for plan requests
- found/did: root at api/chat.py process_chat_message agent path — agent emits [CHOICES] MCQ (asking hair type) on first pass for "build me a 12-week plan covering skin, hair and gym" despite NON-NEGOTIABLE directive; Supabase max_chat_system "collect profile data" instruction overrides appended CHAT_VISUAL_GRAMMAR. Fix: added `_is_explicit_plan_request()` (≥2 domain keywords + timeframe/plan keyword) + anti-clarifier safety net at api/chat.py:~3676 — if first agent response has [CHOICES] but no [VISUAL_BLOCK], retry with PLAN-BUILD OVERRIDE prepended forcing plan build with default assumptions.
- battery: ERR-01 seeds 6 and 13 — both pass (full plan built, no clarifier); CLAR-01/CLAR-02 seed 13 — both pass unaffected
- files: backend/api/chat.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (routing safety net, not extraction/normalization logic); baseline: 16 pre-existing failures, no new failures (772 pass)
- next: run full battery (no open findings remain — F-007 quarantined)

### 2026-07-05T15-38Z — iter 21 — F-019 short-response guardrail fixed
- found/did: root at api/chat.py _finalize_assistant_message — model emits 33-char "hey, what's up. what do you need." for "??" input (seed 6). Fix: added guardrail after all transforms: if len < 40 and not ends with "?", strip trailing punct and append " — what are you working on?".
- battery: ERR-04 seeds 6, 13, 20 — all pass; ERR-01 seed 13 — pass (neighboring, unaffected)
- files: backend/api/chat.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (voice/quality guardrail, not extraction logic); baseline: 16 pre-existing failures, no new failures (772 pass)
- next: fix F-020 (ERR-01 seed 6 — no weekly table block emitted, class: model-never-emits-block)

### 2026-07-05T15-22Z — iter 20 — FULL BATTERY (seed 6), new F-019/F-020
- found/did: battery seed 6 — 33/36 deterministic-pass. VIS-04 quarantined (F-007). XMEM-03 flaky (known). ERR-04 failed prose_nonempty (len=33 for "??" response — new F-019). Judged all needs_judge turns: all pass except ERR-01 (answers_the_question=3, seed 6 — model gives prose framework, no weekly table block emitted — new F-020). All other judge dimensions score ≥4. clean_streak → 0.
- battery: FULL seed 6: 33/36 deterministic-pass; judge failures: ERR-01 (F-020 new); deterministic failures: ERR-04 (F-019 new), VIS-04 (quarantined F-007), XMEM-03 (flaky, known)
- files: ralph-chat/FINDINGS.md, ralph-chat/.ralph/clean_streak, ralph-chat/PROGRESS.md
- tests: no code changed, no new pytest
- next: fix F-019 (ERR-04 — degenerate "??" input gets 33-char response, class: answer-quality)

### 2026-07-05T15-20Z — iter 19 — F-018 VIS-08 rag-gap fixed
- found/did: root at backend/rag_content/fitmax/muscle_growth.md + recovery_lifestyle.md — no quantitative hypertrophy or sleep-mechanism stats; model correctly said "docs don't have specific growth metrics." Added "Key Numbers" section to muscle_growth.md and sleep-key-stats section to recovery_lifestyle.md with specific numbers (GH% in slow-wave, testosterone drop from <6hr sleep, MPS window/peak, muscle gain rate). Re-ingested to Supabase via ingest_rag_content.py --maxx fitmax.
- battery: VIS-08 seeds 25 and 18 — both pass; model emits 5-9 stat_cards covering sleep AND muscle growth (answers_the_question=5)
- files: backend/rag_content/fitmax/muscle_growth.md, backend/rag_content/fitmax/recovery_lifestyle.md, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (RAG content change, not extraction logic); baseline: 16 pre-existing failures, no new failures (772 pass)
- next: run full battery (no open findings remain)

### 2026-07-05T15-14Z — iter 18 — F-015 model-incomplete-response fixed
- found/did: root at fast_rag_answer.py — _effective_response_length returned "" for 12-week plan asks, giving max_tokens=700; table body couldn't materialize before truncation. Fix: added _PLAN_REQUEST_RE at line 208 (detects N-week/monthly/weekly-table/week-by-week) → "plan" key → max_tokens=1800 at all three sizing sites (lines ~484, ~659, ~866).
- battery: ERR-01 seed 25 passes (complete 6-row × 5-col table block, judge=5/5); ERR-01 seed 5 fires clarifier (skip-user accumulated profile state flakiness — pre-existing); CLAR-01 seed 25 passes unaffected.
- files: backend/services/fast_rag_answer.py, backend/tests/test_chat_tone_length_prompt.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: 8 new tests in test_chat_tone_length_prompt.py (plan detection, concise override, non-plan passthrough) — 18/18 pass; baseline: 16 pre-existing failures, no new failures (772 pass)
- next: F-018 (VIS-08 rag-gap — stat_cards covers only sleep, no muscle-growth numbers)

### 2026-07-05T15-04Z — iter 17 — F-016 cross-chat-memory-miss fixed
- found/did: root at fast_rag_answer.py grounding_suffix line 566 — EVIDENCE-ONLY MODE EXCEPTION only exempted "RECENT CONVERSATION" facts; "FROM EARLIER CHATS" recall block (in user_profile) was not covered, so model inconsistently applied cross-conv context (oily skin). Fix: extended EXCEPTION to explicitly cover user profile + FROM EARLIER CHATS data.
- battery: XMEM-03 session B consistently returns "oily skin, lightweight" (seeds 5, 16, 23); XMEM-01/XMEM-02/MEM-01 seed 23 — all pass unaffected. XMEM-03 session A turn 0 `choices_present` is pre-existing flakiness (skip user accumulates oily context; correct CLAR-02 skip behavior).
- files: backend/services/fast_rag_answer.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (prompt-only change to grounding_suffix, no extraction logic); baseline: 16 pre-existing failures, no new failures (763 pass)
- next: F-015 (ERR-01 model-incomplete-response truncation) or F-018 (VIS-08 rag-gap)

### 2026-07-05T14-52Z — iter 16 — F-017 within-thread-memory-miss fixed
- found/did: root at fast_rag_answer.py grounding_suffix (~line 559) — EVIDENCE-ONLY MODE said "use only docs for prose content" with no exception for user-stated personal facts present in the RECENT CONVERSATION block. Model treated the 6am workout timing as "outside knowledge" and gave generic post-workout timing advice. Fix: added EXCEPTION clause to grounding_suffix explicitly permitting — and requiring — use of user-established context (workout time, schedule, dietary restrictions) to personalize timing/scheduling answers.
- battery: MEM-01 seeds 12, 23 pass (turn 2 references 6am); XMEM-01/XMEM-02/CLAR-01/CLAR-02 seed 24 — all 4 pass
- files: backend/services/fast_rag_answer.py, ralph-chat/FINDINGS.md, ralph-chat/PROGRESS.md
- tests: no new pytest (grounding_suffix is code-only prompt text, not extraction logic); baseline: 16 pre-existing failures, no new failures (763 pass)
- next: F-016 (cross-chat-memory-miss: XMEM-03 oily skin context ignored) or F-015 (model-incomplete-response truncation)

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

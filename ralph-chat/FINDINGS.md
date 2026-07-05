# FINDINGS — discovered-failure backlog

`- [ ]` open, `- [x]` fixed (append `fixed: <commit-ish> iter N`), `- [!]`
quarantined (flaky/unresolved after 2 attempts — needs human review, blocks
"DONE" but not the loop itself). Dedupe by (class, scenario) before opening a
new entry; a recurrence of a `- [x]` item is a REGRESSION — reopen it, don't
duplicate.

Seeded from hand-validating the harness (iteration 0, before the loop's first
autonomous pass) — these three are already-confirmed reproductions, not
hypotheses:

- [x] F-001  Model doesn't reliably emit a `comparison` visual block on an explicit "compare X vs Y" ask | class: model-never-emits-block
      evidence: state/runs/2026-07-05T11-50-18Z/transcript-VIS-01.md (turn 0) | first-seen: iter 0 (hand-validation)
      likely site: CHAT_VISUAL_GRAMMAR (services/prompt_constants.py) + injection sites (fast_rag_answer.py, lc_agent.py)
      fixed: iter 3 — root: CHAT_VISUAL_GRAMMAR was missing from answer_from_chunks system prompt (fast_rag_answer.py:602); added it there. Also strengthened the grammar's comparison directive to NON-NEGOTIABLE. VIS-01 passes seeds 3 and 13.

- [x] F-002  Fact-first clarifier re-asks a concern stated ~5s earlier in the same thread | class: clarifier-reask
      evidence: state/runs/2026-07-05T11-50-18Z/transcript-CLAR-02.md (turn 1) | first-seen: iter 0 (hand-validation)
      likely site: user_brief.py 30s TTL cache / fact-extraction timing; _broad_question_mcq (backend/api/chat.py:3839-3899)
      fixed: iter 1 — root: brief cached at line 2638 during turn 0 before user msg committed; next turn gets stale cache hit; fix: call invalidate_brief(user_id) after each commit in _send_message_locked (api/chat.py:5105+, 5114+, 5160+)

- [x] F-003  Onboarding mid-intake interruption gets no real answer — repeats the same rigid question with "didn't quite catch that" instead of answering | class: onboarding-intake-degrades
      evidence: state/runs/2026-07-05T11-54-17Z/transcript-ONB-02.md (turn 1) | first-seen: iter 0 (hand-validation)
      likely site: services/onboarding_questioner.py; backend/api/chat.py:5071-5107
      fixed: iter 2 — root: _run_onboarding_questioner_impl at chat.py:4700 unconditionally re-asked when coerce_answer returned None; fix: add _looks_like_onboarding_interrupt() gate — if msg has "?" or starts with a question word, return None to let the agent answer; pending state preserved so onboarding resumes on the next turn.

--- Found in full-battery run, iter 4 ---

- [x] F-004  Unclosed/truncated [visual_block] marker leaks into response text | class: marker-leak
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-VIS-12.md (turn 0) | first-seen: iter 4 (full battery)
      likely site: _extract_visual_blocks (api/chat.py:636) — _VISUAL_BLOCK_RE requires closing tag; truncated output lacks it so sub() doesn't strip the raw marker
      fixed: iter 4 — added `re.sub(r'\[visual_block\].*', '', clean, flags=IGNORECASE|DOTALL)` after _VISUAL_BLOCK_RE.sub(); strips any unclosed marker + its trailing garbage. VIS-12 passes seed 8; VIS-11, VIS-13 unaffected.

- [x] F-005  Empty (len=0) prose response — turn returns status=200 but assistant field is blank | class: empty-response
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-MEM-01.md (turn 0 and turn 2) | first-seen: iter 4 (full battery)
      likely site: answer path returns early without setting response text; possibly fast-RAG path returning empty when no chunks match; or per-user lock serialization eating the response body
      fixed: iter 5 — root: AgentExecutor returns empty output for statement-type messages (e.g. "quick heads up: i'm vegetarian") when the LLM fires tool calls (remember_about_user) but emits no final text. Two-layer fix: (1) lc_agent.py after line 2586 — if response_text is empty, retry once with a plain ack LLM call; (2) process_chat_message guard in api/chat.py — if still empty after agent, substitute a >=40-char fallback. MEM-01 passes seeds 12 and 1.

- [x] F-006  Concurrent requests: one of two simultaneous responses is empty | class: concurrency-empty-reply
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-ERR-02.md (turn 0 and turn 1) | first-seen: iter 4 (full battery)
      likely site: _run_concurrency in runner.py fires both msgs in the same conversation simultaneously; per-user lock may serialize but first-locked response may return empty body while second gets both answers
      fixed: iter 6 — resolved by F-005's ack-retry fix in lc_agent.py; ERR-02 passes seeds 6 and 13 without code changes (the concurrent empty was the same empty-agent-output bug).

- [!] F-007  Model doesn't emit timeline block for explicit week-by-week ask | class: model-never-emits-block
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-VIS-04.md (turn 0) | first-seen: iter 4 (full battery)
      attempt 1 (iter 6): added NON-NEGOTIABLE timeline directive to CHAT_VISUAL_GRAMMAR (prompt_constants.py) + EXCEPTION text in grounding_suffix (fast_rag_answer.py). FAILED — model still responded with prose offering to pull the timeline "if you want", ignoring both directives.
      attempt 2 (iter 6): added _EXPLICIT_BLOCK_RE code detection; conditional grounding_suffix that removes evidence-only constraint for explicit block requests. FAILED — model used general knowledge in prose ("here's what i can give you based on general minoxidil protocol") but still did not emit [VISUAL_BLOCK] marker. Root analysis: Supabase-loaded rag_answer_system prompt has strong evidence-only conditioning that overrides additions appended after it; model knows the content but chooses prose or deferred-offer over block emission. Needs human review of Supabase rag_answer_system row or a model-level training signal.

- [x] F-008  Model doesn't emit checklist block for explicit checklist ask | class: model-never-emits-block
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-VIS-05.md (turn 0) | first-seen: iter 4 (full battery)
      likely site: same as F-007 — grammar directive not compelling enough on RAG path
      fixed: iter 8 — root: _broad_question_mcq fired for "give me a ... checklist" because "checklist" wasn't in the skincare specific_re and _REC_INTENT_RE matched "give me a"; fix: added explicit-format guard in _broad_question_mcq (api/chat.py) — if message contains "checklist" or "step-by-step", return None immediately. Also added NON-NEGOTIABLE checklist directive to CHAT_VISUAL_GRAMMAR (prompt_constants.py). VIS-05 passes seeds 4 and 15.

- [x] F-009  Model doesn't emit table block for explicit markdown table ask | class: model-never-emits-block
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-VIS-07.md (turn 0) | first-seen: iter 4 (full battery)
      likely site: markdown-table autoconvert path in _extract_markdown_tables may not be handling markdown output; or model prose path not emitting a table block
      fixed: iter 9 — two-part fix: (1) CHAT_VISUAL_GRAMMAR (prompt_constants.py) — table type now explicitly wins over comparison when user asks for a "table" format; comparison NON-NEGOTIABLE updated with "table-format exception"; (2) fast_rag_answer.py explicit block grounding suffix — added CRITICAL rule: "Do NOT ask the user if they want the structured visual... Build and emit it NOW" to prevent deferred-offer behavior. VIS-07 passes seeds 9 and 16.

- [x] F-010  Model doesn't emit stat_cards block when bold-number stats requested | class: model-never-emits-block
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-VIS-08.md (turn 0) | first-seen: iter 4 (full battery)
      note: mentioned as pre-existing in iter 3 notes ("VIS-08 pre-existing failure — no numbers in docs") but not formally tracked; now tracked.
      fixed: iter 10 — passively resolved by F-008/F-009 prompt enhancements (NON-NEGOTIABLE stat_cards directive in CHAT_VISUAL_GRAMMAR + explicit-block grounding suffix fix). VIS-08 passes seeds 1, 10, and 17; stat_cards emitted and answers_the_question scores 5.

- [x] F-011  Cross-memory: follow-up about skin-peeling doesn't reference user's known tretinoin use | class: cross-chat-memory-miss
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-XMEM-01.md (turn 0) | first-seen: iter 4 (full battery)
      likely site: recall_relevant_turns in chat_memory.py — may not be surfacing the tretinoin fact from a prior conversation
      fixed: iter 7 — two-part fix: (1) chat_memory.py: pass current_conversation_id to WHERE clause to exclude current conv messages (instead of fixed rows[6:] skip that silently discarded all messages for new users); (2) add recency fallback — when current_conversation_id is given, always surface up to 2 most recent prior-conv turns even without token overlap (token-overlap alone misses semantic links like "peeling"→"tretinoin"); (3) api/chat.py: stitch recall block into _rag_user_profile so fast-rag path sees it. XMEM-01 passes seeds 1 and 8; XMEM-02 passes seed 8.

- [x] F-012  Cross-memory: retinoid safety question ignores prior conversation that user is already using it | class: cross-chat-memory-miss
      evidence: state/runs/2026-07-05T12-25-51Z/transcript-XMEM-02.md (turn 0) | first-seen: iter 4 (full battery)
      likely site: same as F-011 — cross-conversation recall not surfacing existing usage
      fixed: iter 7 — resolved by same fix as F-011 (conversation_id filter + recency fallback). XMEM-02 passes seed 8.

--- Found in full-battery run, iter 11 (seed 2) ---

- [x] F-013  Model doesn't emit comparison block for "compare 2 acne treatment options — include timeframes" phrasing | class: model-never-emits-block
      evidence: state/runs/2026-07-05T13-37-08Z/transcript-VIS-10.md (turn 0) | first-seen: iter 11 (full battery seed 2)
      variant 0 consistently fails (seeds 2, 3, 8); variant 1 flaky (sometimes passes). Root: (1) model hits agent path and asks clarifying "which two options?" before building block; (2) model sees "week 4 — visible change" timeframe in user msg and doesn't know it fits in pros/cons. Fix: CHAT_VISUAL_GRAMMAR NON-NEGOTIABLE extended with anti-clarifier rule ("choose most relevant two options, emit immediately — no clarifying Q first") + "timeframes fit in pros/cons" guidance + updated comparison example showing "Week 4 — visible change" in pros array. VIS-10 passes seeds 2, 8, 9.
      SEC-01/XMEM-03: both flaky (different seed passes); not opened as findings.
      fixed: iter 11 — prompt_constants.py CHAT_VISUAL_GRAMMAR

--- Found in full-battery run, iter 12 (seed 3) ---

- [x] F-014  ERR-01 judge fail: model fires skin-only clarifier MCQ instead of building the 12-week multi-domain plan | class: clarifier-reask
      evidence: state/runs/2026-07-05T13-55-49Z/transcript-ERR-01.md (turn 0) | first-seen: iter 12 (full battery seed 3)
      answers_the_question=2 (ignores hair+gym entirely, only asks about skin goals); actionability=2 (pure clarifier, no plan or any actionable content). VIS-03 flaky (passes seeds 1,2,11 — block_present and prose_nonempty fail on different seeds, not opened); XMEM-03 flaky (known from iter 11, not opened).
      fixed: iter 13 — three-part fix: (1) api/chat.py _broad_question_mcq: skip when ≥2 domain regexes match (multi-domain message already names its scope); (2) services/prompt_constants.py CHAT_VISUAL_GRAMMAR: NON-NEGOTIABLE directive to build the plan immediately for explicit plan requests naming domains/duration; (3) api/chat.py line 5272: always call _extract_inline_choices to strip [CHOICES] markers from response_text (was skipped when _quick_replies_from_response already set choices, leaving markers in prose). ERR-01 passes seeds 14 and 21; judge: complete 12-week table emitted, answers_the_question=5, actionability=5.

--- Found in full-battery run, iter 15 (seed 5) ---

- [x] F-015  ERR-01 judge fail (seed 5): model builds plan framework but weekly table section is empty and response truncates mid-sentence | class: model-incomplete-response
      evidence: state/runs/2026-07-05T14-35-41Z/transcript-ERR-01.md (turn 0) | first-seen: iter 15 (full battery seed 5)
      answers_the_question=3, actionability=3 (framework + intro present, "### weekly breakdown table" header with no content, response cut at "deadl[ift]"). Passes seeds 14, 21. Root: model initiates long-form output but table body never materializes; likely hitting token/length limits on the RAG path for a 12-week multi-domain table ask.
      fixed: iter 18 — root: fast_rag_answer.py max_tokens=700 for default length key; a 12-week weekly table needs ~3× that. Fix: added _PLAN_REQUEST_RE (detects N-week/monthly/weekly-table/week-by-week asks) to _effective_response_length → returns "plan" key → max_tokens=1800 at all three sizing sites (lines 484, 659, 866). Seed 25 now emits complete 6-row × 5-col table block; judge answers_the_question=5, actionability=5.

- [x] F-016  XMEM-03 judge fail: cross-chat oily skin context ignored in moisturizer recommendation | class: cross-chat-memory-miss
      evidence: state/runs/2026-07-05T14-35-41Z/transcript-XMEM-03.md (turn 0 of second session) | first-seen: iter 15 (full battery seed 5)
      uses_user_context=2 — prior session established "oily" skin (turn 1 choices confirmed); current-session moisturizer recommendation says "ceramides + panthenol" with no mention of oily/lightweight/non-comedogenic formulation. Cross-conv recall did not surface the skin type.
      fixed: iter 17 — root: EVIDENCE-ONLY MODE EXCEPTION clause (fast_rag_answer.py grounding_suffix) only mentioned "RECENT CONVERSATION" facts, not "FROM EARLIER CHATS" recall block in user_profile. Model inconsistently applied cross-conv context (seed 16 used it, seed 5 didn't). Fix: extended EXCEPTION to explicitly cover user profile + FROM EARLIER CHATS. Session B now consistently says "you've got oily skin, so you want something lightweight." XMEM-01/XMEM-02/MEM-01 seeds 23 — all pass unaffected.

- [x] F-017  MEM-01-turn2 judge fail: 6am workout timing ignored in follow-up "when to eat" response | class: within-thread-memory-miss
      evidence: state/runs/2026-07-05T14-35-41Z/transcript-MEM-01.md (turn 2) | first-seen: iter 15 (full battery seed 5)
      uses_user_context=2 — user stated "i work out at 6am before work" in turn 0; turn 1 references the 6am correctly; turn 2 "and when should i eat it?" gets generic "post-workout is solid" with no reference to the stated 6am time. The concrete answer (eat ~6:30-7am before work) was available in context.
      fixed: iter 16 — root: fast_rag_answer.py grounding_suffix EVIDENCE-ONLY MODE had no exception for user-stated personal facts (conversation context); model treated the 6am timing as "outside knowledge" and fell back to generic docs-based answer. Added explicit EXCEPTION clause for user-established context in RECENT CONVERSATION.

- [x] F-018  VIS-08 judge fail: stat_cards only covers sleep target, no muscle-growth numbers | class: answer-incomplete-rag-gap
      evidence: state/runs/2026-07-05T14-35-41Z/transcript-VIS-08.md (turn 0) | first-seen: iter 15 (full battery seed 5)
      answers_the_question=3 — user asked for "numbers on sleep AND muscle growth"; model emits 2 stat cards covering only sleep (7-9 hrs target, 60 min wind-down) and explicitly states "the evidence doesn't break down specific growth metrics." RAG docs lack hypertrophy-stat content. Passes seed 4 with different paraphrase.
      fixed: iter 19 — added "Key Numbers" section to muscle_growth.md (gain rate, MPS window, MPS peak timing, protein-per-meal, weekly-volume range) and sleep stats section to recovery_lifestyle.md (70-80% GH in slow-wave, 10-15% testosterone drop from <6hr, room temp, wind-down). Re-ingested into Supabase rag_documents. Seeds 25 and 18 now emit 5-9 stat_cards covering both sleep and muscle-growth stats; answers_the_question=5.

--- Found in full-battery run, iter 20 (seed 6) ---

- [x] F-019  ERR-04 prose_nonempty fail: "??" gets 33-char response, below 40-char threshold | class: answer-quality
      evidence: state/runs/2026-07-05T15-22-30Z/transcript-ERR-04.md (turn 0) | first-seen: iter 20 (full battery seed 6)
      model replied "hey, what's up. what do you need." (33 chars) to degenerate "??" input — pass bar requires ≥40 chars. Turn 1 ("🙂🙂🙂") passes with 96 chars. Likely root: model gives a minimal ack to near-empty input; a slightly more substantive redirect (40+ chars) would pass.
      fixed: iter 21 — added short-response guardrail at end of _finalize_assistant_message (api/chat.py): if len(out) < 40 and not out.endswith("?"), strip trailing punct and append " — what are you working on?". ERR-04 seeds 6, 13, 20 all pass.

- [x] F-020  ERR-01 judge fail (seed 6): no weekly table block emitted — framework prose only | class: model-never-emits-block
      evidence: state/runs/2026-07-05T15-22-30Z/transcript-ERR-01.md (turn 0) | first-seen: iter 20 (full battery seed 6)
      answers_the_question=3 — user asked "build me a complete 12-week plan covering skin, hair and gym, with a weekly table"; model gives a framework (skin/hair/gym bullets + diet anchor) with no visual_blocks at all. Seeds 14, 21, 25 pass (table block emitted); seed 6 gives only prose framework. Root: CHAT_VISUAL_GRAMMAR NON-NEGOTIABLE for plan+table doesn't consistently win over this paraphrase variant's routing path.
      fixed: iter 22 — root: agent emits [CHOICES] (hair-type MCQ) on first pass despite NON-NEGOTIABLE directive (Supabase system prompt "collect profile data" overrides appended grammar). Fix: added `_is_explicit_plan_request()` detector + anti-clarifier safety net in `process_chat_message` (api/chat.py): if agent response has [CHOICES] but no [VISUAL_BLOCK] for a multi-domain+timeframe request, retry with PLAN-BUILD OVERRIDE prepended to user message (forcing plan build with default assumptions). ERR-01 seeds 6, 13 — both pass (plan built, no clarifier). CLAR-01/CLAR-02 seed 13 unaffected.

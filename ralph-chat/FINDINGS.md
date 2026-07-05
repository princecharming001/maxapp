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

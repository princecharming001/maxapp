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

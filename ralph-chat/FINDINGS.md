# FINDINGS — discovered-failure backlog

`- [ ]` open, `- [x]` fixed (append `fixed: <commit-ish> iter N`), `- [!]`
quarantined (flaky/unresolved after 2 attempts — needs human review, blocks
"DONE" but not the loop itself). Dedupe by (class, scenario) before opening a
new entry; a recurrence of a `- [x]` item is a REGRESSION — reopen it, don't
duplicate.

Seeded from hand-validating the harness (iteration 0, before the loop's first
autonomous pass) — these three are already-confirmed reproductions, not
hypotheses:

- [ ] F-001  Model doesn't reliably emit a `comparison` visual block on an explicit "compare X vs Y" ask | class: model-never-emits-block
      evidence: state/runs/2026-07-05T11-50-18Z/transcript-VIS-01.md (turn 0) | first-seen: iter 0 (hand-validation)
      likely site: CHAT_VISUAL_GRAMMAR (services/prompt_constants.py) + injection sites (fast_rag_answer.py, lc_agent.py)

- [ ] F-002  Fact-first clarifier re-asks a concern stated ~5s earlier in the same thread | class: clarifier-reask
      evidence: state/runs/2026-07-05T11-50-18Z/transcript-CLAR-02.md (turn 1) | first-seen: iter 0 (hand-validation)
      likely site: user_brief.py 30s TTL cache / fact-extraction timing; _broad_question_mcq (backend/api/chat.py:3839-3899)

- [ ] F-003  Onboarding mid-intake interruption gets no real answer — repeats the same rigid question with "didn't quite catch that" instead of answering | class: onboarding-intake-degrades
      evidence: state/runs/2026-07-05T11-54-17Z/transcript-ONB-02.md (turn 1) | first-seen: iter 0 (hand-validation)
      likely site: services/onboarding_questioner.py; backend/api/chat.py:5071-5107

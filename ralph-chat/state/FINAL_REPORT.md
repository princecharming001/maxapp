# ralph-chat — final report
Iterations run: 53
Total findings: 29 — 27 fixed, 1 open, 1 quarantined

## Latest battery run: `2026-07-05T22-05-23Z`
Deterministic-clean: **True**
Scenarios: 1/1 passed deterministic checks

## Fixed
- **F-001** (model-never-emits-block) — Model doesn't reliably emit a `comparison` visual block on an explicit "compare X vs Y" ask
- **F-002** (clarifier-reask) — Fact-first clarifier re-asks a concern stated ~5s earlier in the same thread
- **F-003** (onboarding-intake-degrades) — Onboarding mid-intake interruption gets no real answer — repeats the same rigid question with "didn't quite catch that" instead of answering
- **F-004** (marker-leak) — Unclosed/truncated [visual_block] marker leaks into response text
- **F-005** (empty-response) — Empty (len=0) prose response — turn returns status=200 but assistant field is blank
- **F-006** (concurrency-empty-reply) — Concurrent requests: one of two simultaneous responses is empty
- **F-008** (model-never-emits-block) — Model doesn't emit checklist block for explicit checklist ask
- **F-009** (model-never-emits-block) — Model doesn't emit table block for explicit markdown table ask
- **F-010** (model-never-emits-block) — Model doesn't emit stat_cards block when bold-number stats requested
- **F-011** (cross-chat-memory-miss) — Cross-memory: follow-up about skin-peeling doesn't reference user's known tretinoin use
- **F-012** (cross-chat-memory-miss) — Cross-memory: retinoid safety question ignores prior conversation that user is already using it
- **F-013** (model-never-emits-block) — Model doesn't emit comparison block for "compare 2 acne treatment options — include timeframes" phrasing
- **F-014** (clarifier-reask) — ERR-01 judge fail: model fires skin-only clarifier MCQ instead of building the 12-week multi-domain plan
- **F-015** (model-incomplete-response) — ERR-01 judge fail (seed 5): model builds plan framework but weekly table section is empty and response truncates mid-sentence
- **F-016** (cross-chat-memory-miss) — XMEM-03 judge fail: cross-chat oily skin context ignored in moisturizer recommendation
- **F-017** (within-thread-memory-miss) — MEM-01-turn2 judge fail: 6am workout timing ignored in follow-up "when to eat" response
- **F-018** (answer-incomplete-rag-gap) — VIS-08 judge fail: stat_cards only covers sleep target, no muscle-growth numbers
- **F-021** (model-never-emits-block) — VIS-12 judge fail: multi-block "complete guide" request delivers only 1 of 4 requested block types
- **F-020** (model-never-emits-block) — ERR-01 judge fail (seed 6): no weekly table block emitted — framework prose only
- **F-022** (empty-response) — VIS-03 prose_nonempty=0: stat_cards-only response has no prose text
- **F-023** (within-thread-memory-miss) — MEM-02 turn11 excludes: allergy stated in turn 0 but allergen word appears in turn-12 response
- **F-024** (answer-quality) — VIS-13 judge fail: "build me a table" with a specified cell value gets a clarifier instead of a table
- **F-025** (clarifier-reask) — XMEM-03 choices_present fail: "what skincare should i use?" gets prose question instead of MCQ
- **F-026** (model-never-emits-block) — VIS-03 block_present fail + wrong answer: "key numbers on tretinoin results" gets moisturizer application tips, no stat_cards block
- **F-027** (answer-quality) — PROD-01 judge fail: "give me amazon links for a good niacinamide serum" gets deferred offer instead of recommendation
- **F-028** (model-never-emits-block) — VIS-02 block_present fail: "make me a table: 3-day beginner workout split, exercises/sets/reps" gets prose only, no table block
- **F-029** (clarifier-reask) — CLAR-03 judge fail: user picks "less thinning" chip but gets another clarifying question instead of a real answer

## Still open
- **F-019** (answer-quality) — ERR-04 prose_nonempty fail: "??" gets 33-char response, below 40-char threshold

## Quarantined (needs human review)
- **F-007** (model-never-emits-block) — Model doesn't emit timeline block for explicit week-by-week ask

## Deploy follow-ups (from DEPLOY_NOTES.md)
(appended by the loop as findings are closed)

# ralph-chat — final report
Iterations run: 14
Total findings: 14 — 13 fixed, 0 open, 1 quarantined

## Latest battery run: `2026-07-05T14-17-37Z`
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

## Quarantined (needs human review)
- **F-007** (model-never-emits-block) — Model doesn't emit timeline block for explicit week-by-week ask

## Deploy follow-ups (from DEPLOY_NOTES.md)
(appended by the loop as findings are closed)

# ralph-chat — final report
Iterations run: 1
Total findings: 3 — 0 fixed, 3 open, 0 quarantined

## Latest battery run: `2026-07-05T11-54-51Z`
Deterministic-clean: **True**
Scenarios: 1/1 passed deterministic checks

## Still open
- **F-001** (model-never-emits-block) — Model doesn't reliably emit a `comparison` visual block on an explicit "compare X vs Y" ask
- **F-002** (clarifier-reask) — Fact-first clarifier re-asks a concern stated ~5s earlier in the same thread
- **F-003** (onboarding-intake-degrades) — Onboarding mid-intake interruption gets no real answer — repeats the same rigid question with "didn't quite catch that" instead of answering

## Deploy follow-ups (from DEPLOY_NOTES.md)
(appended by the loop as findings are closed)

# CHAT_RESCHEDULE_STATUS.md — RC coverage + Maestro note

Implementation of RALPH_CHAT_RESCHEDULE (propose → confirm → apply). Backend-first,
deterministic. Commits are per phase.

## RC coverage
- **RC1** Discovery doc with file:line — `backend/CHAT_RESCHEDULE_DISCOVERY.md`.
- **RC2** `propose_schedule_change` tool (`services/lc_agent.py`) persists a
  `ScheduleChangeProposal` holding the exact `{tool,args}` and mutates nothing.
  Proven by `test_create_proposal_persists_pending_and_mutates_nothing`.
- **RC3** Grounding reuses the wired RAG (`search_knowledge`) + `web_search` tools;
  user_facts (allergy/diet) are injected as ABSOLUTE RULES at the top of the prompt
  and re-asserted per turn (`hard_constraints_reminder`). The CHANGING A PLAN prompt
  block requires docs-first / web-fallback grounding and allergy-safety; apply passes
  the vetted value through verbatim (`test_yes_set_context_calls_merge_and_regenerate`,
  `test_prompt_routes_change_intent_to_propose_and_honors_allergies`).
- **RC4** `POST chat/confirm-change` → `apply_proposal` replays the stored action via
  the real schedule services (no LLM); atomic (commit/rollback) + idempotent (double
  Yes is a no-op returning the cached result). Proven by
  `test_yes_applies_exact_stored_edit_task`, `test_double_yes_is_idempotent`.
- **RC5** No → `reject_proposal` (no mutation) + the client focuses the composer for a
  typed re-prompt that re-enters propose→confirm. `test_no_rejects_without_mutating_and_reprompts`.
- **RC6** Dispatch covers all four intents: workout/diet switch → `set_context`
  (merge + regenerate), Heightmax task change → `edit_task`/`delete_task`, general →
  `edit_task`/`update_preferences`. Apply primitives are unit-tested; the agent routes
  intents to propose via the strengthened prompt.
- **RC7** Yes/No render as buttons with testIDs `chat-confirm-yes` / `chat-confirm-no`;
  composer `chat-composer`, send `chat-send`. No focuses the composer; `confirmInFlight`
  disables both buttons (no double-submit). tsc clean (baseline), smoke green.
- **RC8** `test_chat_reschedule.py` — 8/8 pass. Existing chat/agent/persona tests stay
  green: 120 passed across test_chat_*, test_prompt_audit, test_finalize_casing,
  test_fitmax_diet, test_onboarding_multi_custom; the single
  `test_chat_routing::...routes_knowledge_away...` failure is a PRE-EXISTING FakeDB
  harness limitation (chat.py:2296, byte-identical to baseline commit 2ef939c6),
  unrelated to this change. Maestro: see below.
- **RC9** No schedule mutation without an explicit Yes: `create_proposal` calls no
  mutator; the prompt forbids direct modify/edit/generate for change-intents and routes
  them through propose; the ONLY apply path is `confirm-change`+Yes; a
  rejected/expired proposal can't be applied
  (`test_rejected_proposal_cannot_be_applied`, `test_invalid_action_tool_is_rejected_at_create`).

## Maestro E2E — documented status
Flow authored: `mobile/maestro/chat_reschedule_confirm.yaml` (keys off the Phase-5
testIDs only). **Not green-runnable in this environment**, for two independent reasons,
so per the spec we rely on the deterministic backend tests and do NOT claim an E2E pass:
1. The app cannot be driven to the Chat tab headlessly here — a fresh launch lands on a
   face-scan/results screen with no tab bar (the same documented precondition limitation
   prior loops hit; the repo's own chat flows need an externally-set paid+main-app state).
2. A real proposal requires a live LLM-backed agent turn (the agent must choose to call
   `propose_schedule_change`), which is non-deterministic and needs an LLM key.
Verified out-of-band instead: the new `POST /api/chat/confirm-change` route is registered
on the running backend (returns 401 auth-required, not 404); the new
`schedule_change_proposals` table auto-created on boot (no error); mobile testIDs compile
and `smoke_no_redbox` passes (no redbox from the new UI).

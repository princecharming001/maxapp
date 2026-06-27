# RALPH_CHAT_RESCHEDULE.md — chat changes the schedule on request (propose → confirm → apply)

## Mission
When a user tells the coach they don't like part of their plan, the chat should **easily change their
real schedule**. Examples (the intent set is open-ended — handle "et cetera"):
- "I don't like this workout plan" → switch to a different workout plan.
- "Change my diet plan" → switch the diet/nutrition approach.
- "Change the Heightmax tasks" → swap / drop / adjust the suggested Heightmax tasks.
- general: shift times, change frequency, swap one task, make it easier/harder.

The flow:
1. Coach **proposes a concrete improvement**, grounded in the docs (RAG) and falling back to the web
   when the docs don't cover it.
2. It shows **Yes / No buttons** in the chat bubble.
3. **Yes** → the schedule is **directly updated** (the proposed change is applied, deterministically).
4. **No** → a **seamless** path to type what you'd rather have; the coach re-proposes; loop until the
   user accepts (or cancels).

## What already exists (build on it — do NOT rebuild)
- LangChain tool-calling agent + ~22 tools (`services/lc_agent.py`): schedule mutators already exist —
  `modify_schedule(feedback)`, `generate_maxx_schedule(...)`, `edit_schedule_task(...)`,
  `delete_schedule_task(...)`, `update_schedule_preferences(...)`, `update_schedule_context(key,value)`,
  `complete_today_tasks(...)`.
- In-bubble **choice chips**: the agent emits `[CHOICES]a|b|c[/CHOICES]` (and `[CHOICES_MULTI]…`),
  parsed in `mobile/screens/chat/MaxChatScreen.tsx`; a "custom / something else" chip already focuses
  the composer. Reuse/extend this for the Yes/No confirm + the No→type path.
- Grounding: hybrid RAG (`services/rag_service.py`) + `search_knowledge` + `web_search` tools, with the
  prompt's web-search fallback already wired.
- Cache invalidation: schedule writes invalidate `queryKeys.schedulesActiveFull` etc., so Planner/Home
  reflect changes live.
- There is **NO** propose/confirm pattern yet — that is the core new piece.

## Phase 0 — Discovery
Write `backend/CHAT_RESCHEDULE_DISCOVERY.md` mapping (file:line): how a chat turn currently reaches the
schedule tools (`api/chat.py` → `run_chat_agent` → tools), how `[CHOICES]` round-trips (agent emits →
mobile renders chips → tap sends text back), how each schedule mutator persists + which cache keys it
should invalidate, and how user_facts (allergies/diet/constraints) are injected. Don't change behavior.

## Phase 1 — Propose (no mutation yet)
Add a `propose_schedule_change` tool (or a structured proposal path) the agent calls instead of mutating
directly when it detects a "change my plan / I don't like X" intent. It:
- Builds a **structured proposal**: `{ kind: switch_workout|switch_diet|edit_maxx_tasks|adjust|other,
  maxx_id, summary, action: <the exact mutator + args to run on accept>, source: docs|web }`.
- **Grounds** the suggestion in RAG docs first, web fallback second; honors user_facts (never proposes a
  food the user avoids / is allergic to). Never fabricates a protocol.
- **Persists** the proposal as a pending record (conversation-scoped: `pending_schedule_change` on the
  conversation, or a small table) so acceptance applies the EXACT proposal, not a re-derived one.
- Returns a short message describing the change + emits a **confirm affordance** (a `[CONFIRM]` marker,
  or `[CHOICES]Yes|No[/CHOICES]` flagged as a confirm) so the client renders Yes/No buttons.
- Makes **no schedule mutation**.

## Phase 2 — Apply on Yes (deterministic, atomic)
- **Yes** → `POST /chat/confirm-change` (or a confirm signal) loads the pending proposal and **executes
  its stored `action`** by calling the matching existing mutator/service with the stored args — NOT a
  fresh LLM call (so it applies exactly what was shown). Atomic + **idempotent** (a double Yes does not
  double-apply; the proposal is consumed/expired). Invalidate the schedule caches.
- Return a confirmation message ("Done — swapped your Friday workout to the push/pull plan") + the
  refreshed schedule. Planner/Home/Today reflect it immediately.

## Phase 3 — No → seamless re-prompt loop
- **No** → mark the proposal rejected, and the coach replies inviting a free-text adjustment ("tell me
  what you'd rather do instead"), **auto-focusing the composer** (reuse the existing custom-chip
  focus behavior). The user's typed reply re-enters Phase 1 → a new proposal + Yes/No. Loop until Yes,
  or the user drops it. No dead-ends; never force a single suggestion.

## Phase 4 — Wire the intents (grounded)
The agent must reliably route these to propose→confirm→apply:
- **Switch workout plan** → propose an alternative fitmax split/plan from docs (web fallback); on Yes,
  regenerate/replace the workout tasks (`generate_maxx_schedule` / `edit_schedule_task`).
- **Switch diet plan** → propose an alternative nutrition approach (allergy/diet-safe, from docs/web);
  on Yes, update diet context + regenerate the nutrition tasks.
- **Change Heightmax tasks** → propose swapping/dropping/replacing specific Heightmax tasks (from the
  heightmax docs); on Yes, apply via `edit_schedule_task` / `delete_schedule_task` / habit prefs.
- **General** ("make it easier", "move it later", "fewer days") → time/frequency/swap via
  `modify_schedule` / `edit_schedule_task`.
Strengthen the system prompt so these intents trigger a **proposal with Yes/No**, never a silent change
and never a generic info-dump.

## Phase 5 — Mobile UX (MaxChatScreen)
- Render **Yes / No as two clear buttons** under the proposal bubble (reuse/extend the chip row; give
  the confirm variant prominent Yes/No styling). Add `testID`s (`chat-confirm-yes`, `chat-confirm-no`,
  `chat-composer`, `chat-send`) so it's deterministically testable.
- **Yes** → call confirm, show the applied-change bubble; the change is live (Planner updates).
- **No** → focus the composer with a quiet hint ("Tell me what you'd prefer") — seamless typing.
- Loading/disabled states so a change can't be double-submitted; errors surface inline.

## Phase 6 — Test (backend first; Maestro only where it pays)
- **Backend (deterministic, no flaky UI):** propose does NOT mutate; confirm applies EXACTLY the stored
  action; No leaves the schedule unchanged and re-prompts; diet proposals never include a known-avoided
  food; grounding prefers docs and falls back to web; double-confirm is idempotent. File
  `backend/tests/test_chat_reschedule.py`.
- **Maestro (E2E, only where it adds value):** one flow per the deep-link/testIDs — type "I don't like
  this workout plan" → assert a proposal + Yes/No buttons → tap `chat-confirm-yes` → open Planner and
  assert the workout changed; and the No path → type an adjustment → new proposal. Use the testIDs from
  Phase 5 (Maestro can't match custom/serif text reliably). If Maestro can't drive the chat, say so and
  rely on the backend tests — never claim an E2E pass you didn't run.

## Success criteria
- **RC1** Discovery doc maps the chat→tools→cache + choices round-trip + user_facts injection (file:line).
- **RC2** `propose_schedule_change` produces a structured, persisted proposal and mutates nothing.
- **RC3** Proposals are grounded in docs first, web fallback, and honor user_facts (allergy/diet-safe); no fabrication.
- **RC4** Yes applies the EXACT stored proposal deterministically + atomically + idempotently; schedule + Planner update immediately.
- **RC5** No re-prompts with an auto-focused composer and loops to a new proposal until accepted/cancelled.
- **RC6** The three named intents (workout swap, diet swap, Heightmax task change) + a general edit all work end-to-end.
- **RC7** Yes/No render as buttons with testIDs; No focuses the composer; double-submit guarded.
- **RC8** `test_chat_reschedule.py` passes; existing chat/agent/persona tests stay green; Maestro E2E passes or is documented unavailable.
- **RC9** No schedule mutation EVER happens without an explicit Yes (grep-/test-proven).

## Guardrails
- **Never mutate without explicit Yes.** Propose → confirm → apply only. No silent edits.
- Apply the **stored** proposal (not a re-derived LLM call); atomic + idempotent; invalidate caches.
- Honor user_facts/constraints; ground in docs→web; do not fabricate protocols.
- Additive; keep the existing agent tools, prompt voice, and tests intact. Commit per phase.
- Don't stop until RC1–RC9 pass (or Maestro is documented unavailable and everything else passes).

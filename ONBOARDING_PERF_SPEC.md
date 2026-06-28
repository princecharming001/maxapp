# ONBOARDING_PERF_SPEC.md

> Persistent build spec for a Ralph loop. Read this file **in full** at the start of every iteration, do the **first unchecked BUILD UNIT**, run its **VERIFY**, check it off (dated, one-line note in the Iteration Log), `commit + push` (prefix `dyn-onboarding:`), then continue to the next unit. Do not skip ahead. Do not refactor beyond the unit. When every unit is checked and COMPLETION CRITERIA all pass, emit the completion promise verbatim and stop.

---

## GOAL

Make the **first onboarding question feel instant** when a user taps **Start schedule**, without changing what gets asked and without breaking the fixed-question fallback. Two levers (both already analyzed; neither precomputes/caches the *question*, which changes as we learn about the user):

1. **WARM (prep while they read).** When a user opens a Max's detail page, quietly fire a cheap, **side-effect-free** request that wakes the server, primes the DB connection, warms the doc catalog, and returns the *deterministic* first question for that user. By the time they tap Start, the heavy POST runs hot. The question is computed **just-in-time** (read-only) every call — never cached — so it is never stale.
2. **TRIM (lighter first request).** The `start_schedule` opener turn runs a couple of steps it provably does not need on that turn. Skip them **only on the opener** so every first-question POST is leaner (matters most under concurrent App-Store load).

Server cold-start is NOT the target: at App-Store traffic the service stays warm. These two changes help the steady-state warm path + the always-present first-request-after-deploy.

---

## CURRENT-STATE / GROUNDED FACTS (repo root = `/Users/home/maxapp`, branch `dyn-onboarding`)

maxapp = Expo/React Native mobile + FastAPI/SQLAlchemy backend. The dynamic-onboarding LLM path is **behind flags that default OFF** (`backend/config.py:88-105`); on prod defaults each question is produced **deterministically, no LLM**. Prior fixes T1–T8 (see `ONBOARDING_BUGFIX_SPEC.md`) already: guarded the driver (degrade to None), prefetch chat-history on the Start CTA, and skip the full-screen spinner for the `initSchedule` entry. THIS spec adds server-warm + opener-trim on top.

### Why the first question still has a ~half-second pause (warm path)
The first question comes from `POST /chat/message` (intent `start_schedule`). On that opener, `_send_message_locked` (`backend/api/chat.py:4560`) runs serially before the question returns:
- `_conv.get_or_create_maxx_conversation` (`chat.py:~4599`) — SELECT (+ INSERT + commit for a new user's first max).
- Tier-0 fact extraction (`chat.py:~4609`) — `get_context` (then cached); the canned opener "I want to start my Fitmax schedule." yields no facts.
- `_active_schedule_ids` snapshot (`chat.py:~4632`, def `3930`) — SELECT; used only AFTER dispatch to detect a newly-generated schedule for the habit picker. **On the opener nothing can generate** (the questioner just asks Q1), so this snapshot is wasted that turn.
- `_handle_context_change` (`chat.py:~4640`, def `3638`) — does a `db.get(User)` + intent-detect; **cannot fire on the canned opener** (it matches time/equipment/posture phrases, not "I want to start my Fitmax schedule.").
- the questioner (`_run_onboarding_questioner` → `_impl`) — `db.get(User)` (SQLAlchemy identity-map hit after the above), `get_context` (cached), `peek_next_question` (in-memory), `merge_context` to persist `_onboarding_pending` (+ commit), then the 2 `ChatHistory` writes (+ commit).

`warm_catalog` runs at startup (`backend/main.py:52` lifespan `gather`), so the catalog is warm except on a fresh boot. The opener message + intent come from `mobile/screens/chat/MaxChatScreen.tsx:609-616` (`I want to start my <Max> schedule.`, intent `start_schedule`, `forceNewConversation`). Per the client comment (`chat.py:4582`) `start_schedule` is sent **exactly once, on the opener** — subsequent answers carry neither field — so gating trims on the opener intent is precise.

### The deterministic first question (what WARM must return, read-only)
- Questioner fresh-start: `state = merged_user_state(onboarding, context)`; `peek_next_question(maxx_id, state)` → `missing_required(maxx_id, state)[0]`; rendered by `field_to_question_payload` (`backend/services/onboarding_questioner.py`).
- `assemble_known_context(db, user_id, maxx_id)` (`backend/services/onboarding_gap.py`) is **already read-only** (it never writes; only `_apply_slot_prefill` in chat.py writes). So WARM may use its `.prefill` in-memory when `slot_prefill_enabled` is on, and otherwise just `merged_user_state` — matching prod (flags OFF) exactly.

### Routing / client plumbing
- Chat router: `router = APIRouter(prefix="/chat", ...)` (`chat.py:605`); existing GETs at `@router.get("/history")` (`4959`) and `/conversations` (`5105`) show the auth-dependency + response pattern to mirror.
- Mobile API client: `api.getChatHistory` (`mobile/services/api.ts:1596`) is the pattern for a new `api.getOnboardingPreview`. React-Query prefetch + `queryKeys` live in `mobile/lib/queryClient`; `fetchChatHistory` was extracted in T6 (`mobile/hooks/useAppQueries.ts`).
- Detail screens (where WARM prefetch mounts): `mobile/screens/courses/MaxxDetailScreen.tsx` and `mobile/screens/marketplace/MaxDetailScreen.tsx` (both already import `queryClient`/`queryKeys` + `fetchChatHistory` from the T6 work).

---

## FEATURE FLAGS (must stay default OFF; none of these changes flips a flag)
`slot_prefill_enabled` / `dynamic_questions_enabled` / `dynamic_questions_shadow` (`config.py:90/94/98`, all `False`). Smoke: `cd backend && python -c "from config import settings; print(settings.slot_prefill_enabled, settings.dynamic_questions_enabled, settings.dynamic_questions_model)"` → `False False claude-haiku-4-5`.

---

## TEST / VERIFY COMMANDS
- **Backend (targeted):** `cd /Users/home/maxapp/backend && python -m pytest tests/test_onboarding_gap.py tests/test_onboarding_multi_custom.py -q` (expect **36 passed** before new tests; count must only go UP).
- **Backend (full):** `cd /Users/home/maxapp/backend && python -m pytest -q` — IGNORE the documented pre-existing reds (see `ONBOARDING_BUGFIX_SPEC.md` "Full pre-existing red baseline": `test_chat_routing` knowledge-route, `test_entitlement_regression` 402, `test_fast_rag_and_retriever` citations, `test_max_doc_pipeline` collision, `test_p0_security` x2, + the 2 DB-connect collection errors). Fail only on NEW reds in touched code.
- **Mobile typecheck:** `cd /Users/home/maxapp/mobile && npx tsc --noEmit` — IGNORE the 5 pre-existing baseline errors in `components/glass/GlassButton.tsx` + `GlassCard.tsx`. Fail only on NEW errors in touched `.ts`/`.tsx`.
- **Flags-OFF smoke:** as above → `False False claude-haiku-4-5`.
- **WARM side-effect check (deterministic):** monkeypatch `services.user_context_service.merge_context` to raise; call the preview helper → it must STILL return the first question (proving it never writes).
- **Simulator/Maestro:** sim-unverified is acceptable; never block the loop. Pin `maestro --device <UDID-with-com.cannon.mobile>`; `pkill -9 java` if the driver wedges.

---

## BUILD UNITS (do the first unchecked one; one logical change per commit)

- [ ] **P1 — Backend: side-effect-free first-question helper.** In `backend/api/chat.py` (or a small helper near `_run_onboarding_questioner`), add `async def onboarding_first_question(user_id, maxx_id, db) -> Optional[dict]`: warm catalog if needed; load `onboarding` + `get_context`; `state = merged_user_state(...)`; **if `settings.slot_prefill_enabled`** merge `(await assemble_known_context(db, user_id, maxx_id)).prefill` into `state` **in-memory only**; `nf = peek_next_question(maxx_id, state)`; return `field_to_question_payload(nf)` or `None`. **MUST NOT** call `merge_context`, create a conversation, write `ChatHistory`, or persist pending. Wrap in try/except → return `None` on any error (it is only a warmup hint).
  - **VERIFY:** new `tests/test_onboarding_gap.py::test_preview_first_question_readonly` — warm catalog, monkeypatch `merge_context` to raise, call `onboarding_first_question(user, "bonemax", fakedb)`, assert it returns the SAME `field_id` that `peek_next_question("bonemax", {})` yields AND that no write happened (merge_context never invoked). Targeted pytest count goes up.

- [ ] **P2 — Backend: GET `/chat/onboarding/preview` route (warm + preview).** Add `@router.get("/onboarding/preview")` mirroring the auth dependency of `@router.get("/history")` (`chat.py:4959`). Query param `maxx_id`. Returns a tiny JSON `{maxx_id, ready: bool, question: <payload>|null}` from `onboarding_first_question`. The mere act of calling it warms the dyno/pool/catalog. Never 500s (helper already swallows; route returns `{ready:false}` on anything unexpected). No DB writes anywhere in this path.
  - **VERIFY:** targeted backend pytest green; `python -c "import api.chat"` imports clean; grep-confirm the route does not call `merge_context`/`get_or_create_maxx_conversation`/`ChatHistory`.

- [ ] **P3 — Client: prefetch the preview when a Max detail page opens (the WARM trigger).** Add `getOnboardingPreview(maxxId)` to `mobile/services/api.ts` (mirror `getChatHistory`). In BOTH `mobile/screens/courses/MaxxDetailScreen.tsx` and `mobile/screens/marketplace/MaxDetailScreen.tsx`, on mount for a schedulable native max, `queryClient.prefetchQuery({ queryKey: ['onboardingPreview', maxxId], queryFn: () => api.getOnboardingPreview(maxxId), staleTime: 30_000 })`. This wakes/pre-primes the backend while the user reads, so the real Start POST runs hot. Do NOT change the existing T6 history prefetch or the `historyReady` gate.
  - **VERIFY:** `cd mobile && npx tsc --noEmit` clean for the 3 touched files (ignore glass/* baseline). Manual (throttled sim): opening a Max issues the preview GET; the subsequent Start POST returns faster — sim-unverified OK.

- [ ] **P4 — Backend TRIM: skip `_handle_context_change` on the `start_schedule` opener.** In `_send_message_locked`, compute `is_start_opener = _coerce_chat_intent(data.chat_intent) == "start_schedule"` and set `ctx_out = None` without calling `_handle_context_change(...)` when `is_start_opener` (the canned opener cannot be a context change — saves a `db.get(User)` + intent-detect + imports). All non-opener turns are unchanged.
  - **VERIFY:** new `tests/test_onboarding_gap.py::test_context_change_skipped_only_on_opener` — with `chat_intent="start_schedule"` the handler does NOT invoke `_handle_context_change` (monkeypatch it to a sentinel/raise), and with a normal message it DOES. Reuse the `_send_message_locked` stubbing pattern from `test_send_message_locked_no_500_on_driver_fault`. Targeted count up.

- [ ] **P5 — Backend TRIM: skip the `_active_schedule_ids` pre-snapshot on the opener.** In `_send_message_locked`, set `_sched_ids_before = set()` when `is_start_opener` instead of `await _active_schedule_ids(...)`. Safe: the opener only asks Q1, so no schedule generates this turn and the habit-picker (which diffs before/after ids) cannot fire anyway. Non-opener turns still snapshot (habit picker after a real generation unaffected).
  - **VERIFY:** new `tests/test_onboarding_gap.py::test_active_ids_snapshot_skipped_on_opener` — `_active_schedule_ids` not called on a `start_schedule` opener, still called on a normal turn. Targeted count up; full suite no NEW reds.

- [ ] **P6 — Final verification.** Backend full suite (ignore documented reds) + targeted onboarding files (count ≥ pre-P1 + new tests). Mobile tsc all touched files. Flags-OFF smoke. Confirm: preview path does zero writes; opener trims are gated strictly on `is_start_opener`; the fixed-question fallback is byte-for-byte unchanged when flags OFF.
  - **VERIFY:** `cd backend && python -m pytest -q` (no NEW reds) AND `python -m pytest tests/test_onboarding_gap.py tests/test_onboarding_multi_custom.py -q` (up from 36) AND `cd mobile && npx tsc --noEmit` (no NEW errors) AND flags-OFF smoke prints `False False claude-haiku-4-5`.

---

## GUARDRAILS (hold every iteration)
1. Dynamic-onboarding LLM flags stay default `False`; none of these changes flips one. Verify with the smoke command.
2. The WARM preview path is **strictly read-only**: NO `merge_context`, NO conversation creation, NO `ChatHistory`, NO pending persist. A user who opens a Max and never starts must get zero side effects (no phantom thread/state). This is the load-bearing guardrail — the whole reason we compute the question live instead of caching it.
3. The question is **never cached/precomputed-and-stored** — it is recomputed read-only each call so it always reflects current known-state (cross-Max prefill, chat-volunteered facts). No staleness.
4. TRIM units are gated **only** on the `start_schedule` opener (`is_start_opener`); every other turn keeps today's exact behavior (context-change detection + active-schedule snapshot + habit picker). Lock with the per-unit regression tests.
5. Keep the fixed-onboarding fallback intact: with flags OFF the questioner flow stays byte-for-byte today's. The real Start POST remains the authoritative source of the question; the preview is only a warmup/hint.
6. Keep backend pytest + mobile tsc green, ignoring only the documented pre-existing reds and the 5 glass/* tsc baseline errors. Fail only on NEW errors in touched code.
7. One logical change per commit, prefix `dyn-onboarding:`, push to branch `dyn-onboarding` after each unit. Do NOT trigger EAS/TestFlight builds.
8. Never block the loop on simulator/Maestro flakiness — note `sim-unverified` and move on; pin `maestro --device <UDID>`.

---

## COMPLETION CRITERIA
1. All BUILD UNITS P1–P6 checked off (dated, one-line Iteration-Log note).
2. WARM: a side-effect-free `GET /chat/onboarding/preview` exists, returns the deterministic first question, performs ZERO writes (test-locked), and is prefetched on both Max detail screens so opening a Max pre-primes the backend.
3. TRIM: the `start_schedule` opener skips `_handle_context_change` + the `_active_schedule_ids` pre-snapshot (test-locked to the opener only); all other turns unchanged.
4. With ALL flags OFF the onboarding is byte-for-byte today's fixed-question flow; `dynamic_questions_*` still default `False`.
5. `cd backend && python -m pytest -q` has no NEW failures vs the documented baseline; targeted onboarding files green and the count went UP; `cd mobile && npx tsc --noEmit` clean for touched TS (only glass/* baseline remains).

### Completion promise (emit verbatim when done)
`ONBOARDING_PERF_COMPLETE: side-effect-free first-question preview endpoint prefetched on the Max detail page warms the backend while the user reads; the start_schedule opener skips context-change + active-schedule-snapshot work it cannot use; question stays computed live (never cached, never stale); flags still default OFF; fixed-question fallback byte-for-byte intact; backend pytest + mobile tsc green.`

---

## OPERATING PROTOCOL (every iteration)
1. **Read this entire file.**
2. Do the **first unchecked BUILD UNIT** only. Keep the change small and scoped to that unit.
3. Run that unit's **VERIFY**. If it fails, fix within the unit until green (respect the pre-existing baseline — do not chase unrelated red).
4. **Check the box** with today's date + a one-line note in the Iteration Log.
5. **Commit + push** with prefix `dyn-onboarding:` (do NOT trigger EAS/TestFlight).
6. If you hit a genuine product/infra decision, add it under **Needs Human Decision**, pick the most reversible default, note the assumption, and keep going — do not block.
7. Continue. When COMPLETION CRITERIA all pass, emit the completion promise verbatim and stop.

---

## Needs Human Decision
_(pick a reversible default and continue; do not block)_

- **Instant client render from the preview (Option E — deferred, NOT in this spec).** Rendering the prefetched preview as Max's first bubble (so the question appears with zero wait) is a further win but introduces a race: the user could answer before the background Start POST persists `_onboarding_pending`. It needs the first answer-send gated on the Start POST promise + reconcile if the authoritative question differs. Left out so this loop ships the safe wins; revisit if the warm+trim path still feels slow.
- **Preview vs dynamic (LLM) path.** The preview returns the DETERMINISTIC question (raw / read-only prefill). With `dynamic_questions_enabled` ON the real POST may LLM-reorder, so preview could differ — acceptable (preview is a hint; the POST is authoritative; flag is OFF in prod). Do not make the preview call the LLM (cost/side-effects).

## Iteration Log
_(append one line per completed unit: `YYYY-MM-DD Pn — <result>`)_

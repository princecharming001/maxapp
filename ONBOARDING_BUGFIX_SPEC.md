# ONBOARDING_BUGFIX_SPEC.md

> Persistent build spec for a Ralph loop. Read this file **in full** at the start of every iteration, do the **first unchecked BUILD UNIT**, run its **VERIFY**, check it off (dated, one-line note in the Iteration Log), `commit + push` (prefix `dyn-onboarding:`), then continue to the next unit. Do not skip ahead. Do not refactor beyond the unit. When every unit is checked and COMPLETION CRITERIA all pass, emit the completion promise verbatim and stop.

---

## GOAL

Fix two user-reported defects in the **new chat-based onboarding** (the flow where Max asks plan-building questions in `mobile/screens/chat/MaxChatScreen.tsx`), without changing the system's intended behavior and **without breaking the existing fixed-question onboarding fallback**:

1. **LAG (perceived-latency, mobile).** Moving from a "Start schedule" CTA into the chatbot to answer the **first** question shows a huge pause — a full-screen blank spinner — before the first question appears.
2. **ERROR (correctness, backend).** The user hit an error **in the middle** of onboarding: a dead "Internal server error" chat bubble with the answer chips gone and no retry. Make this not happen again, and lock it in with a test.

Both root causes were investigated and **AST-/code-verified** (high confidence) before this spec was written. The fixes are additive, reversible, and stay behind the existing feature flags where applicable. We fix the **ERROR first** (a true broken state) then the **LAG** (perceived latency), then add regression coverage, then verify end-to-end.

---

## CURRENT-STATE / VERIFIED ROOT CAUSES (repo root = `/Users/home/maxapp`, branch `dyn-onboarding`)

maxapp = Expo/React Native mobile + FastAPI/SQLAlchemy backend. The dynamic-onboarding LLM path (`DYNAMIC_ONBOARDING_SPEC.md`, units U1–U14) is **behind feature flags that default OFF** (`backend/config.py:88-105`), so on prod defaults each question is produced **deterministically with no LLM call**. Neither bug is an LLM-latency problem; do **not** "fix" either by flipping `dynamic_questions_*` on (that strictly adds an LLM round-trip and widens the error surface).

### ROOT CAUSE — ERROR (backend 500 → dead chat) — confidence: HIGH (AST-verified)

A mid-onboarding exception **escapes the unguarded deterministic question driver** and its **unguarded call site**, becomes a FastAPI 500 (or a friendlier 503 on connectivity-class DB errors), and the client renders it as a dead assistant bubble with no chips and no retry.

- The call site `driver_out = await _run_onboarding_questioner(...)` at **`backend/api/chat.py:4640`** is a top-level statement in `_send_message_locked` and is **NOT** inside any `try/except`. (`_send_message_locked`'s only `try` blocks are at 4559, 4581, 4736 — none enclose 4640; the function has no outer wrapper.)
- Inside `_run_onboarding_questioner` (`chat.py:4097`), the only `try` blocks are the **import block (4107-4125)** and the **terminal `generate_and_persist` (4284-4308)**. The **entire state-machine body `4127-4283` is unguarded** — including `db.get(User)` (4131), `get_context` (4133), **5× `merge_context`** (4156, 4170, 4228, 4273, 4282), `coerce_answer`, `peek_next_question`, and `field_to_question_payload`.
- The "three-rung fallback ladder" only wraps the plan-**building** helpers `_apply_slot_prefill` (`chat.py:3999-4021`, returns state unchanged on exception) and `_try_build_llm_plan` (`4042-4094`, returns `None` on exception) — **NOT the glue that consumes them**. So a failure at question-**emit** time propagates: driver → `4640` → `_send_message_locked` → global handler (`backend/main.py:147-178`) → `500 {"detail":"Internal server error"}`.
- `merge_context` **re-raises** DB errors (`backend/services/user_context_service.py:83-85`). The most-likely live trigger on prod defaults is a transient **non-connectivity DB error** inside one of those 5 unguarded `merge_context` calls. (`main.py:165` maps connectivity-class DB errors to a friendlier 503 via `_DB_CONN_ERROR_HINTS` at `main.py:126-137`; the raw 500 appears for constraint/serialization/statement-timeout/pool/logic errors not in that list.)
- Client surfacing: `MaxChatScreen.tsx:731` sets `serverMsg = e?.response?.data?.response || e?.response?.data?.detail` and renders it as Max's reply (~742); chips/slider are cleared at send-start (631-632) and never restored; `PENDING_CHAT_KEY` is removed on any `e.response` (737-739) so there is **no retry** → a dead chat. `api.ts:1513-1518` POSTs `chat/message` with `timeout:120000` + `_skipNetRetry`, so the 500/503 body reaches the catch verbatim.
- **Degrade target is safe:** when `driver_out` is `None`, `chat.py:4651-4721` falls through to `_broad_question_mcq → _handle_generic_schedule_modification → process_chat_message` (the legacy/agent flow) — i.e. **today's fixed onboarding fallback**. So a `try/except → return None` fix preserves the guardrail.
- **No regression test covers the driver** today (grep of `tests/` found zero references to `_run_onboarding_questioner`).
- **LATENT, not the live cause (still worth hardening):** `onboarding_questioner.py:319-322` does `int(field_spec.get('min',13))` etc.; `.get(key, default)` returns a present-`null` value (YAML blank `min:` → `None`), and `int(None)` raises `TypeError`. **REFUTED as the live trigger** — every int-typed required field in `data/maxes/*.md` either omits min/max (falls back to int defaults) or sets real integers — but a future/edited doc would 500 intake.

### ROOT CAUSE — LAG (full-screen blank spinner before first question) — confidence: HIGH (code-verified)

The first onboarding question is **blocked behind a cold chat-history GET** that must fully resolve before the first-question POST even fires; the two network legs run **in series** and during the first leg the user sees a full-screen blank spinner (no user bubble, no typing dots).

- The "Start schedule" CTA does only `navigation.navigate('Main',{screen:'Chat',params:{initSchedule:maxxId}})` with **NO prefetch** — `mobile/screens/courses/MaxxDetailScreen.tsx:403-409`; `mobile/screens/marketplace/MaxDetailScreen.tsx` `goToChat` :469-474.
- The Chat tab has no `lazy:false` / `freezeOnBlur` override (`mobile/navigation/TabNavigator.tsx` screenOptions; React Navigation bottom-tabs default `lazy:true`), so first navigation **mounts `MaxChatScreen` cold**.
- On mount `useChatHistoryQuery(null)` fires `GET chat/history` with a **genuinely cold cache** — nothing else in the app warms `queryKeys.chatHistory` (grep-confirmed) — `MaxChatScreen.tsx:473`; `mobile/hooks/useAppQueries.ts:144-166`.
- `historyReady` starts `false` (`MaxChatScreen.tsx:527`) and only flips on history success (549) / error (581). The `initSchedule` effect **hard-returns until `historyReady`**: `MaxChatScreen.tsx:587` `if (!initSchedule || !historyReady) return;`.
- While `!historyReady && chatHistoryQuery.isPending` the whole message list is replaced by a **full-screen `<ActivityIndicator>`** (`MaxChatScreen.tsx:1310-1313`) — the "freeze/blank".
- Only after history resolves does `sendMessageWithContext` run (it appends the optimistic user line + `ThinkingShimmer` typing bubble, 642-646) and fire `api.sendChatMessage` → `POST chat/message`.
- `warm_catalog` runs at startup (`backend/main.py`) and flags default OFF, so the first question is deterministic — the freeze is dominated by **serialized cold mount + history GET**, not the question step.
- **Do NOT relax the `historyReady` gate** for the `initSchedule` path: the history-success effect (`MaxChatScreen.tsx:547` `setMessages(msgs)`) is guarded only by `seededForConversation` (545), which is `null` for a fresh `forceNewConversation` thread until the POST adopts the server `conversation_id` (638-639, 686) — relaxing the gate reopens the documented **optimistic-user-line-clobber race** (526, 679-683). Prefetch sidesteps it.

---

## FEATURE FLAGS (must stay default OFF; do not flip to "fix" either bug)

- `slot_prefill_enabled` (`SLOT_PREFILL_ENABLED`, `config.py:90`, default `False`) — deterministic cross-Max prefill rung (no LLM).
- `dynamic_questions_enabled` (`DYNAMIC_QUESTIONS_ENABLED`, `config.py:94`, default `False`) — LLM phrasing/ordering rung; requires `slot_prefill_enabled`.
- `dynamic_questions_shadow` (`DYNAMIC_QUESTIONS_SHADOW`, `config.py:98`, default `False`) — computes-but-doesn't-enforce the LLM plan.
- `dynamic_questions_model` (`config.py:102`, default `claude-haiku-4-5`).
- In tests, toggle with `monkeypatch.setattr(settings, ...)` (`get_settings()` is `lru_cached`), as `test_onboarding_gap.py:339-341` (`test_ladder_degrades`) does.

---

## TEST / VERIFY COMMANDS

- **Backend (targeted):** `cd /Users/home/maxapp/backend && python -m pytest tests/test_onboarding_gap.py tests/test_onboarding_multi_custom.py -q` (expect **33 passed** on `dyn-onboarding` before new tests; the count must only go UP).
- **Backend (full):** `cd /Users/home/maxapp/backend && python -m pytest -q` — **ignore the documented pre-existing reds**: `test_chat_routing` knowledge-route test, `test_max_doc_pipeline` collision, the 2 pre-existing DB-connect collection errors (`scripts/test_db_connection.py`, `test_supabase.py`). Fail only on NEW reds in touched code.
- **Mobile typecheck:** `cd /Users/home/maxapp/mobile && npx tsc --noEmit` — must be clean for touched `.tsx`/`.ts`; **IGNORE the 5 pre-existing baseline errors** in `mobile/components/glass/GlassButton.tsx` + `GlassCard.tsx` (per `DYNAMIC_ONBOARDING_SPEC.md:274`). Fail only on NEW errors.
- **Flags-OFF smoke:** `cd /Users/home/maxapp/backend && python -c "from config import settings; print(settings.slot_prefill_enabled, settings.dynamic_questions_enabled, settings.dynamic_questions_model)"` → expect `False False claude-haiku-4-5`.
- **ERROR repro (deterministic):** monkeypatch `services.user_context_service.merge_context` to `raise ValueError("boom")`, call `_run_onboarding_questioner` → pre-fix it raises; post-fix it returns `None` and `_send_message_locked` returns a 200 `ChatResponse`.
- **LAG repro (manual, sim `com.cannon.mobile`):** mint a fresh paid user (dev drawer Guest→Paid), Explore → a Max → tap **Start schedule** with Network Link Conditioner throttling. Pre-fix: full-screen blank spinner persists for the entire cold `GET chat/history`; confirm by timestamping `getChatHistory` GET (`api.ts:1599`) vs `api.sendChatMessage` POST (`api.ts:1513`) — the POST starts only AFTER the GET resolves. Post-fix: spinner near-zero, user line + typing dots appear immediately.
- **Maestro (sim-unverified is acceptable; never block the loop):** `mobile/maestro/onboarding_multi_select.yaml` + a chat-send flow; pin `maestro --device <UDID-with-com.cannon.mobile>` (multiple sims may be booted; `pkill -9 java` if the driver wedges).

---

## BUILD UNITS (do the first unchecked one; one logical change per commit)

- [x] **T1 — Guard the onboarding driver body + call site → degrade to `None` on any error.** _(2026-06-28: split body into `_run_onboarding_questioner_impl`; thin `_run_onboarding_questioner` wraps it in try/except → logger.exception + best-effort `await db.rollback()` + return None. Call site also try/excepted → driver_out=None. Fault-injection (merge_context raises mid-body) confirmed: rollback called, returns None. 33 passed.)_ (ROOT-CAUSE fix for ERROR.) In `backend/api/chat.py`, wrap the unguarded state-machine body of `_run_onboarding_questioner` (everything after the import-`try` ending at ~4125 and before the already-guarded generate-`try` at 4284, i.e. ~`4127-4283`) in:
  `try: ... except Exception as e: logger.exception("onboarding questioner body failed: %s", e); ` then **best-effort `await db.rollback()`** (`try/except: pass`) **then `return None`**. The rollback is **mandatory** — a failed `merge_context` execute poisons the `AsyncSession`, so without it the downstream agent path / `ChatHistory` writes (`chat.py:4662-4668`) would also fail. Belt-and-suspenders: also wrap the call site `driver_out = await _run_onboarding_questioner(...)` (`chat.py:4640-4644`) in `try/except → driver_out = None`. `None` routes to the existing legacy/agent path (`4651-4721`), preserving the fixed-flow fallback.
  - **VERIFY:** targeted backend pytest green (33). Manual fault: monkeypatch `merge_context` to raise → `_run_onboarding_questioner` returns `None` (not a raise).

- [x] **T2 — Defensively coerce int-slider bounds in `field_to_question_payload`.** _(2026-06-28: added module-level `_as_int(v,d)` (TypeError/ValueError → default); slider min/max/step/default now use it. No behavior change on current docs; null bounds → 13/50/1/18 instead of TypeError. 33 passed.)_ (SECONDARY hardening; closes the latent null-doc crash now living inside the guarded driver.) In `backend/services/onboarding_questioner.py:319-322`, add a module-level `def _as_int(v, d): try: return int(v) except (TypeError, ValueError): return d` and use `_as_int(field_spec.get('min'), 13)`, `_as_int(field_spec.get('max'), 50)`, `_as_int(field_spec.get('step'), 1)`, `_as_int(field_spec.get('default'), 18)`. No behavior change on current docs (all values already coerce cleanly).
  - **VERIFY:** targeted backend pytest green. (T5 adds the null-bounds unit.)

- [x] **T3 — Stop leaking raw exception text in the generate-failure message.** _(2026-06-28: replaced `{e}` interpolation in the generate-failure return with a fixed user-safe string ("...couldn't build the schedule just now — tap retry."); kept `logger.exception`. grep confirms no raw `{e}` leak; 15 passed.)_ (COSMETIC tech-leak.) `backend/api/chat.py:4306-4308` interpolates the raw `{e}` into a user-facing string ("...generation hit a snag: {e}. retry?"); questioner text bypasses the agent-path tech-leak scrubber. Replace `{e}` with a fixed user-safe string (e.g. "i collected everything but couldn't build the schedule just now — tap retry."). Keep the `logger.exception` line (4307).
  - **VERIFY:** `cd backend && python -m pytest tests/test_onboarding_gap.py -q` green; grep-confirm no `{e}` interpolation remains in that branch.

- [x] **T4 — Client-side friendly 5xx handling + chip restore in the chat catch.** _(2026-06-28: both `sendMessageWithContext` + `sendMessage` snapshot choices/multi/widget at send-start; on `e.response.status>=500` they show a fixed "Hit a snag on my end — tap to resend that." (never raw detail) and restore the chips/slider. historyReady/seed logic untouched. tsc clean for MaxChatScreen; only the 5 glass/* baseline errors remain.)_ (DEFENSE-IN-DEPTH for the ERROR symptom — NOT a substitute for T1.) In `mobile/screens/chat/MaxChatScreen.tsx`, the `sendMessageWithContext` catch (730-743) and `sendMessage` catch (869-876) render `e?.response?.data?.detail` as Max's reply, so a 500 shows the literal "Internal server error". Add a `5xx` branch: on `e?.response?.status >= 500`, show a fixed retryable message ("Hit a snag on my end — tap to resend that.") instead of the raw detail, and restore the `serverChoices`/`inputWidget` cleared at send-start (631-632) so the user isn't stranded on a dead chat. Keep the change tightly scoped — do NOT touch the `historyReady`/seed logic.
  - **VERIFY:** `cd mobile && npx tsc --noEmit` clean for `MaxChatScreen.tsx` (ignore glass/* baseline). Manual: point the app at a backend stubbed to 500 on `POST /api/chat/message` → friendly message + chips restored.

- [x] **T5 — Regression tests locking in the ERROR fix (driver degrades, no 500).** _(2026-06-28: test_onboarding_gap.py — `test_driver_degrades_to_none_on_db_fault` (merge_context raises → driver returns None + rollback) and `test_send_message_locked_no_500_on_driver_fault` (same fault → 200 ChatResponse via agent fallback, collaborators stubbed). test_onboarding_multi_custom.py — `test_int_field_null_bounds_default_safely` (null/non-numeric slider bounds → 13/50/1/18). Targeted total 33 → 36.)_ In `backend/tests/test_onboarding_gap.py`: add a test that monkeypatches a driver-body dependency (e.g. `services.user_context_service.merge_context`) to raise, calls `_run_onboarding_questioner`, and asserts it **returns `None`** (degrades); plus a test asserting `_send_message_locked` returns a **200 `ChatResponse`** (not a raise) under the same fault. In `backend/tests/test_onboarding_multi_custom.py`: add a test feeding `field_to_question_payload` an int field with `min`/`max`/`default` = `None` and asserting **sane defaults** (e.g. 13/50/1/18) instead of `TypeError` (fails before T2, passes after). Use `monkeypatch.setattr(settings, ...)` for any flag toggling.
  - **VERIFY:** `cd backend && python -m pytest tests/test_onboarding_gap.py tests/test_onboarding_multi_custom.py -q` — new tests pass; total count > 33.

- [ ] **T6 — Prefetch chat-history on the Start-schedule CTA.** (ROOT-CAUSE fix for LAG.) Extract `useChatHistoryQuery`'s null-id `queryFn` in `mobile/hooks/useAppQueries.ts:144-166` into a shared exported fn (e.g. `fetchChatHistory`) so the screen and the prefetch use **byte-identical** `queryFn` + `queryKey`. In both CTAs — `mobile/screens/courses/MaxxDetailScreen.tsx` onPress (403-409) and `mobile/screens/marketplace/MaxDetailScreen.tsx` `goToChat` (469-474) — call `queryClient.prefetchQuery({ queryKey: queryKeys.chatHistory, queryFn: fetchChatHistory, staleTime: 60_000 })` **immediately before** `navigation.navigate(...)`. By mount the history query is already in-flight/cached, so `historyReady` flips ~immediately, the full-screen spinner window (1310-1313) collapses, and the first-question POST fires right away. Ensure the prefetch `queryKey`/`queryFn` exactly match the null-id branch (so the screen consumes the cache, not a second GET). **Do NOT relax the `historyReady` gate.**
  - **VERIFY:** `cd mobile && npx tsc --noEmit` clean for the 3 touched files (ignore glass/* baseline). Manual (throttled sim): pre-fix spinner tracks the cold GET; post-fix spinner near-zero, user line + typing dots immediate.

- [ ] **T7 — Render optimistic bubble + typing shimmer for the `initSchedule` entry instead of full-screen spinner.** (COMPLEMENTARY LAG win; additive to T6.) In `mobile/screens/chat/MaxChatScreen.tsx`, gate the full-screen `<ActivityIndicator>` at 1310-1313 to NOT apply when `route.params.initSchedule` is present — for the onboarding entry, render the normal list (which, once T6 lands, shows the optimistic user line + `ThinkingShimmer` immediately). Keep the spinner for a normal cold Chat-tab entry. Do NOT alter the `historyReady` gating of the send itself.
  - **VERIFY:** `cd mobile && npx tsc --noEmit` clean (ignore glass/* baseline). Manual: enter via Start schedule → no full-screen blank spinner; enter the Chat tab normally → spinner still shows during a genuinely cold load.

- [ ] **T8 — Final end-to-end verification of both fixes + fallback intact.** Backend full suite + targeted onboarding files; flags-OFF smoke. Mobile typecheck of all touched files. Manual end-to-end (sim, `com.cannon.mobile`): fresh paid user → Explore → a doc-driven Max → Start schedule; confirm (a) LAG: instant entry into a typing state, no long blank spinner; (b) ERROR: with a fault injected, the chat continues via the agent fallback (or shows the friendly message) instead of a dead "Internal server error" bubble. Confirm answer persistence: `merge_context` writes the answer before any raising line, and the degrade re-enters the agent/legacy flow. Maestro optional (sim-unverified OK): add `assertNotVisible "Internal server error"` after the answer step.
  - **VERIFY:** `cd backend && python -m pytest -q` (ignore documented pre-existing reds) AND targeted onboarding files (≥33 incl. new tests) AND `cd mobile && npx tsc --noEmit` (no NEW errors) AND the flags-OFF smoke prints `False False claude-haiku-4-5`.

---

## GUARDRAILS (hold every iteration)

1. Keep all dynamic-onboarding LLM behavior behind the existing flags; they MUST stay default `False` (verify with the smoke command). **None of these fixes flips a flag.**
2. Never break the fixed-onboarding fallback: the ERROR fix degrades to `None` → existing agent/legacy path (`chat.py:4651-4721`); the LAG fix is purely additive client-side. With flags OFF the fixed flow stays byte-for-byte identical.
3. The ERROR `except` branch MUST `await db.rollback()` (best-effort, swallow) before `return None`, or a poisoned `AsyncSession` makes the downstream path fail too. Always `logger.exception(...)` so failures stay observable.
4. Keep backend pytest + mobile tsc green, ignoring only the documented pre-existing reds and the 5 glass/* tsc baseline errors. Fail only on NEW errors in touched code.
5. Do NOT relax the `historyReady` gate for the `initSchedule` path (reopens the optimistic-line-clobber race). Use prefetch.
6. One logical change per commit, message prefix `dyn-onboarding:`, push to branch `dyn-onboarding` after each unit (standing deploy preference). Do NOT trigger EAS/TestFlight builds.
7. Never block the loop on simulator/Maestro flakiness — note `sim-unverified` and move on; pin `maestro --device <UDID-with-com.cannon.mobile>`.

---

## COMPLETION CRITERIA

1. All BUILD UNITS T1–T8 checked off (dated, with a one-line Iteration-Log note).
2. ERROR: a deterministically-injected mid-onboarding fault no longer 500s — `_run_onboarding_questioner` returns `None`, `_send_message_locked` returns 200, and the turn degrades to the agent/legacy flow; a regression test in `test_onboarding_gap.py` locks this in.
3. LAG: entering via Start schedule no longer shows a long full-screen blank spinner before the first question (prefetch lands; optimistic bubble/typing renders immediately).
4. With ALL flags OFF the onboarding remains today's fixed-question flow (no behavior change); `dynamic_questions_*` still default `False`.
5. `cd backend && python -m pytest -q` has no NEW failures vs the documented baseline; targeted onboarding files green (≥33, count went up); `cd mobile && npx tsc --noEmit` clean for touched TS (only the glass/* baseline remains).

### Completion promise (emit verbatim when done)
`ONBOARDING_BUGFIX_COMPLETE: onboarding driver body + call site guarded (degrade to None → fixed-flow fallback, with db.rollback) so no mid-onboarding 500; int-slider bounds coerced; chat-history prefetched on the Start-schedule CTA + optimistic typing render so no full-screen blank spinner before the first question; regression tests added; flags still default OFF; backend pytest + mobile tsc green.`

---

## OPERATING PROTOCOL (every iteration)

1. **Read this entire file.**
2. Do the **first unchecked BUILD UNIT** only. Keep the change small and scoped to that unit.
3. Run that unit's **VERIFY**. If it fails, fix within the unit until green (respect the pre-existing baseline — don't chase unrelated red).
4. **Check the box** with today's date + a one-line note in the Iteration Log.
5. **Commit + push** with prefix `dyn-onboarding:` (do NOT trigger EAS/TestFlight).
6. If you hit a genuine product/infra decision, add it under **Needs Human Decision**, pick the most reversible default, note the assumption, and keep going — do not block.
7. Continue. When COMPLETION CRITERIA all pass, emit the completion promise verbatim and stop.

---

## HOW TO RUN THIS LOOP

The `/ralph-loop` command splices its argument onto a raw shell command line, so the prompt MUST contain **no apostrophes, quotes, parentheses, or backticks** (any of them throws `unmatched '` / `unmatched "`). Keep the argument minimal — every guardrail and step already lives in this file, which the loop reads in full each iteration. Launch with exactly:

```
/ralph-loop Read ONBOARDING_BUGFIX_SPEC.md in full and follow its OPERATING PROTOCOL exactly, doing one unchecked BUILD UNIT per iteration with its VERIFY, then commit and push with prefix dyn-onboarding. --max-iterations 16 --completion-promise ONBOARDING_BUGFIX_COMPLETE
```

(`--completion-promise` takes a bare token — no quotes. If you prefer the self-paced runner, paste the same minimal text into `/loop`, which does not have the shell-quoting constraint.)

---

## Needs Human Decision
_(pick a reversible default and continue; do not block)_

- **Which exact exception class the user hit mid-onboarding is unknown** (no logs/stack trace captured). The structural fix (guard the driver body + call site) is correct regardless of the specific exception, so this does not block. If prod logs are reachable, grep for the `logger.exception("onboarding questioner body failed...")` line after T1 ships to confirm the live trigger (most likely a non-connectivity `merge_context` DB error).
- **Scope of the optional client polish (T4) and optimistic-render (T7).** Both are defense-in-depth / perceived-latency, not the root-cause fixes (T1, T6). Reversible either way — this spec ships them; drop them if a tighter scope is preferred.
- **`dynamic_questions_model` pinning (out of scope here).** `plan_questions` still routes through `lc_providers.get_sync_json_llm` / `LLM_PROVIDER` and does not yet honor `settings.dynamic_questions_model` or attach `cache_control` (flagged in `DYNAMIC_ONBOARDING_SPEC.md` Needs-Human-Decision). The LLM path is flag-OFF, so it does not affect these bugs; decide before enabling `dynamic_questions_enabled` in prod.

## Iteration Log
_(append one line per completed unit: `YYYY-MM-DD Tn — <result>`)_
2026-06-28 T1 — Guarded driver via `_impl` split + try/except wrapper (logger.exception + best-effort db.rollback + return None) and a call-site try/except. Fault-injection proves degrade-to-None + rollback; 33 targeted tests green.
2026-06-28 T2 — `_as_int(v,d)` helper guards slider min/max/step/default in `field_to_question_payload`. Null/non-numeric bounds → defaults (13/50/1/18) instead of TypeError 500. 33 targeted tests green.
2026-06-28 T3 — Generate-failure return no longer interpolates raw `{e}`; fixed user-safe retry string, `logger.exception` kept. 15 tests green.
2026-06-28 T4 — MaxChatScreen both catches: 5xx → friendly retryable message + restore snapshotted chips/slider (no raw "Internal server error"). historyReady/seed untouched. tsc clean (only glass/* baseline).
2026-06-28 T5 — Regression tests: driver-degrades-to-None+rollback, `_send_message_locked` returns 200 under the fault, and null-bounds slider defaults. Targeted suite 33 → 36 passed.

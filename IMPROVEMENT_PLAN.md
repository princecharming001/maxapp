# Max App — 10x Improvement Plan

Mission test for every change: does it help **fit looksmaxxing into someone's real life**, or does it force looksmaxxing on them? If the latter, cut it.

This plan is the output of a research + audit pass (Jun 2026). It is sequenced by impact and dependency. Large rewrites are flagged and need a thumbs-up before they start.

---

## What "10x better" means here (success measures)

1. **Time-to-first-great-schedule:** finishing onboarding lands the user *on a real, personalized routine* (today: lands on a scan upsell, routine comes later via a second chat questionnaire).
2. **Schedule realism:** zero tasks during sleep/work/commute, sensible day spread, load that ramps in week 1, the user's #1 maxx wins conflicts. Provable by an automated persona scorer.
3. **Edit speed:** change or remove any routine item in <=2 taps (today: only via free-form chat after a one-time review sheet).
4. **Planner clarity:** a non-technical 18-25 y/o sets their real week in one natural-language sentence or a short guided editor, and *gets* it in 5 seconds.
5. **Human voice:** every user-facing string in blunt-coach voice, no em-dashes, no markdown.

---

## Current-state audit (the honest version)

### A. Onboarding produces no routine (biggest problem)
- `mobile/screens/onboarding/OnboardingScreen.tsx`: 7 screens, ~18-22 taps, **no branching by maxx**. Collects `priority_ranking` (forces ranking all 5, L131) but only top-3 becomes `goals` (L182).
- `submit()` (L176-217) navigates to **`FeaturesIntro`** (scan upsell), not a routine.
- Backend `save_onboarding` (`api/users.py:569-649`) calls `regenerate_active_schedules` (L641), which is a **no-op for a new user** (it only re-expands already-active schedules; a new user has none — `schedule_runtime.py:232-241`).
- The first real schedule is created **only via chat** (`api/chat.py:3681`, `lc_agent.py:771`), behind a **second, separate** doc-driven `onboarding_questioner` that re-interrogates the user (skin_concern, hair type, workout_frequency...). Two disconnected onboardings.
- Post-pay `ModuleSelectScreen` also just saves `goals` and resets to Main. Still no schedule.

### B. Scheduling engine personalization is shallow
Pipeline (verified): `lc_agent.generate_maxx_schedule` -> `schedule_runtime.generate_and_persist` -> `schedule_generator.generate_schedule` -> `schedule_skeleton.expand_skeleton` -> `schedule_validator.validate_and_fix` -> persist + `multi_module_collision.reconcile`.

Signal usage today:
- Onboarding answers (concern/type/barrier): **USED** (DSL gating).
- Wake/sleep: **USED** (anchors).
- Workout window, get-ready: **USED**.
- weekly per-weekday overrides: **USED**.
- **Work window: PARTIAL** — only an eviction, and **only if `work_schedule == "fixed"`** (`schedule_validator.py:1053`). Flexible workers get nothing. Tasks are placed ignoring work, then maybe shoved away.
- **Obligations/commitments: PARTIAL** — eviction-only (`:1060`), never used to *choose* placement.
- **Intensity preference: IGNORED** — no such field exists. `intensity_ramp` is computed but only fed to a now-dead LLM prompt; the live skeleton path has **zero** week-1 ramp; `eligible_tasks` cap hardcoded to 1.0 (`schedule_generator.py:153`). Beginner load == advanced load.
- **Maxx priority order: IGNORED** — collisions resolved alphabetically/by intensity (`multi_module_collision.py:118`). User's top maxx can lose tasks to a secondary one.
- **Face-scan results: IGNORED by generation** — only injected into chat coaching (`lc_agent.py:321`), never reaches task selection.

Concrete quality bugs:
- **Placement ignores window end.** `_emit_tasks` stamps from the window *start* and steps `+max(dur,15)` with no `win_end` check (`schedule_skeleton.py:595-615`); a busy slot overruns and `_enforce_separation` cascades it later.
- Busy-avoidance is opt-in + reactive (see above).
- Hardcoded `MIN_TASK_GAP_MIN=15`, `HARD_DAILY_TASK_CAP=8`, `TARGET_DAILY_TOTAL=8` regardless of the user's real free time.
- Antagonism/coherence pairs + the ~150-row title-humanize table are hardcoded `catalog_id` lists (`schedule_validator.py:102-266,842,876`); every new task needs manual rule edits.
- Eval coverage: `tests/test_schedule_quality_regressions.py` exists (DB-free skeleton expansion asserts) but there is **no persona-matrix realism scorer**.

### C. Planner + routine UX
- `DayPlannerScreen.tsx` + `components/planner/*`: the week grid (`WeekCanvas.tsx`) **looks like Google Calendar but is read-only** — every tap just opens a modal (`DayEditorSheet`). Setting up a realistic week = **8-15 interactions across 3 different sheets**.
- Wake/sleep default to a confusing **Range** (two thumbs) instead of a single time (`DayEditorSheet.tsx:117`).
- Sleep/workout live in the day sheet; **work/commitments live in a separate manager** — two mental models.
- Workout window is **global-only** and silently disappears on a per-day scope (`DayEditorSheet.tsx:324`).
- Routine screen (`MasterScheduleScreen.tsx`): single chronological list, checkbox complete works, but **no inline edit/remove** — after the one-time `RoutineReviewSheet`, the only way to change a task is free-form chat ("Ask Max", L895).
- The backend **already parses natural language** into the structured plan (`plannerChat`, `DayPlannerScreen.tsx:194`) — underused.

### D. Domain credibility (from research, general guidance not medical advice)
- SPF 30+ is the daily AM anchor; retinoids are PM-only and should ramp 1-2 nights/week toward nightly; chemical exfoliation 1-2x/week and never the same night as a retinoid.
- Beginner gym default = Upper/Lower 4x/week (PPL 6x is advanced).
- Minoxidil = twice daily; derma-roller cadence depends on needle size (0.25-0.5mm ~weekly, 1.5mm every 4-6 weeks); don't apply minoxidil right after rolling.
- Mewing/posture/sleep consistency are ambient all-day habits — model as light reminders, not timeline blocks, to keep the day uncluttered.

---

## The plan (ordered slices)

Each slice ships independently: verify (gates below) + commit + push to main. No TestFlight unless asked.

### Slice 0 — Schedule-quality eval harness `[low risk, foundation]`
Build a persona-matrix scorer (extend `tests/test_schedule_quality_regressions.py`) that generates schedules for representative personas (9-5 worker, night-shift, student, 3-maxx beginner, advanced) and scores: no task in sleep/work/commit windows, load ramps week1->week2, declared priority respected, even day distribution, <=N collisions/day, domain cadence sane. Everything after this becomes provable before/after.

### Slice 1 — Constraint-aware placement engine `[LARGE REWRITE — needs sign-off]`
Make the skeleton place tasks into **free intervals** (wake..sleep minus work minus obligations), respecting each window's *end*, instead of stacking from the start anchor and patching later. Honor work/obligations for **every** user, not just `work_schedule=="fixed"`. Reuse the busy-interval logic already in `schedule_validator.py:_apply_day_windows`/`_busy_intervals_from_ctx`, moved earlier into `schedule_skeleton.py:_emit_tasks`/`_place_block`. Prove with Slice 0.

### Slice 2 — Personalization signals `[medium-large]` `DONE 2026-06-01`
**Status:** all four signals shipped + verified. Persona scorer 42/42, full `tests/` 184 pass, only the 4 known pre-existing failures (`test_chat_routing`, `test_fast_rag_and_retriever`, `test_window_resolver`, `test_validator_fixes_collisions_and_titles` — all predate this slice, none touched by it). Zero-regression: scan/intensity gap-fill only sets empty keys, so explicit user answers always win.
- **Intensity:** DONE (Lever A + #61). Added `intensity_preference` (chill / standard / sweatmode) on `user.py` + `normalize_intensity_preference`, PATCH endpoint in `api/users.py`, plumbed through `user_context_service.py`; real week-1 load ramp on the live skeleton path via `schedule_validator.py` ramp helpers; per-user `eligible_tasks` cap.
- **Maxx priority:** DONE (Lever C). Declared `priority_order` now drives collision trimming in `multi_module_collision.py` (`_PRIORITY_TOKEN_TO_MAXX`, `_maxx_priority_rank`); undeclared = neutral 999 rank (no behavior change for users who never ranked).
- **Face-scan -> generation:** DONE (Lever D). `scan_derived_signals` maps `facial_scan_summary.suggested_modules` (weakest-first) into a gap-filled `priority_order` inside `merged_user_state` (`user_context_service.py`); fixed `schedule_runtime.py` recon_ctx to route through `merged_user_state` so scan priority reaches the Lever C trimmer.
- **Domain cadence corrections:** DONE (Lever E, data-only in `data/maxes/*.md`). Minoxidil = clean 2x/day for `hair_loss_signs == yes_active` only (observing gets monitoring + microneedle); retinoid ramp note ("start 2 nights/week, build up"); fitmax `mobility_warmup` moved from morning to `pre_evening` on the workout's own cadence; midday mewing reset floated `midday`->`flexible` (all-day posture cue, no clock anchor). Derma-roller + exfoliation spacing verified already correct (no change). Rejected: a no-op `ambient` tag (zero consumers, would be dead metadata) and per-area concern inference from free-text scan notes (too unreliable, would risk forcing wrong actives).

### Slice 3 — Onboarding -> instant first routine `DONE 2026-06-02`
**Status:** shipped + verified. Backend `tests/` 192 pass (184 + 8 new starter tests), only the 4 known pre-existing failures. Mobile `tsc` clean (pre-existing errors only in CourseChapterSwiper/MaxxDetailScreen), `expo export` ends "Exported: dist".
- **Instant first routine (backend):** `save_onboarding` now calls `generate_first_routine_if_absent` (`schedule_runtime.py`). For a user with zero active schedules it builds their #1-priority maxx's plan: full tailored routine if every required field is answered, else a STARTER routine of universal daily-floor tasks with anything that reads an unanswered REQUIRED field stripped out (block-level `exclude_fields` in `expand_skeleton` + task-level `_drop_tasks_referencing`, both keyed off the new `schedule_dsl.referenced_fields`). Below a 3-task floor it no-ops (prior behavior). Entirely best-effort/non-fatal.
- **Reveal before paywall (mobile):** schedule endpoints are paid-gated, so `save_onboarding` returns a trimmed `first_routine` preview inline (`_starter_preview`). New `RoutineRevealScreen` (registered in the unpaid stack) shows a brief "building your plan" beat then day one, CTA into the existing scan/paywall funnel. Onboarding `submit()` resets to `RoutineReveal` instead of `FeaturesIntro`; degrades to a straight hand-off if no routine was built.
- **Intensity in onboarding:** added a chill / standard / sweatmode step (locked decision #3); sent as `intensity_preference` (engine already consumes it from Slice 2).
- **Relaxed ranking:** priority step now requires only #1 (was forced all-five); the rest is optional. Top-3 still becomes `goals`.
- **Two-onboarding merge:** verified the chat `onboarding_questioner.peek_next_question` already auto-skips any field present in merged state (it's built on `missing_required`), so collecting answers up front + the starter reveal removes the re-ask without further questioner changes.
- Deferred (low ROI / high risk): inlining per-maxx required fields into the static form by duplicating doc enum options. The starter-routine + in-chat questioner refinement covers this safely without forcing potentially-wrong actives.

### Slice 4 — Planner + routine UX `DONE 2026-06-02`
**Status:** shipped + verified. Backend `tests/` 197 pass (192 + 5 new `test_time_overrides`), only the 4 known pre-existing failures. Mobile `tsc` clean (pre-existing errors only in CourseChapterSwiper/MaxxDetailScreen), `expo export` ends "Exported: dist".
- **Inline edit + remove on routine rows (mobile):** `MasterScheduleScreen` rows now expand to a three-chip action bar (Move time / Ask Max / Remove) instead of the old chat-only affordance. "Move time" opens an inline `TimeRangeSlider` (single mode, dependency-free — avoided adding `@react-native-community/datetimepicker` and its native rebuild risk). Remove confirms via `Alert` then optimistically updates cache + calls `deleteScheduleTask`, rollback on error. Recurring rows (have `catalog_id`) edit/remove at **series** scope ("applies every day"); one-offs fall back to instance. Responder bubbling guarded with `onStartShouldSetResponder` on the editor/action containers so stray taps don't collapse the row mid-edit.
- **Durable time moves (backend):** `edit_task` gained a `scope` param ("instance"|"series"); series edits loop every day matching `catalog_id`. The critical fix: `regenerate_active_schedules` -> `_merge_preserving_status` preserves `task_id`+`status` but NOT `time`, so a moved time would silently revert on any silent re-expansion. Added durable `schedule_context.time_overrides` (catalog_id -> "HH:MM"), re-stamped via new `_apply_time_overrides` AFTER `validate_and_fix` so user intent beats the engine's default slot; `delete_task` series branch drops the stale pin so a removed part can't resurrect. Backed by 5 DB-free tests.
- **Natural-language-first planner (mobile, locked decision #2):** `DayPlannerScreen` reordered — the chat assistant ("Tell Max about your week") is now the primary surface right under the masthead; the `WeekCanvas` drops below it as a read-only "HERE'S YOUR WEEK · Tap any day to adjust it by hand" confirmation, then `ObligationsManager`. No logic changed (buildOnboarding/persist/commitScope/sendChat/openEditor untouched).
- **Default to Exact:** verified already satisfied — `reconcileWindow` (plannerModel.ts) collapses to `[a,a]` exact whenever there's no valid stored window, so Range is already opt-in. No change needed.
- **Disappearing workout control explained:** `DayEditorSheet` single-weekday view (scope !== 'all') now renders a muted "Workout window" header + "Set once for all days. Open the All days view to change it." instead of silently dropping the control.

### Slice 5 — Copy + polish `[low risk]`
Voice pass on all new strings; blunt coach, no em-dashes, no markdown.

---

## Product decisions (LOCKED 2026-06-01)
1. **Funnel / paywall placement.** DECIDED: reveal a personalized routine at the end of onboarding, then soft-paywall. Show value first. Drives Slice 3's shape.
2. **Planner input model.** DECIDED: natural-language-first; the week grid becomes a read-only "here's your week" confirmation; guided per-day range editor is the structured fallback.
3. **Intensity choice.** DECIDED: add a chill / standard / sweatmode choice in onboarding; the engine scales daily load + week-1 ramp to match.
4. **Build order.** DECIDED: 0 -> 1 -> 2 -> 3 -> 4 -> 5 (engine quality before we surface an auto-generated first plan).

---

## Verification gates (every slice)
- Backend: `cd /Users/home/maxapp/backend && /Users/home/maxapp/.venv/bin/python -m pytest tests/ -q` (4 known pre-existing failures; scope to `tests/`). Add tests for changed logic.
- Mobile: `cd /Users/home/maxapp/mobile && npx tsc --noEmit` (pre-existing errors only in CourseChapterSwiper.tsx + MaxxDetailScreen.tsx) then `npx expo export --platform ios` (must end "Exported: dist").
- Deploy: commit + push to main only. No EAS/TestFlight unless explicitly asked.

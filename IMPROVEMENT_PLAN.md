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

### Slice 2 — Personalization signals `[medium-large]`
- **Intensity:** add an `intensity_preference` signal (chill / standard / sweatmode) + a real week-1 ramp on the live path; gate `eligible_tasks` by a per-user cap (`schedule_generator.py:145-153`, `schedule_skeleton.py`, plumb field in `api/users.py` + `user_context_service.py`).
- **Maxx priority:** use declared priority order in collision trimming (`multi_module_collision.py:118,159-176`).
- **Face-scan -> generation:** map `latest_scan` focus areas/scores into `user_state` so generation targets measured weak points (`user_context_service.py:105`, generation overlay).
- **Domain cadence corrections:** encode retinol ramp, exfoliation spacing, minoxidil 2x/day, derma-roller frequency, mewing-as-ambient in the max docs / catalog (data, not code).

### Slice 3 — Onboarding -> instant first routine `[LARGE REWRITE — needs sign-off]`
- On `save_onboarding`, if no active schedule exists, **generate the #1-priority maxx's schedule** (instead of the no-op regen) and land the user *on that routine* with a short "building your plan" reveal, not `FeaturesIntro`.
- **Merge the two onboardings:** feed the static answers into `onboarding_questioner` so `peek_next_question` skips already-known fields (no chat re-ask).
- **Branch the static form by top maxx** to inline 1-2 critical fields right after the priority step; drop/defer weight+height unless fitmax is top-3; stop forcing all-5 ranking (collect top 3).
- (Funnel/paywall placement is an open decision — see below.)

### Slice 4 — Planner + routine UX `[LARGE REWRITE — needs sign-off]`
- Make **natural language the primary planner input** (parser exists), keep the week grid as a **read-only "here's your week" confirmation**, add a **guided per-day range editor** as the structured fallback.
- Default wake/sleep to a single **Exact** time (Range = opt-in). Unify "add anything" into one entry point (sleep/work/gym/commitments). Explain the disappearing workout control.
- Add **inline edit + remove** on routine rows (reuse `handleRemovePart`/`deleteScheduleTask`) so editing isn't gated behind chat.

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

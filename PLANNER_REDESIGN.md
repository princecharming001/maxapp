# Planner Editing Redesign — build spec (Ralph loop reads this each iteration)

Single source of truth. Each iteration: read this top-to-bottom, do the **first
unchecked unit**, verify, check it off with a one-line dated note, commit+push
(prefix `planner:`), then continue. Don't restart from scratch — prior work
persists here + in git.

## GOAL (user's vision)
Make recurring edits easy. A top-level **"Your default day"** button opens your
*repeating routine* (wake / workout / bedtime / get-ready). Editing there lets you
**choose which days each thing applies to** (Every day / Weekdays / Weekends /
pick days) — repeats by default, with per-day variance when you want it. The day
strip stays for one-off, this-week tweaks. Today the only way to set a recurring
default is the chat or editing 7 days by hand — fix that.

## HARD GUARDRAILS (do not violate)
- **No huge UI changes / no redesign.** Reuse `DayEditorSheet`, the day strip, the
  `defaults + weekly + obligations` model, `commitScope`, and the backend
  `weekly_timings`. Add small, additive controls — not new screens or a timeline
  rework. Small UI additions (a button, a compact repeat chip, a scope row) are fine.
- **Don't break existing per-day editing**, the edited-dot, or "reset to default".
- The recurrence plumbing already exists: `commitScope('all', …)` writes the
  baseline; per-weekday overrides write `weekly_timings.<weekday>`; saving triggers
  `regenerate_active_schedules`. You're mostly exposing/extending, not rebuilding.
- **`tsc` must stay clean** (run `cd mobile && npx tsc --noEmit`; only the known
  pre-existing `components/glass/*` errors are allowed). One logical change per commit.
- **Sim is unstable here** (Maestro/xctest driver hangs; app cold-starts into the
  scan). Verify via `tsc` + careful code reading + best-effort screenshot; do NOT
  block a unit on the flaky sim — note "sim-unverified" and move on.
- Flag anything genuinely needing a product call instead of guessing.

## BUILD UNITS (ordered — P0 first; ship value even if later units defer)
- [x] **U1 — "Your default day" entry button.** DONE 2026-06-27: added a "Your
  usual day" card button between the title and the day strip → `openEditor('all')`,
  which opens DayEditorSheet at `scope='all'` (edits `defaults` via the existing
  `commitScope('all',…)`). The previously-unreachable all-days editor is now
  reachable. tsc clean (only the 5 known glass errors). sim-unverified (driver
  unstable) — change is additive (a button reusing existing wiring).
- [x] **U2 — "Apply to" scope on commit.** DONE 2026-06-27. Replaced `commitScope`
  with `commitRecurrence(target: DayRecurrence, day)` in DayPlannerScreen: `'all'`
  → defaults; `'weekdays'`/`'weekends'`/`Weekday[]` → write that set's `weekly`
  overrides (diffed vs defaults, so editing back to base clears them) via the
  existing `obligationAppliesTo`/`WEEKDAY_KEYS` helpers. Added an **"Apply to" chip
  row** in DayEditorSheet's footer (`Every day · Weekdays · Weekends` when opened
  from "Your usual day"; `This day · Weekdays · Weekends · Every day` from a strip
  day) — the sheet now emits the chosen `DayRecurrence`. Default: 'all' from the
  default-day button, `[weekday]` from a strip day → preserves existing per-day
  behaviour exactly. tsc clean (5 known glass errors only). sim-unverified (driver
  unstable); logic is straightforward + type-checked.
- [ ] **U3 — Per-block repeat (the routine builder).** In the default-day editor,
  a COMPACT "Repeat: Every day ▾" control per block (Wake/Sleep/Get-ready/Workout)
  so e.g. workout = Mon/Wed/Fri while wake = every day. Implement by writing that
  block's values into the chosen weekdays' overrides (clearing elsewhere). Keep it
  compact (chip + small menu) — NOT a sheet redesign. If it can't be done without a
  big rework, ship U1+U2 and move this to "Deferred" with the reason.
- [ ] **U4 — Scope caption.** Under each block show "applies to: every day" /
  "Mon, Wed, Fri" so scope is always visible. Small.
- [ ] **U5 — Single-time default + optional ± range.** Wake/sleep default to a
  single time ("Wake 7:00") with an optional range toggle, to cut the up-front
  window decision. Keep the window model underneath. Smaller/optional.
- [ ] **U6 — Integrity pass.** Edited-dot shows on every overridden day;
  "reset to default" works after multi-day writes; `serializeWeekly` /
  `dayPartialToServer` payload still correct; no orphan overrides left behind.

## OUT OF SCOPE (defer — do NOT build here)
Timeline visual redesign; new screens; commitments/obligations rework (already has
recurrence); meal/dinner anchors; one-time non-recurring blocks; undo/history.

## KEY CODE MAP
- `mobile/screens/profile/DayPlannerScreen.tsx` — strip, scope state, `openEditor`,
  `commitScope` (~289), `resetScope`, `effectiveDay`, persist.
- `mobile/components/planner/DayEditorSheet.tsx` — the visual editor (Wake/Sleep/
  Get-ready/Workout sections, `scope`, `onCommit`).
- `mobile/components/planner/plannerModel.ts` — `DayShape`, `Obligation`, `Scope`,
  `diffDayShape`, `effectiveDay`, `serializeWeekly`, `dayPartialToServer`,
  `DayRecurrence`.
- `mobile/components/planner/ObligationsManager.tsx` — existing recurrence picker
  (`all/weekdays/weekends/pick`) to mirror for the new scope control.
- `backend/api/users.py` — `/users/onboarding` (defaults + `weekly_timings` +
  `regenerate_active_schedules`).

## COMPLETION CRITERIA (all true before the promise)
1. U1 + U2 shipped and verified (default-day button opens the all-days editor;
   an edit can be applied to Every day / Weekdays / Weekends / This day and lands
   correctly in `defaults`/`weekly`). Existing per-day editing + reset still work.
2. `tsc` clean (only the known glass errors).
3. U3–U6 each either done or moved to "Deferred" with a one-line reason. No silent skips.

When all hold, output exactly: `<promise>PLANNER REDESIGN COMPLETE</promise>`

## DEFERRED (with reason)
- (none yet)

## ITERATION LOG
- (start)
- 2026-06-27 (iter 1): U1 shipped — "Your usual day" button (top of Planner) opens
  the all-days/default editor. Additive, tsc clean. Next: U2 (apply-to scope).
- 2026-06-27 (iter 2): U2 shipped — commitRecurrence + "Apply to" chips (Every
  day/Weekdays/Weekends/This day). P0 (U1+U2) now functionally complete: you can
  set a wake/bedtime once and apply it to every day or weekdays/weekends. tsc
  clean. Next: U3 (per-block repeat) or U4 (scope caption).

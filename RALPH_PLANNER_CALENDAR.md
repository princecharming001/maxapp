# RALPH_PLANNER_CALENDAR.md — make the planner calendar beautiful, minimal, and actually functional

## Target
The planner's day view is a calendar: an hour gutter on the left and events positioned on the time
axis. Code:
- `mobile/components/planner/ScheduleGrid.tsx` — the calendar (hour lines + labels, event cards,
  overlap-column layout). THIS is the file to perfect.
- `mobile/screens/profile/DayPlannerScreen.tsx` — hosts it under the masthead + week strip; tapping a
  card calls `onEditShape` / `onEditObligation` which open the existing editor sheets.

## Mission
Make this calendar **more aesthetic, more minimal, and genuinely functional**, and **find and fix the
flaws**. Use your own design judgment AND verify on the iOS simulator with Maestro (scoped to the
planner — see Verification). Iterate: screenshot → critique → fix → re-screenshot until it looks and
feels right.

## DO NOT TOUCH (locked by the user this session)
- The masthead title ("Your *week*") and the day-ring week strip — keep exactly as they are.
- The top-bar buttons: `•••` = chatbot (Ask Max), `+` = commitments. Keep.
- The editing flows (tap a card → `DayEditorSheet` / `ObligationsManager`), commitments sheet, chat
  sheet, auto-save/persist. Keep all working.

## Known flaws to fix (you found these by reading the code; find more)
1. **Over-scroll on sparse days.** Grid height = `(endHour-startHour) * HOUR_H` (62px/hr). A normal
   day (wake ~7am → wind-down ~10:30pm) is ~960px of mostly-empty axis. Make it feel right: tune
   `HOUR_H`, and/or compress long empty stretches between events while keeping the axis legible.
2. **Unlabeled start hour.** Labels render only on even clock hours, so a day starting at an odd hour
   (7am) has an unlabeled gap at the top and the first card floats with no time anchor. Fix the
   labeling so the first visible hour is always anchored.
3. **No "now" line.** When viewing today, a current-time indicator (a thin accent line + dot in the
   gutter) is standard, functional, and looks great. Add it; only on today; updates over time.
4. **Overlap columns truncate titles.** Overlapping events split to ~50% width; the centered title
   then clips. Handle narrow cards gracefully (left-align + smaller type in narrow columns, or a
   better overlap treatment).
5. **Duplicate adjacent commitments render as two identical side-by-side cards** (e.g. "Commute"
   twice). De-dupe identical overlapping items in the view (presentation only — do not delete data).
6. **Tall cards look empty.** A long block (Work 9–5) centers its title in a huge card. Top-align the
   title (+ time) for tall cards so it reads like a calendar event.
7. **No past-event de-emphasis.** On today, dim events whose end time has passed (subtle, tasteful).
8. **Flat scannability.** Every card is identical white. Decide whether a *very* subtle signal
   (e.g. a hairline left tick in the max's color, or a small dot) improves scanning without breaking
   the minimal look — your call, justify it with screenshots.
Find and fix anything else you spot (alignment, spacing, type scale, contrast, empty-day state,
bottom cut-off, hit targets, dark-mode/cream contrast).

## Aesthetic direction
Minimal, editorial, calm — same "Craft" family as the rest of the app (cream canvas, white cards,
hairlines, soft shadows, restrained ink + the one green accent). Tabular figures in the gutter.
Generous but not wasteful vertical rhythm. The reference is a clean Apple/Tiimo-style day view: quiet
gutter, events that sit exactly at their time, nothing shouting.

## Functional bar ("actually functional")
- Tapping any event opens its editor (already wired) — verify it still does.
- The selected day, the week strip, and the buttons all keep working.
- Consider (optional, if clean): tapping an empty slot opens "add commitment" — only if it doesn't
  add clutter or risk. Don't force it.

## Verification — Maestro, scoped to the planner
Do NOT run the whole app suite. Add/refresh ONE planner-scoped flow under `mobile/.maestro/`
(e.g. `planner_calendar.yaml`) that: launches the app, opens the Planner tab, asserts the calendar is
visible, scrolls it, taps an event and asserts an editor sheet appears, dismisses it. Run it against
the booted simulator via the Maestro MCP if available, else the maestro CLI
(`~/.maestro/bin/maestro test mobile/.maestro/planner_calendar.yaml`, plus `maestro hierarchy` and a
screenshot to inspect). Capture a screenshot each iteration, look at it, critique it against the
aesthetic direction, and keep iterating. If the simulator/Maestro is unavailable, fall back to
`npx tsc` + reading the code, and say so — never claim a visual pass you did not see.

## Success criteria
- **RC1** Flaws 1–7 above are fixed (8 is a justified design decision either way).
- **RC2** `now` line shows on today only and is positioned correctly.
- **RC3** Overlapping + duplicate events render cleanly (no clipped titles, no identical twins).
- **RC4** A sparse day no longer requires excessive scrolling; the axis feels intentional.
- **RC5** Tapping an event still opens the editor; week strip + buttons + save all still work (Maestro-verified, planner-scoped).
- **RC6** `npx tsc --noEmit` clean for `ScheduleGrid.tsx` + `DayPlannerScreen.tsx`; existing tests green.
- **RC7** A `mobile/.maestro/planner_calendar.yaml` flow exists and passes (or a clear note if Maestro was unavailable).
- **RC8** Screenshots captured each iteration; final screenshot matches the minimal/editorial direction.

## Discipline
- Additive and presentation-only where possible; do not change the planner's data model or persistence.
- Keep the masthead/strip/buttons/editor flows intact.
- Commit per logical change. Do not stop until RC1–RC8 pass (or Maestro is documented unavailable and
  everything else passes).

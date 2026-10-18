# Beta-1 fix contracts (shared by every workstream)

The plan is `BETA1_FIX_PLAN.md`. These are the interfaces the backend core (W1/W2/W4/W5/W6/W7) will provide, so mobile and guide work can build against them in parallel. Do not change them without updating this file.

## C1 · Habit `kind` (library docs → plan → days → app)
Every habit in `backend/ai_programs/*.md` gets one line:
```
- kind: action | rule | setup | checkin
```
- `action` — a thing you do at a time (default when missing for `custom_*`).
- `rule` — a boundary with nothing to tick (caffeine cutoff, alcohol buffer, screens off, late-meal buffer, nap rule, fixed wake time, weekend anchor, exercise timing). 0 minutes.
- `setup` — done once (bedroom setup, stack audit). Scheduled in week 1 only.
- `checkin` — a short log/review (sleep log, weekly review).

Optional lines (parsed by the backend):
```
- order: first                 # among habits anchored to wake: placed first after wake
- after: water_on_waking       # placed after that habit when both are in any active plan
- cycle: 4 on / 1 off          # weeks on / weeks off, repeating (melatonin)
- cycle: trial 12              # weeks 1..12 only, then a review task in week 13
```

**Expanded days.** `user_schedules.days[i]` now has, besides `tasks`:
```json
"rules": [{"title": "No caffeine after", "time": "16:15", "catalog_id": "sleepmax.caffeine_cutoff",
           "maxx_id": "sleepmax", "note": "decaf, herbal tea or water after this"}]
```
Rules are never in `tasks`: no checkbox, no completion, no XP, not counted in progress or day close. Each task dict gains `"kind": "action" | "setup" | "checkin"`.

## C2 · Plan card (`[VISUAL_BLOCK]` type `plan`)
`data` gains:
- `weekday_minutes: int`, `weekend_minutes: int`: real per-day sums of task minutes (rules excluded, weekly tasks excluded).
- `total_minutes` stays (= weekday_minutes) for old builds.
- each item gains `kind` (`action | rule | setup | checkin`); rule items have `minutes: 0` and render as "rule", not "0 min".
The card should read "N min weekdays · M min weekends", or "N min a day" when they're equal. The closing line "slide it lighter…" is removed from the text; the Lighter/Balanced/More control stays.

## C3 · Chat response
`POST /chat/message` JSON gains:
- `day_shape_changed: bool`: true when the turn changed wake/bed/windows/commitments/daily minutes. App: `refreshUser()` + invalidate schedule and planner queries.
- `plan_changed: bool`: true when any plan's habits changed this turn (app already invalidates; keep doing it).

## C4 · Onboarding save is a merge
`POST /users/onboarding` merges top-level keys into the stored blob (it no longer replaces it). The response gains `warnings: [{"code": str, "message": str}]`, e.g. `{"code": "overlap", "message": "Get ready (9:00–9:30) overlaps Work (9:00–5:00)."}` or `{"code": "short_sleep", "message": "That leaves 6 h 45 min for sleep."}`. The planner sheet sends only the keys it changed and shows the warnings.

## C5 · Task guide
`GET /schedules/{sid}/tasks/{tid}/guide` (unchanged URL):
- Products in steps carry `need: str` (the Products-tab need id) and `strength: str | null`.
- Guides are regenerated server-side when the task's time, duration or the user's day shape changes; the app's react-query key must include the task's `time` and `duration_minutes` so a retimed task refetches.
- Section heading is "What you'll use"; only consumables appear there, gear (bottles etc.) appears as "Gear".

## C6 · Persona
Backend default `coaching_tone` is `"default"` (plain, direct). The mobile picker must show no coach selected when the tone is `"default"`, never Clavicular. Descriptions: Goggins "tough love", Clavicular "sharp, high standards", Big Daddy "warm and encouraging".

## C7 · Day counter / first steps
`journey_start` = the date the user's first plan started (not account creation). "First Steps" is earned on the first completed task.

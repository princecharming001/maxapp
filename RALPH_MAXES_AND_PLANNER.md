# RALPH LOOP — Onboarding speed + opt-ins that matter + max-detail redesign + Planner redo

## STATUS / READ THIS FIRST
- **Nothing here is implemented yet.** You are done ONLY when EVERY criterion (SC1–SC12) is
  implemented AND verified — UI on the iOS simulator with Maestro, backend/data with scripts/pytest —
  AND the work is pushed to git (SC12).
- This is a big, multi-part change. Work in logical commits. After each part, re-read this file and
  re-verify. **Do not regress** the vertical task-guide pager, per-step images, per-user product
  consistency, or the ingredient work from prior specs.
- The Planner redesign here (SC10) **supersedes** the lighter planner pass in
  `RALPH_TASK_VISUALS_PLANNER.md` — go bigger and more intuitive.

---

## PARTS (what the user asked for)
A. Onboarding loads/advances too slowly → make it fast (SC1–SC2).
B. The "Tune your <X> plan" opt-ins don't change the actual tasks → make them matter, let users change
   them later, and surface onboarded maxes under a new **My Maxxes** tab in Explore (SC3–SC5).
C. Redesign the individual max screens (tapped from Explore) to match the app + copycat the inspiration
   (ss2 program-with-stats, ss3 session timeline); add animations; **remove videos for now** (SC6–SC9).
D. **Completely** redesign the Planner tab to be more intuitive + on-aesthetic (SC10).
E. Verify, don't regress, and **push to git** when everything passes (SC11–SC12).

---

## KEY FILES (already mapped — start here)
**Onboarding (A)**
- `backend/services/onboarding_questioner.py` — deterministic question state machine (`peek_next_question`
  L64, `field_to_question_payload` L74, `coerce_answer` L130). **No per-question LLM.**
- `backend/api/chat.py` — `_run_onboarding_questioner()` L3938, invoked on every chat turn at L4416
  **before** the LLM agent. (The agent/RAG running on onboarding turns is the latency suspect.)
- `mobile/screens/chat/MaxChatScreen.tsx` — per-max onboarding chat; `initSchedule` L573, send at L652,
  choices/widget unpack L684/L687. No prefetch; each answer round-trips the full chat pipeline.

**Opt-ins / My Maxxes (B)**
- `mobile/components/ChatHabitPicker.tsx` — the "Tune your <X> plan" widget. **BUG:** tri-state but
  `avoided` is always `[]` (L33/L67) → deselecting excludes nothing.
- `mobile/data/habitCatalog.ts` — chip `id`s MUST match backend `task_catalog` ids exactly (verify all
  maxes, esp. heightmax from the screenshot).
- `backend/api/schedules.py` `set_habit_prefs()` L341 → `schedule_service.set_habit_prefs()` L3201 →
  `schedule_runtime.py` L500+ drops `avoided_catalog_ids`, pins `wanted_catalog_ids`. (Plumbing works —
  the client just never sends `avoided`.)
- `mobile/screens/marketplace/MarketplaceScreen.tsx` — Explore; tabs `all|native|creator` (L64/L78).
  Add a **My Maxxes** tab. "My Maxxes" = user's active `UserSchedule`s (see ProfileScreen L255–267).

**Max detail screens (C)**
- `mobile/screens/marketplace/MaxDetailScreen.tsx` — hero (image OR **expo-video** L316), serif title,
  stats, sticky CTA. Remove the video.
- `mobile/screens/courses/MaxxDetailScreen.tsx` — `CourseHero` + `CourseTimeline` (Alan-style path).
- `mobile/components/CourseHero.tsx` (hero + stats row) and `mobile/components/CourseTimeline.tsx`
  (vertical node path) — reuse/extend these for ss2/ss3.

**Planner (D)**
- `mobile/screens/profile/DayPlannerScreen.tsx` — scope pills + `DayTimeline` agenda + grid + chat FAB;
  data = `DayShape`/`Obligation` from onboarding, `api.plannerChat()`, invalidates
  `queryKeys.schedulesActiveFull`. Keep this data layer.
- `mobile/screens/_mocks/PlannerMockups.tsx` — the intended "Today Loop" direction (streak ring,
  "Lock in today", NEXT UP card, YOUR DAY time-rail, GlassCard/GlassButton). Use as north star.

**Design system (all)**
- `mobile/theme/dark.ts` — tokens: `colors` (bg `#FFFFFF`, ink `#111113`, border `rgba(0,0,0,.08)`,
  accents), `spacing`, `borderRadius`, `typography`, `fonts` (serif `Fraunces`, sans `Matter`).
- Reusable: `components/glass/GlassCard.tsx`, `GlassButton.tsx` (primary/glass/ghost),
  `components/CourseHero.tsx`, `CourseTimeline.tsx`, `components/ui/Chip.tsx`, `SectionLabel.tsx`,
  `maxColor(maxxId)` for per-max accent. Reuse these — don't invent new primitives.

**Libs available (NO native rebuild):** reanimated 4.1, gesture-handler 2.28, expo-image,
expo-linear-gradient, expo-blur, react-native-svg. (expo-video exists but we're removing its use here.)

---

## HARD CONSTRAINTS
- **No new native deps / no `expo prebuild`.**
- Keep all data layers intact (onboarding state machine, habit-prefs plumbing, planner DayShape,
  react-query keys). These are visual/UX + wiring fixes, not data rewrites.
- Bump `_PAYLOAD_V` / invalidate the right query keys when a cached shape changes.
- Don't fabricate stats — program stats (weeks, days/week, routines, length) must be real/derived.
- Verification split: **UI → Maestro on sim (large + small device); backend/logic → scripts/pytest.**

---

## SUCCESS CRITERIA

### Part A — Onboarding is fast
**SC1 — First question appears fast (no cold-start stall).**
- Eliminate the first-question delay when starting a specific max: warm the question catalog eagerly
  (on app start and/or when the user opens that max's detail screen or taps Start), and make the
  initial onboarding request return the first question without waiting on the LLM agent.
- Always show an instant affordance (typing indicator/skeleton) so it never looks frozen.
- VERIFY (Maestro UI + backend): from tapping a max's "Start" to the first question rendering feels
  immediate; backend log/timing shows the first onboarding turn does not invoke the LLM agent.

**SC2 — Near-zero latency between questions.**
- The onboarding turn must NOT run the LLM agent/RAG — when onboarding is pending, the chat endpoint
  short-circuits to the deterministic questioner and returns the next question immediately.
- Because the question sequence is deterministic and catalog-derived, remove per-question round-trips:
  implement EITHER (pick the cleaner; you may combine)
  - (a) **batch/prefetch** — return the full ordered question list (or prefetch the next) for the max at
    onboarding start; the client advances locally and POSTs answers in the background; or
  - (b) **client prefetch + optimistic UI** — fetch question N+1 while the user answers N, and render
    the next question instantly on tap.
- Trim per-turn work (avoid redundant DB writes / heavy context loads on onboarding turns).
- VERIFY (Maestro UI): answering a question and seeing the next is near-instant (no spinner gap);
  (backend) onboarding turns make zero LLM calls and minimal DB work.

### Part B — Opt-ins actually shape the plan + editable + My Maxxes
**SC3 — Selecting/deselecting opt-ins changes the real tasks.**
- Fix `ChatHabitPicker` so the offered chips represent the optional habit set and the submission sends
  BOTH `wanted` (selected) AND `avoided` (the offered-but-unselected complement) — so deselecting a
  chip actually drops that task. Pre-select sensible core habits so "Looks good" with no changes still
  yields a real, non-empty plan.
- Verify every chip `id` in `habitCatalog.ts` maps to a real backend `task_catalog` id for ALL maxes
  (fix heightmax + any mismatches), so prefs aren't silently ignored.
- After submit, the schedule regenerates and the user's daily tasks reflect the choices (selected
  present, deselected absent).
- VERIFY (backend pytest): set prefs with a subset selected → regenerated schedule contains the wanted
  tasks and excludes the deselected ones; changing the selection changes the tasks.

**SC4 — Users can change their opt-ins later.**
- Add an "Edit plan / Tune habits" entry on the max's screen (and/or My Maxxes) that re-opens the
  picker **pre-filled with the current wanted/avoided**, re-submits, and regenerates. Reachable any
  time after onboarding.
- VERIFY (Maestro UI): open a max → tune habits → change a selection → tasks update.

**SC5 — "My Maxxes" tab in Explore.**
- Add a new **My Maxxes** segment to `MarketplaceScreen` (Explore) listing the maxes the user has
  onboarded/active (derived from active `UserSchedule`s). After onboarding a max it appears here.
  Tapping opens that max's screen with the tune/edit entry (SC4) and quick access to today's tasks.
- Design it on-aesthetic (cream+ink+Fraunces, hairline cards, GlassButton); show something useful per
  card (e.g., streak/progress or today's task count). Empty state handled.
- VERIFY (Maestro UI): onboard a max via DEV→Paid flow; it shows under My Maxxes; tapping it works.

### Part C — Max detail screens redesigned (copycat ss2/ss3, animated, no video)
**SC6 — Program screen matches the inspiration (ss2) + the app aesthetic.**
- Redesign the individual max screen (`MaxDetailScreen`, and align `MaxxDetailScreen`) to the ss2
  structure: large hero image (rounded, bleeding), big Fraunces title, description, primary CTA
  ("Start"/"Join Path"), and a **stats grid** (e.g. WEEKS / DAYS-PER-WEEK / ROUTINES / AVG ROUTINE
  LENGTH) with real derived values. Cream+ink, hairline cards, `GlassButton`. Make better stylistic
  choices than the raw screenshot where it improves cohesion.
- VERIFY (Maestro UI): the screen reads like ss2 but in the app's aesthetic; stats are real.

**SC7 — Session/path timeline (ss3).**
- Provide a vertical session timeline like ss3 (Alan): Day N / Session with completion checkmarks for
  done, a highlighted current node (ring), and locked future sessions showing a lock + an "Available
  in HH:MM:SS" countdown. Build on `CourseTimeline`. Wire to the max's real sessions/days where data
  exists; degrade gracefully where it doesn't.
- VERIFY (Maestro UI): timeline shows done/current/locked states correctly.

**SC8 — Add animations.**
- Tasteful, 60fps Reanimated 4.1 motion: hero entrance/parallax on scroll, staggered timeline node
  reveal, CTA press feedback, segment/tab transitions. No jank; UI-thread driven.
- VERIFY (Maestro UI): capture mid-scroll/entrance screenshots showing motion; no stutter.

**SC9 — Remove videos for now.**
- We have no videos. Remove `expo-video`/player usage from the max detail screens (hero video and "A
  look inside") and replace with static imagery; remove any "Watch" affordance that depends on a video.
  Don't break expo-video imports used elsewhere; just stop using them here. Graceful with no media.
- VERIFY: no video player renders on the detail screens; no broken media boxes; app cold-starts clean.

### Part D — Planner completely redesigned
**SC10 — New, intuitive, on-aesthetic Planner.**
- Rebuild `DayPlannerScreen` into a clearly more intuitive experience. Big changes welcome. Draw on the
  `PlannerMockups` "Today Loop" direction where it helps: a clear today view with a time-rail showing
  real task blocks + structure (wake/get-ready/workout/sleep), an obvious "now" marker, a prominent
  next-up, easy day-shape editing, and the assistant. Use editorial cream+ink+Fraunces + GlassCard/
  GlassButton, hairline treatment, calm spacing — cohesive with the rest of the app.
- **Keep the data layer**: `DayShape`/`Obligation` hydration+serialization, `api.plannerChat()`, and
  the react-query invalidations (`queryKeys.schedulesActiveFull`, `activeSchedulesSummary`). This is a
  UX/visual overhaul, not a data change. Keep `embedded` tab behavior.
- Make tasks actionable (e.g., tap a task block → its guide), handle empty states, look right on small
  (SE) + large (Pro Max) screens.
- VERIFY (Maestro UI): Planner tab is visibly redesigned, intuitive, on-aesthetic, schedule renders
  with real blocks, editing still saves, good on small + large.

### Part E — Quality & ship
**SC11 — No regressions; verified.**
- Task-guide pager, per-step images, product consistency, ingredient work all still function.
- App cold-starts with no red error boundary; `npx tsc --noEmit` clean for touched mobile files.
- UI verified via Maestro (large + small); onboarding-latency + opt-in plumbing verified via backend
  scripts/pytest.

**SC12 — Push to git.**
- When ALL of SC1–SC11 pass, commit the work in logical chunks with clear messages and **push to the
  remote** (current branch). Confirm the push succeeded (the working tree is clean and the branch is
  ahead-by-0 vs its upstream after push).

---

## LOCAL DEV SETUP (already working — use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`); `mobile/.env.local` →
  `http://127.0.0.1:8001/api/`. Start: `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear`. App id `com.cannon.mobile`.
- Reach flows: DEV drawer (floating "DEV", accessibilityLabel **"Open dev drawer"**) → "Paid" → Home;
  Explore = bottom tab; onboard a max from its detail screen → onboarding chat; Planner = Planner tab.
- Maestro CLI `~/.maestro/bin/maestro` (v2.6.1); flows under `mobile/maestro/`. Maestro reads the
  accessibility tree — add `accessibilityLabel`/`testID`, use coordinate taps + `takeScreenshot`, and
  READ the screenshots (present-in-tree ≠ visible). Boot an iPhone SE sim for small-screen checks.

## WORK ORDER (suggested)
1. A (SC1–SC2): short-circuit onboarding turns off the LLM agent + warm catalog + prefetch/batch. Backend timing test.
2. B (SC3): fix ChatHabitPicker avoided-complement + verify catalog-id mapping; backend test that tasks change. Then SC4 edit-later, SC5 My Maxxes tab.
3. C (SC6–SC9): redesign max detail (ss2 stats + ss3 timeline), animate, strip video.
4. D (SC10): rebuild Planner.
5. E (SC11–SC12): regression sweep, then commit + push.

## DEFINITION OF DONE
- Onboarding first question is fast and between-question latency is near-instant (no LLM on onboarding
  turns). Opt-ins demonstrably change the daily tasks, are editable later, and onboarded maxes appear
  under a My Maxxes tab. Max detail screens match ss2/ss3 in the app aesthetic, animated, video-free.
  Planner is completely redesigned, intuitive, cohesive, data intact. No regressions; tsc + cold start
  clean. Verified (UI via Maestro on large+small, logic via backend tests). **Work pushed to git.**

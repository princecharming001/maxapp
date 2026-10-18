# Beta Test #1 — fix plan

Sources: `Superpower_Beta_Test_1` (biohacker, F1–F45) and `Beta Test #1 - Avni Gupta` (3 issues).
Scope: fixes only. No new features (see "Not in this plan" at the end).

Every finding was traced to code. The 48 reported items collapse into nine root causes. Each workstream below says what's actually broken (file:line), what gets rebuilt so the same class of bug can't recur across maxes, which findings it closes, how it's verified, and what ships it (backend deploy vs iOS OTA).

Suggested order: W1 → W2 → W9 first (they're the reviewer's top three and everything else is judged through the chat), then W3/W4/W5, then W6/W7, then W8.

---

## W1 · One day shape (wake, bed, windows, commitments)

**Root cause.** The day shape lives in six places and they disagree:
- `onboarding.wake_time` (scalar) vs `onboarding.wake_window` / `sleep_window` / `wind_down_window` / `get_ready_window` / `weekly_timings.*` — the chat wake hook (`services/lc_agent.py:368-405`) writes only the scalar; doc-driven schedules read the window (`services/schedule_dsl.py:550`), so they stay at 07:00.
- `user_facts.wake_time` is only written on onboarding save (`api/users.py:893-901`) and *wins* in the coach prompt (`lc_agent.py:633-634`) → "you're waking at 7am".
- `user_schedule_context.wake_time` beats onboarding in `merged_user_state` (`services/user_context_service.py:177-182`), stored raw ("10am").
- The settings sheet hydrates once from the cached user (`DayPlannerScreen.tsx:249-253`), chat never calls `refreshUser`, and any sheet save re-POSTs the whole stale blob (`:533-565`, server replaces it at `api/users.py:877`) → one tap reverts the server to 07:00.
- `build_profile` never reads `wind_down_window`, `get_ready_window` or `preferred_workout_*` (`services/ai_programs.py:304-361`); `workout_time` is a key nothing writes (`:350`) → "post-workout" tasks with no workout.
- No commitment-vs-window validation anywhere; `human_time.life_windows` silently clamps (`services/human_time.py:146-150`).

**Rebuild.**
1. `services/day_shape.py`: one `read(user) -> DayShape` and one `write(user, patch, *, source)` that updates scalar + windows + weekly_timings + `user_facts` + `schedule_preferences`, deletes the context copies, then calls `regenerate_active_schedules`. Every writer routes through it: chat wake/bed hook, `update_schedule_context` tool, planner chat (`api/users.py:1288-1302`), weekly-review confirm (`api/planner.py:1108`), settings sheet save.
2. `POST users/onboarding` becomes a merge, and day-shape keys are server-owned: the client sends only the fields the sheet changed.
3. Every reader uses `day_shape.read`: `build_profile`, `/planner/today` (`api/planner.py:178`), `master_schedule`, `schedulable_anchors`, task guides. Remove context precedence for day-shape keys. Map `preferred_workout_*` → `workout_time`; pass `wind_down_window` and `get_ready_window` into the profile and `ai_fit`.
4. Validation in `write()`: get-ready vs commute vs work overlap → returned as `warnings`, shown in the sheet; sleep window under 7 h → warning on the sheet and in the Sleepmax plan reply.
5. Mobile: `DayPlannerScreen` re-hydrates on focus and after any chat turn that returns `day_shape_changed`.

**Closes.** F5, F8, F10, F12 (times), F13, F19 (wake), F37.
**Verify.** New `scripts/qa_day_shape.py`: change wake via chat → assert `/planner/today`, sheet payload, every active plan's `fit_for`, the Sleepmax light task's `how` and the coach's "what time do I wake" answer all say the new time. Repeat via the sheet. Unit tests for `write()` merge rules and overlap warnings.
**Ships.** Backend deploy + OTA (sheet).

---

## W2 · A coach that only claims what it did

**Root cause.** Reply text is always LLM-written from the *request*, never from a diff of the plan:
- `redo_program_plan` keeps Claude's own `summary` whenever the fit didn't change the habit set (`ai_programs.py:802-812`); no before/after diff reaches the user; no check that the named thing exists ("6am workout").
- `_CHANGE_RE` (`:2340-2344`) misses `simplify`, `pause`, `flight`, `travel`, `budget/minutes` → those fall to the generic agent, which has no pause tool, so "plan paused" is invented. The "never claim updated" guard (`api/chat.py:3523`) only fires on its own heuristics.
- Agent tools resolve names against *today's tasks only* (`lc_agent.py:1542-1629`) or one schedule; `_handle_generic_schedule_modification` adapts *every* active schedule for AI programs (`api/chat.py:4010`).
- The Planner "What should change?" sheet (`api/users.py:1405-1488`) is given wake/sleep/obligations and **no habits**, so "AM skin routine" is "not found in your obligations".
- "Why am I taking D3 at lunch?" is answered by RAG with a one-line program brief and no task guide text (`api/chat.py:2329-2405`, `ai_programs.py:1648-1666`); the suppmax doc says "breakfast stack" (`suppmax.md:209`), hence the contradiction.
- Persona: mobile picker defaults to Clavicular (`ChatConversationsDrawer.tsx:111`) while the backend default is Mediumcore; "Big Daddy" prompt literally says to call the user "champ/my boy" (`services/persona_prompts.py:74-90`); persona preamble wraps even factual answers. "slide it lighter" is hard-coded in `plan_reply` (`ai_programs.py:2324`) whether or not the LevelControl renders.

**Rebuild.**
1. `services/plan_diff.py`: `diff(before, after) -> {added, removed, moved, resized, unchanged}` over habits across **all** active programs. Every mutating path (redo, refit on stack change, sync, W1 writes, tune) stores the diff on the turn and the reply is rendered from it by a deterministic sentence builder. The LLM may add one line of context but gets the diff as its only source of truth; `absent_mentions` extended to reject any claim not in the diff. Empty diff → "nothing changed: …reason".
2. `services/plan_targets.py`: before any change request, resolve named targets (title, alias, catalog id, "the alcohol thing") against the active plans. Unknown target → no mutation, reply lists what *is* in the plan. Used by redo, agent edit/delete tools, planner chat.
3. Intent coverage: extend `_CHANGE_RE`/intent detector with `simplify|lighter|only N minutes` (→ sets `daily_minutes` via W1 and refits all programs with a diff reply), `pause|freeze|trek|away|flight|travel|time zone` (→ honest reply: not supported yet, offers wake/bed retime on return; **no fake pause**), `remove X` (→ target resolver). Unsupported intents never reach a tool that could claim success.
4. Planner "What should change?" sheet: pass the active habits (title/time/program) into the prompt and route habit moves through the same diff pipeline; obligations-only edits stay as they are.
5. "Why / what is …" questions inside a program thread get the task's actual `how`, scheduled time and the library entry in the prompt; RAG answers must not contradict the plan's stored time.
6. Voice: backend default `coaching_tone` = "default" everywhere incl. mobile picker; nickname lines removed from Big Daddy for factual/plan replies (persona affects tone, never adds address terms or pep-talk preambles); persona preamble skipped on the program-thread and knowledge paths; coach names/descriptions ("looksmaxxing-obsessed") flagged for rename — not a code change. The "slide it lighter" sentence is dropped; the LevelControl stays as the affordance. One risk voice: Home footer and coach both say "general wellness, check with a clinician".

7. Knowledge-answer guardrails (F25): when a question names an amount, the answer checks it against the library's ceilings and says so (400 mg caffeine in one sitting = the daily ceiling); absolute claims ("no peptides studied") are rewritten as "not approved, evidence limited"; before any "how much / when" supplement answer, the coach asks about form and current medications if they're not on file; the metformin reply states the real reason (fasting + glucose-lowering meds → see your prescriber) without over-claiming. These rules go in the knowledge prompt and are checked by the claims guard in W7.
8. Response length (F28): the Concise/Medium/Detailed setting is applied on the program-thread and knowledge paths too (today only the agent path reads it); the coach descriptions in the picker are rewritten ("looksmaxxing-obsessed" goes).

**Closes.** F3, F4, F5 (reply), F22, F23, F24, F25, F26, F28, F44, Avni #2, Avni #3.
**Verify.** `scripts/qa_coach_truth.py` personas: nonexistent workout, remove alcohol buffer, simplify to 15 min, pause, flight, move "AM skin routine" from the planner sheet, "why D3 at lunch". Assert each reply's claims ⊆ diff. Unit tests for `plan_diff` and `plan_targets`.
**Ships.** Backend deploy + OTA (picker default, closing line).

---

## W3 · Task guides that know when and how long

**Root cause.** `services/task_guide_service.py`:
- Prompt gets title + description + duration only (`:125-141`); no time, profile, anchors, library entry, no rules against clock times/alarms/shopping/setup.
- Cache key `{maxx}|{title}|{sha(desc)}` (`:580-584`), global across users, never expires, never invalidated; the pre-warm writes dead keys (`:415`). Model's own `duration_minutes` overrides the scheduled one (`:621`).
- `_fix_clock` keeps any clock time matching a profile anchor (`ai_programs.py:1147-1210`) → "8am breakfast", "7am workout"; durations in `how` are never reconciled (`:1320`).
- Products ignore dose (`api/products.py:234-239`, no strength field in `product_catalog.py:54-79`); every melatonin SKU is 3 mg; gear gets attached under "Ingredients".

**Rebuild.**
1. Guide identity = `(catalog_id, scheduled time, duration, anchors hash, how hash, guide_version)`, stored per user. A moved/resized task is a cache miss by construction; plan rebuild and W1 writes also drop the user's guides for affected tasks. Delete the dead pre-warm path or fix its key.
2. Prompt inputs: scheduled time, duration, days, wake/meals/workout from `day_shape`, the library entry (why/how/dose note/timing/avoid-if), the list of other active habits. Rules: only actions doable *at that time*; never a clock time other than the scheduled one; no alarms, no shopping, no "night before" steps (those move to a `setup` block, see W5); step count ≤ duration; supplements say "the serving on your label", name the main cautions, and "ask your clinician if…"; one sentence of *why*.
3. `_fix_clock`: strip "N am workout" when the plan has no workout; reconcile "N minutes" in `how` with the fitted `minutes`.
4. Products: add `strength` to the catalog; pick within the step's range (0.5–3 mg → a 1 mg SKU if present, else say the label), show range vs product honestly; gear products attach only to gear tasks and under "What you'll use".
5. Mobile: guide query keyed on time+duration so a retime refetches.

**Closes.** F2 (text), F14 (text), F17, F18, F19, F20, F26, F29, F41 (label).
**Verify.** Extend `scripts/qa_task_guides.py`: after a wake change and after adding a second max, every guide's clock times ∈ {scheduled time}, duration text == fitted minutes, no shopping/setup verbs in steps, product strength within the step range.
**Ships.** Backend deploy (+ OTA for the query key).

---

## W4 · Feasible schedules

**Root cause.** `services/ai_fit.py`:
- `_frame` treats any time earlier than wake as "after midnight" (`:95-97`, `:123-125`) → with a 10:00 wake, Work 9–5 becomes *tomorrow* and is never avoided. Same wrap bug at read time in `multi_module_collision.py:660`.
- Obligations skipped on weekends (`:115`); a Mon/Wed list applies to all weekdays (`:117-119`).
- Over-budget days shrink the biggest habit on every day with no note (`:619-631`); `fit_notes` reach no UI; a Saturday-only overage shortens daily habits.
- Plan card total is a 7-day average incl. weekly tasks (`ai_programs.py:2295-2297`), frozen in the chat text.
- Evening anchors are fixed offsets from `bed_time`; the wind-down window is ignored (`ai_fit.py:262-265`); screens_off scheduled after wind-down although wind-down step 1 is "put screens away".
- No ordering anchors (`water_on_waking` vs `morning_light` both `anchor: wake`); `frequency` parsed but unused; `weekend` anchor unknown → "cool dark room" Saturday 10:30 weekly.

**Rebuild.**
1. Fit in absolute day minutes; only blocks that genuinely span sleep wrap. Apply obligations on weekends and honor per-day lists. Add the missing test fixtures (work starting before wake).
2. Trims produce a note and a `resized` diff entry (W2) and rewrite `how` durations (W3). Budget shrink considers weekday/weekend separately.
3. Plan card: "weekdays N min · weekends M min" from the same `cost()` the budget uses; card re-renders from the live plan, not the stored text.
4. Evening: wind-down anchored to `wind_down_window.start`; `screens_off` ≤ wind-down start; supplements in the pre-bed block after wind-down starts.
5. Library ordering anchors (`after: water_on_waking`, `first: true`) parsed and enforced; `frequency` → `weeks` / `every_weeks` / `once` for every program (expose in the plan tool); `started_on` set for all programs.

**Closes.** F9, F10 (collision), F11, F12 (order), F14, F15, F38 (bedroom setup).
**Verify.** `tests/test_ai_fit.py` cases: 10:00 wake + 9–5 work → no task inside work unless `WORK_NATIVE`; adding Energymax to Sleepmax → any resize appears in the diff and `how`; totals match sums per day type.
**Ships.** Backend deploy + OTA (card).

---

## W5 · Habit kinds: action, rule, setup, check-in

**Root cause.** Library docs mark rules only in prose ("minutes: 0 / 0 (a rule)", "once in week 1") so the builder, the guide writer and Home all treat a caffeine cutoff, an alcohol rule or a bedroom setup as a daily tick-box with five shopping steps.

**Rebuild.**
1. Add `kind: action | rule | setup | checkin` to every habit in all `ai_programs/*.md`; parse into `Habit`; validate in `parse_program_doc` (missing kind fails the doc test).
2. `rule` → rendered on Home/Planner as a day boundary line ("no caffeine after 4:15 pm"), no tick, 0 min, never counted; still pushes a reminder at its time. `setup` → one `weeks:[1]` task on the first free weekend slot. `checkin` → stays a task. Shopping steps removed from every `how` in the docs (they live in Products).
3. Merge the evening trio: `wind_down` carries `screens_off` as its first step; melatonin stays a separate 1-min task inside the block.

**Closes.** F12 (three tasks), F21, F38, F20 (setup steps).
**Verify.** Doc test asserting every habit has a kind; QA assert Home never shows a `rule` as a checkbox.
**Ships.** Backend deploy + OTA (rule rendering).

---

## W6 · Supplements: consent, screen, cycles, titles

**Root cause.** `ai_programs.py:1497-1518`, `:1704-1774`:
- Cross-program sync adds the program's `primary for` supplement with no confirm; chips are "looks good / move things later / swap a habit".
- `_contraindicated` returns False on an empty screen (`:1455-1463`), unlike the Suppmax quiz's own picker; synonym map lacks seizure/immuno/autoimmune; `supp_current_stack` never read; preview and actual use different answers; Tune deselect is cleared on the next redo (`:2158`).
- No program but Peptidemax sets `weeks`/`started_on`, so "4 weeks then a week off" is only prose in a forever-nightly task.
- `_insert_supps` hardcodes daily (`:1585`); electrolytes anchor "sweaty days" ignored; Tune label = library title, Home title = Claude's title.

**Rebuild.**
1. Sync becomes a proposal: reply chip "add melatonin to Suppmax? here's who shouldn't: …" → yes/no. No add without yes; declined is sticky across redo and Tune.
2. Sync requires a completed Suppmax safety screen; if missing, ask the screen questions (pregnancy/breastfeeding, conditions, meds, age) in-thread first, reusing `age_band`/`sex`.
3. `_contraindicated` → structured tags: quiz options map to avoid-if tags; "other daily meds" blocks anything with a med interaction; current stack respected; preview == actual.
4. `frequency` → `weeks`/`every_weeks` (melatonin 4 on / 1 off then review, collagen 12-wk trial); `started_on` for all programs; electrolytes days = trainmax session days or 2–3×/week, never after 19:00.
5. One title: the library title everywhere (Tune, Home, Planner, chat card); Claude may not retitle library habits.
6. Age/health screen before *any* supplement is scheduled (covers F7 for the supplement path).

**Closes.** F1, F2 (protocol), F7, F18 (days), F29 (pick), F36 (labels).
**Verify.** `tests/test_supp_sync.py` rewritten: empty screen → nothing added; pregnant → nothing with a pregnancy avoid-if; decline persists; weeks expand correctly. QA persona starting Sleepmax while on Suppmax.
**Ships.** Backend deploy.

---

## W7 · Reuse answers across maxes, never state what wasn't said

**Root cause.** `services/program_quiz.py:28-30` shares only `age_band`. Sleepmax `caffeine_last_time` = "before noon" is unknown to Energymax, which asks about caffeine again and sets a 16:15 cutoff from bed−8h. The plan summary is free LLM text ("working late into the night on short sleep") with no check against the answers.

**Rebuild.**
1. Shared facts registry: caffeine (last time + amount), alcohol, screens before bed, sitting hours, workout days/time, first-meal style. Stored in `about`; any program's question whose fact is known is skipped; the Energymax cutoff never later than the Sleepmax answer.
2. Summary claims check: a `stated_facts` guard (like `absent_mentions`) rejects summaries asserting a fact not present in answers/profile; regenerate with the violation named, else fall back to `plain_summary`.
3. Sleepmax opener "I already know your day" is only shown when wake/bed/meals are in fact known.

**Closes.** F6, F32, F33.
**Verify.** QA: Sleepmax then Energymax → caffeine asked once, cutoff ≤ noon; summary contains no sleep-length claim.
**Ships.** Backend deploy.

---

## W8 · Mobile reliability and polish

Findings and fixes (all `mobile/`):
- **F27 sends.** NetInfo is installed but unused (`package.json:23`); failed messages are queued and replayed on every foreground, each replay adding a new bubble (`MaxChatScreen.tsx:803-805`, `:940-972`, `:785-789`). Fix: wire NetInfo to `onlineManager`; distinct copy for offline vs server; failed user bubble gets a "Retry" affordance; replay at most once, only on reconnect, never adds a bubble; dedupe by `clientTurnId`. *Check the shipped binary includes the NetInfo native module before relying on it; otherwise use a `/health` probe.*
- **F34 chips** gate on the same `reveal` state as `MessageBlocks` (`:1758`, `:1484`).
- **F35 achievements** suppressed while chat is loading/streaming or a plan card is pending (`AchievementCelebrationHost.tsx:26-36`).
- **Avni keyboard**: `keyboardDismissMode="on-drag"` on the chat list (`:1645`).
- **F40** Home card title 2 lines + duration; one time formatter (`formatTimeTo12Hour`) applied to times in chat replies (backend emits `HH:MM`, client renders).
- **F41** task sheet uses sheet-relative insets; Home header gets a fixed backdrop so scrolled content never sits under the status bar.
- **F42** planner grid: block labels never drawn into the hour gutter; morning clusters don't push block labels.
- **F43** day counter anchored to the first active plan day; "First Steps" earned on first *completed* task (XP rule in `achievements.py:54-56`).
- **F39** "maxxes" → "maxes" (`achievements.py:88`) and consistent product name.
- **F31** Explore: one subtitle under "Included" ("part of your subscription") and the Creator tab copy checked against what exists.
- **F29** the guide's product card gets an "other options" link into the Products tab (the ≥4 alternatives already exist there); dose match is W3.
- **Avni slow planner**: prefetch `googleStatus`, don't gate `plannerToday` on it, calendar sync in the background without a second refetch; move badge/streak evaluation off `/active/full`'s hot path (`api/schedules.py:167-190`).

**Ships.** OTA ×6 runtimes (+ backend for F43/F39/perf).

---

## W9 · Regression harness (ship gate)

`scripts/qa_beta1.py` runs the personas above end-to-end through the real chat on the local backend and fails on any violation: wake-change consistency across five surfaces, nonexistent-entity refusal, pause/flight honesty, remove/simplify diffs, second-max resize notice and totals, work-hours avoidance, supplement consent, shared caffeine, no shopping/clock text in guides. Run before every deploy, like `qa_peptide_check.py`.

---

## Coverage, item by item
Every finding maps to a workstream: F1 W6 · F2 W3+W6 · F3 W2 · F4 W2 · F5 W1+W2 · F6 W7 · F7 W6 · F8 W1 · F9 W4 · F10 W1+W4 · F11 W4 · F12 W1+W4+W5 · F13 W1 · F14 W3+W4 · F15 W4 · F17 W3 · F18 W3+W6 · F19 W1+W3+W5 · F20 W3+W5 · F21 W5+W7 · F22 W2 · F23 W2 · F24 W2 · F25 W2 · F26 W2 · F27 W8 · F28 W2 · F29 W3+W8 · F31 W8 · F32 W7 · F33 W7 · F34 W8 · F35 W8 · F36 W6 (labels) · F37 W1 · F38 W5 · F39 W8 · F40 W8 · F41 W8 · F42 W8 · F43 W8 · F44 W2 · Avni 1 (load) W8 · Avni 2 W2 · Avni keyboard W8 · Avni 3 W2.

Fixed as honesty, not as a feature: F3 (pause) and F22 (flights) — the coach will say plainly it can't pause or re-zone a plan and offer the wake/bed retime instead; it will never again claim a pause or move tasks blindly. A real pause/travel mode is a feature and is not in scope.

## Not in this plan
- **F16** secondary Google calendars — a feature; untested by the reviewer.
- **F30** Amazon page with a sponsored ad — Amazon's page; our links carry no affiliate tag, so no disclosure is required. Price display on cards is a feature.
- **F36** Tune can only remove — stays remove-only; chat and the planner are the editors. Its labels are fixed (W6).
- **F45** accessibility declaration — an App Store Connect form, not code; needs you.
- Store-listing leftovers ("chad"/"chadlite") and coach name rights (Goggins) — ASC / your call; the in-app coach descriptions are rewritten (W2).
- Friends/accountability, wearables, labs, outcome tracking, experiment mode, pause/travel mode — features.

# RALPH_PERSONALIZE.md — make the whole system feel personal, tastefully

## Mission
Make maxapp feel like it *knows* the user, in a way they'd enjoy — warm, relevant, value-aligned —
**never** in a way that feels watched, naggy, or creepy. This is a surfacing-and-taste pass, not a
new ML system. We collect a lot of signal already and barely use the *positive* parts; and several
warm touches are literally dead code. Light it up, carefully.

## Taste philosophy (the bar every change is held to)
- **Sound like a human who's got your back — not an AI assistant.** Every personalized line should
  read like a real coach/friend who *remembers what you told them and what you did, and holds you to
  it*. Reference the specific thing ("you said summer; that's 7 weeks") the way a person texting you
  would. BANNED: "As an AI", "I've updated your preferences", "Here is your personalized…", hollow
  affirmations ("Great job!", "You're doing amazing!"), and any robotic, customer-support cadence.
  Accountability with warmth: it notices, it remembers, it nudges — it never nags or fawns. When in
  doubt, write it the way a sharp friend who actually cares would say it out loud.
- **Known, not watched.** Use only data the user gave us or earned (name, goals, the "why" behind
  them, chosen coach persona, streak, active maxes, scan archetype). Never infer-and-reveal.
- **Positive framing only.** Strengths / values / motivations / wins — yes. Inferred weaknesses
  (`personality.to_improve`), conditions, injuries, medications — **never** surfaced in copy.
- **Quiet, not loud.** A warm greeting, an order that fits their goals, a value-aligned reframe — not
  "WE KNOW YOU SKIPPED SKINCARE." No fake urgency, no guilt, no FOMO.
- **Degrade gracefully.** Cold start (no name/goals/scan) must look exactly like today, never broken.
- **Correctable + honest.** Don't fabricate. If a signal is absent, fall back to the generic copy.

## What ALREADY exists — do NOT rebuild (verified)
- **Coach personas** Goggins=`hardcore`, Clavicular=`influencer`, Big Daddy=`gentle`, plus `default`
  — live in `services/persona_prompts.py`, applied to chat (`lc_agent.py`, `fast_rag_answer.py`) AND
  notifications (`services/persona_notifications.py`), with locked tests (`tests/test_persona_voices.py`).
- **Notifications** are already templated + persona-aware + signal-rich (`name/task/streak/why/plan/count`
  slots) with a strict taste bar + `copy_filter.py`, kill switch, adaptive backoff, channel dedup,
  and locked tests (`test_notifications_v2.py`, `test_copy_filter.py`, `test_server_copy_voice.py`).
- **Personalization brief** (`services/personalization.py` `build_personalization_brief`) already
  injects an 11-dimension profile into chat/RAG; the scheduler already uses wake/sleep/diet/culture
  and `UserLearnedPrefs` (learned wake/sleep/workout window) override stated times.
- **Already-personalized screens:** Today, Profile, FaceScanResults (rich); Home/Planner (partial).

## GUARDRAILS — non-negotiable (this is the "don't mess anything up" contract)
1. **Additive + flag-gated.** Client touches behind a single flag `personalizedUI` in
   `constants/featureFlags.ts`. Riskier backend/scheduler/notification phases behind their own flag,
   **default OFF** until tests pass.
2. **Cold-start identical.** With no signals, every surface renders byte-identical to today.
3. **Never feed constraints to copy.** `constraints.{conditions,injuries,medications}` may only
   *exclude* tasks (existing eligibility path). Never into chat copy, notification copy, or UI.
4. **Never surface inferred negatives.** `personality.to_improve`, mood inferences, Onairos
   `misc.signals` of unknown category — stay out of all user-facing copy.
5. **Notification system is sacred.** Any copy change MUST pass `passes_taste_bar()` +
   `filter_outbound_copy()`, must be deterministic (no LLM at send), must NOT change cadence
   (cap / interval / backoff / channel dedup), and must keep all notification tests green.
6. **No new sensitive logging.** Personal values fill into copy the user sees; never log them
   separately. Keep the UUID-only logging model.
7. **No behavioral surveillance.** No "you skipped X on Mondays" tracking, no sensitive inference.
8. **No new native deps.** Pure TS/JS + existing libs on mobile; pure Python on backend.
9. **Keep every existing test green;** add a focused test per new surface.

---

## Phase 0 — One safe client personalization source
Add `mobile/hooks/usePersonalization.ts` exposing only **safe, derived** values from `AuthContext`:
`firstName`, `greeting` (time-of-day), `personaId` (`coaching_tone`), `primaryGoalLabel`,
`goalLabels[]`, `topValue`/`topMotivation` (only if explicitly present), `archetype`, `streakDays`,
`experienceLevel`. All optional; everything falls back to undefined → generic.

Add `mobile/lib/toneCopy.ts`: `toneCopy(personaId, { gentle, hardcore, influencer, default })` →
returns the matching string (deterministic, pure). This is how on-screen microcopy gets persona
flavor without touching the backend persona system. Unit-test both.

## Phase 1 — Tasteful client surfaces (low risk, behind `personalizedUI`)
1. **Home greeting (dead-code fix).** `HomeScreen.tsx` already computes `greetingForHour()` + a
   username and never renders them. Render "Good morning, {firstName}" as a quiet serif line atop
   the day counter. Fall back to "Good morning" with no name.
2. **Goal-ranked Explore.** In `MarketplaceScreen.tsx`, reorder the suggested carousel + grid so
   items matching `onboarding.goals` come first. **Reorder only — never hide anything.** Stable sort,
   deterministic. No "for you" label needed; it just feels right.
3. **Experience-level planner chips.** Swap the static `SUGGESTIONS` in `DayPlannerScreen.tsx` for a
   set chosen by `experienceLevel` (beginner → "Set a wake time"; advanced → "Add a workout").
   Unknown level → today's four chips.
4. **Streak milestone micro-celebration.** At 3/7/30/100 days, a subtle inline callout under the
   streak (Profile/Today) — `toneCopy`-flavored, one line, no modal, shows once per threshold.
5. **Scan archetype one-liner.** On FaceScanResults, when `facial_scan_summary.archetype` exists, add
   a short plain-language line tying the score to *their* archetype. Factual; no new claims.
6. **Goal-aware empty states.** Home's "Browse maxes in Explore" empty state references their top
   goal when present ("Ready to start on {goal}? Explore has a plan.").

## Phase 2 — Backend: put the underused POSITIVE signals to work (behind `personalizedFraming`, default OFF)
The brief already contains goal `why`/`timeline`, `values`, `motivations`, `interests` — the model is
just never told to *use* them. Strengthen the brief header guidance (`build_personalization_brief`)
with explicit lines: (a) speak like a human who remembers and holds them accountable — reference what
they told you and what they actually did, never sound like an AI assistant or recite a profile;
(b) tie motivation to their stated values / why / deadline; (c) let their stated interests color
examples — **and never invent any of it.** This is the single highest-taste backend win and it is
purely additive guidance. Add a test asserting the guidance string is present and that
a sample brief with values/why still assembles. Do NOT change what data is collected.

## Phase 3 — Scheduler: fit their real life (behind `commuteAwarePlacement`, default OFF, higher risk)
`commute_minutes` / commute windows are stored but the scheduler ignores them. When present, avoid
placing hands-on tasks (skincare, workouts) inside commute windows and prefer travel-friendly slots
around them. Bounded, additive, flag-gated; add a deterministic scheduler test. If this proves
fiddly, ship Phases 0–2 and leave this OFF — do not force it.

## Phase 4 — Notifications: warmer, same safety (behind `personalizedNotifCopy`, default OFF)
Add a few NEW template variants that reference the user's `why` / active max warmly (the `{why}`/
`{plan}` slots already exist). Every new template must pass `passes_taste_bar()` at import and ship
with tests; cadence/rules unchanged. This is optional polish — the notif system is already strong.

---

## Success criteria
- **RC1** `usePersonalization` + `toneCopy` exist, are pure/deterministic, unit-tested, used by ≥3 surfaces.
- **RC2** Home renders a name+time greeting; with no name it falls back cleanly (no "undefined").
- **RC3** Explore is reordered by goals (reorder only — every item still present); deterministic; tested.
- **RC4** Planner chips adapt to `experienceLevel`; unknown → current four.
- **RC5** Streak milestone callout appears at 3/7/30/100 once each; never on non-milestones.
- **RC6** Scan archetype line shows only when archetype present; factual.
- **RC7** All Phase-1 surfaces are byte-identical to today when their data is absent (cold-start proof).
- **RC8** Brief header guidance updated (Phase 2) with a test; chat assembly still passes.
- **RC9** `personalizedUI` (default ON) gates Phase 1; Phases 2–4 behind their own flags **default OFF**.
- **RC10** Every existing test stays green: `test_persona_voices`, `test_notifications_v2`,
  `test_copy_filter`, `test_server_copy_voice`, personalization/scheduler tests. New tests added per surface.
- **RC11** No constraints/injuries/meds and no inferred-negative signal reaches any user-facing copy (grep-proof + test).
- **RC12** Personalized copy reads like a human accountability partner, never an AI assistant: a test
  asserts the banned robotic phrasings ("as an ai", "i've updated your preferences", "here is your
  personalized", hollow "great job") never appear in generated personalization/brief copy, and the
  brief guidance carries the human-voice instruction.

## Out of scope / do NOT
- No eval/telemetry harness here (separate spec). No new ML, no embeddings, no new data collection.
- No notification cadence changes. No new persona types. No native deps. No fabricated facts.
- Don't re-implement the persona system or the brief — extend, don't replace.

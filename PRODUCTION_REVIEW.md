# Production Readiness Review — maxapp (final gate before publishing)

This file is the **single source of truth** for the production review loop. Every
iteration reads it top-to-bottom, does the **next unchecked item**, verifies it,
checks it off with a one-line note, and commits. Do NOT restart from scratch —
your previous work persists here and in git.

---

## GOAL

Walk the entire app, exercise every screen and core flow, and make the app
**ready for the App Store**. Find and fix real bugs; flag (don't guess) anything
that needs a human decision. The trigger for this review: on the Home screen
("DAY 1 / 365") **nothing was tappable** — treat the whole app as unverified
until proven working on a real simulator.

## COMPLETION CRITERIA (all must be true before emitting the promise)

1. The Home-screen "nothing is tappable" P0 is reproduced, root-caused, fixed,
   and re-verified on the booted simulator (a tap on Home now registers).
2. Every screen in the **Screen Walk** checklist below is reached on the
   simulator and renders without a redbox/crash; every primary CTA on it does
   something sensible (navigates, opens, submits, or shows a clear state).
3. `npx tsc --noEmit` (in `mobile/`) passes, or every remaining error is listed
   under "Accepted / Deferred" with justification.
4. The Maestro smoke flows pass (`smoke_launch`, `smoke_no_redbox`,
   `home_dashboard_render`, plus any new repro flows you add). Document any
   flow that can't run and why.
5. Every item below is either `[x]` done or moved to "Accepted / Deferred" with
   a reason. No silent skips.

When (and only when) all of the above hold, output exactly:

`<promise>PRODUCTION REVIEW COMPLETE</promise>`

---

## OPERATING PROTOCOL (do this every iteration)

1. **Read this file.** Find the first unchecked `[ ]` item in priority order
   (P0 blockers → Screen Walk → Cross-cutting → Polish).
2. **Do exactly one meaningful unit of work** (one bug, one screen, one check).
   Don't sprawl across ten things in one pass.
3. **Verify on the simulator** (see Environment). Prefer Maestro for anything
   repeatable; use the booted simulator + `xcrun simctl`/computer-use to observe
   when Maestro can't express the assertion. A fix is not "done" until observed
   working — no "should work."
4. **Update this file**: check the box, append a dated one-line result, and add
   any newly discovered issue to the right section (so nothing is lost).
5. **Commit** the change on the current branch with a clear message
   (`prod-review: <what>`), and push. One logical change per commit.
6. Try to stop. The loop will re-feed you this task; pick up the next item.

### Rules of engagement
- **Fix** clear, low-risk bugs (touch handling, broken nav, crash on mount,
  missing empty/error/loading state, obvious copy/typo, dead button).
- **Flag, don't guess** anything needing product/business judgment, anything
  destructive (data deletion, account changes), money/IAP wiring changes, or
  anything that would change pricing/legal copy. Add it under "Needs Human
  Decision" with full context.
- **Never** weaken security: do not disable the production paywall guards,
  expose dev bypasses in prod (`__DEV__` gating must stay), or commit secrets.
- Keep diffs surgical and in the app's existing style.
- If blocked (sim won't boot, Metro down, native module missing), record the
  blocker, do what static analysis you can, and move to the next item.

---

## ENVIRONMENT

- Repo: `/Users/home/maxapp` — app code in `mobile/`. App id: **`com.cannon.mobile`**.
- Booted sim: iPhone 17 Pro (check `xcrun simctl list devices booted`).
- Metro: start with `npx expo start` in `mobile/` (run in background) if a JS
  bundle is needed; the installed build is a dev client.
- Maestro: `~/.maestro/bin/maestro` (v2.6.1). Flows live in `mobile/maestro/*.yaml`.
  Run one: `maestro test mobile/maestro/<flow>.yaml`. Add new repro flows there.
- Typecheck: `cd mobile && npx tsc --noEmit`.
- Tests: backend tests exist (see memory `maxapp_test_suite`); pre-existing
  failures there are out of scope unless they touch a flow you're verifying.

---

## P0 — BLOCKERS (must fix first)

- [~] **Home screen: nothing tappable.** Reproduce on sim: launch → reach Home
  (paid, Day 1) → tap a day pill / the top-right avatar / "Explore has a plan".
  Confirm taps are dead, then root-cause between the two strongest suspects and
  fix the real one:
  - (a) `TabBarFrost` background swallowing touch — outer `View`/`BlurView` in
    `mobile/navigation/TabNavigator.tsx:124` lacked `pointerEvents="none"`.
    **PARTIAL FIX APPLIED 2026-06-26**: added `pointerEvents="none"` to both.
    This only covers the ~90px tab bar, so it likely is NOT the whole-page cause.
  - (b) **Auto-start SpotlightTour backdrop (PRIME SUSPECT).** `TourTrigger`
    (`TabNavigator.tsx:292`) calls `start()` 600ms after mount for any paid user
    whose onboarding lacks `main_app_tour_completed` / has no
    `post_subscription_onboarding` — i.e. exactly a Day-1 user. `react-native-
    spotlight-tour`'s `SpotlightTourProvider` (line 428) renders a full-screen
    backdrop (`overlayColor="black"`, `nativeDriver={false}`) that captures every
    touch outside the highlighted step. If the highlight/tooltip fails to render
    (AttachStep target not measured, etc.) you get an invisible screen-wide touch
    trap with no visible dimming — matching the report exactly.
    → Verify whether the tour is active on the dead screen (add a temp log in
    `TourTrigger`/onStop, or check `user.onboarding`). If it's the cause, fix so
    the tour either renders correctly or doesn't trap touches (e.g. guard
    `start()` until steps' targets are mounted, ensure `onBackdropPress`
    advances/【dismisses】 reliably, or gate the auto-start behind a flag).
  - Re-verify: after the fix, a Maestro flow that taps a Home element must
    succeed. Add `mobile/maestro/home_tap_regression.yaml`.
- [ ] Confirm there is no OTHER global full-screen overlay mounted at App root
  (celebration host, dust/particle layer, coachmark) leaking touch capture on
  any tab. Grep `absoluteFill`, `position: 'absolute'`, `<Modal`, `pointerEvents`
  across `mobile/` and verify each full-screen layer either is `pointerEvents="none"`
  or intentionally interactive.

## P1 — SCREEN WALK (reach each on the sim; render + primary CTA works)

Bottom tabs (newNav flag ON → Today/Explore/Scan/Coach/You; OFF → Home/Planner/
Scan/Explore/Chat). Verify whichever set the production flag config ships.

- [ ] Home / Today (`screens/home/HomeScreen.tsx`, `screens/today/TodayScreen.tsx`,
      `screens/courses/MasterScheduleScreen.tsx`) — day strip, habits list,
      empty state, start-a-program CTA.
- [ ] Planner (`screens/profile/DayPlannerScreen.tsx`) — timeline,
      direct-manipulation edits, add/move blocks.
- [ ] Scan center button → FaceScan (`screens/.../FaceScan*`) — camera permission
      prompt, capture, results, archive. Respect free vs premium gating.
- [ ] Explore / Marketplace (`screens/marketplace/MarketplaceScreen.tsx`,
      `MaxDetailScreen.tsx`, `MaxxDetailScreen.tsx`) — cards, detail, start program.
- [ ] Chat / Coach (`screens/chat/MaxChatScreen.tsx`) — entry, send a message,
      receive a reply, error/offline state.
- [ ] You / Profile (`screens/you/YouScreen.tsx`, `screens/profile/*`) — stats,
      face score, achievements strip, edit personal, personalization.
- [ ] Settings (`screens/.../Settings*`) — every row; LegalDocument (terms,
      privacy) opens; delete-account modal; manage subscription.
- [ ] Achievements / Progress / Archives screens.
- [ ] Course / curriculum: CourseList, CourseDetail, ChapterView, TaskGuide
      (modal vertical pager), Fitmax suite.
- [ ] Notifications / SMS coaching setup screens.

## P1 — CORE FLOWS (end-to-end on sim)

- [ ] Auth: signup validation, login success, forgot-password.
- [ ] Onboarding (v2) → RoutineReveal → FeaturesIntro → FaceScan → Paywall.
- [ ] Paywall / Payment (`screens/payment/PaymentScreen.tsx`): plan toggle,
      referral field, CTA, Restore. **Prod paywall guards must stay intact**
      (no unpaid bypass; `__DEV__`-only Skip). Verify the new light hero renders.
- [ ] Post-pay redirect → FaceScanResults → main app + main-app tour.

## P2 — CROSS-CUTTING PRODUCTION CHECKS

- [ ] `npx tsc --noEmit` clean (or deferred list).
- [ ] App launches with no redbox (`smoke_no_redbox.yaml`); no console errors on
      each tab's first render.
- [ ] Every screen has sane empty / loading / error states (no infinite spinners,
      no raw error objects shown to users).
- [ ] Offline / flaky-network behavior is graceful (resilience layer is in place —
      verify it actually catches failures on the walked screens).
- [ ] No secrets / API keys committed in `mobile/`; no `console.log` of PII; dev
      bypasses are `__DEV__`-gated.
- [ ] Permissions (camera, notifications) have proper usage strings + graceful
      denial handling.
- [ ] Accessibility labels on icon-only buttons; key interactive elements have
      `testID`s (extend coverage where Maestro can't target).
- [ ] Feature flags: confirm the **production** flag values (newNav, todayV2,
      faceScan, onboardingV2, …) match what should ship, and the OFF/ON paths
      both render without dead tabs.
- [ ] No obvious perf cliffs (giant un-virtualized lists, heavy work on mount).

## P3 — POLISH

- [ ] Copy/typo sweep on user-facing strings of walked screens.
- [ ] Consistent theming (the flat ink/cream "Craft" aesthetic) — no leftover
      dark-on-dark or stray glass-redo remnants.
- [ ] Loading skeletons vs spinners consistency.

---

## NEEDS HUMAN DECISION (flag here; do NOT act)
- (none yet)

## ACCEPTED / DEFERRED (with reason)
- (none yet)

## ITERATION LOG (newest last — one line each)
- 2026-06-26: Seeded review. Applied `pointerEvents="none"` to TabBarFrost
  (TabNavigator.tsx) as partial P0 fix; SpotlightTour auto-start flagged as prime
  suspect for the whole-page dead-touch bug — needs sim repro next.

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
  **GOTCHA (iter 3):** never run two Maestro sessions at once — a stray/hung
  `maestro` process collides on the device driver and makes EVERY later run flaky
  (random `tapOn`/`assertVisible` failures, even logging the app out). Before each
  run: `pkill -f maestro` and confirm none remain. The app restores the
  last-active tab on launch, so tap "Home" explicitly — don't assume Home.
- Typecheck: `cd mobile && npx tsc --noEmit`.
- Tests: backend tests exist (see memory `maxapp_test_suite`); pre-existing
  failures there are out of scope unless they touch a flow you're verifying.

---

## P0 — BLOCKERS (must fix first)

### ✅ ROOT CAUSE FOUND & FIXED (2026-06-26)
The dead-touch bug is the **auto-firing main-app tour**, and it **ships in
production**: `newNav: false` (mobile/constants/featureFlags.ts:18) → the OLD nav
path runs, which is the ONLY path that mounts `SpotlightTourProvider` + `TourTrigger`
(TabNavigator.tsx:426-548). `TourTrigger` calls `start()` ~600ms after mount for
every paid user without `main_app_tour_completed` — i.e. every fresh Day-1 user.
The tour defined **6 steps but only 5 anchors**: `TOUR_STEP.PLANNER_TAB` (index 3)
had NO `<AttachStep index={3}>` anywhere (verified by grep — only 0,1,2,4,5 exist).
When react-native-spotlight-tour advances to a step whose anchor isn't mounted it
wedges into a full-screen backdrop that swallows every touch with no visible
dimming — exactly the report.
**FIX (mobile/features/mainTour/mainTourSteps.tsx):** removed the orphan
PLANNER_TAB step and reindexed EXPLORE_TAB→3, CHAT_TAB→4 (tab anchors reference
the constants by name, so they stay correct & contiguous); folded the Planner
copy into the Schedule step. Now steps(5) == anchors(0-4), no wedge possible.
Added a header comment documenting the anchor↔step invariant.
**Verified:** Maestro `home_tap_regression.yaml` — launch → assert HABITS → tap
avatar → navigates to Profile (tap registers). Note: the live wedge could NOT be
reproduced on the test device because its account ("Demo User") already has
`main_app_tour_completed=true`; structural cause is removed by code. See residual
item below to confirm the tour itself runs clean on a fresh account.

- [x] **Home screen: nothing tappable.** Reproduce on sim: launch → reach Home
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
- [x] Confirm there is no OTHER global full-screen overlay mounted at App root
  leaking touch capture. **2026-06-26 (iter 2): audited — clear.** The complete
  set of persistently-mounted overlays: (1) SpotlightTour — was the bug, fixed;
  (2) `AchievementCelebrationHost`→`CelebrationOverlay` (RootNavigator.tsx:212,
  gated by `treatAsFull`) returns `null` when its queue is empty and is a
  self-dismissing `<Modal>` (Pressable backdrop → next) when active —
  CelebrationOverlay.tsx:152; (3) `InAppAlertHost` (App.tsx:396) returns `null`
  when idle, `<Modal>` when active — InAppAlert.tsx:227; (4) `DevDrawer`
  (`__DEV__`-only, Modal). None lays down an idle touch-capturing layer.

## P1 — SCREEN WALK (reach each on the sim; render + primary CTA works)

Bottom tabs (newNav flag ON → Today/Explore/Scan/Coach/You; OFF → Home/Planner/
Scan/Explore/Chat). Verify whichever set the production flag config ships.

- [x] Home (`screens/home/HomeScreen.tsx`) — **render-verified on sim 2026-06-26
      (iter 3)**: day strip, HABITS list, empty state ("No habits… Start a
      program"), personalized "Ready to start on Fitmax? Explore has a plan" CTA.
      Launches clean with NO tour wedge (P0 fix holds on the normal path).
- [ ] Planner (`screens/profile/DayPlannerScreen.tsx`) — timeline,
      direct-manipulation edits, add/move blocks. (iter 3: navigation blocked by a
      stray-maestro collision; resume next pass — harness now fixed.)
- [x] Scan center button → FaceScan results — **render-verified on sim 2026-06-26**:
      FaceScanResults postPay reveal renders (Rating/Appeal/Potential rings,
      "Get started"). Still TODO: camera permission prompt + capture flow; free vs
      premium gating.
- [~] Explore / Marketplace — **mounts & renders its loading state on sim
      2026-06-26 (iter 4)** ("Loading Explore" spinner). Confirm content load +
      card detail + start-program next pass.
- [x] Chat / Coach (`screens/chat/MaxChatScreen.tsx`) — **render-verified on sim
      2026-06-26**: "What can I help with?", suggestion chips (Build my plan / skin
      / Rate my routine), "Ask Max anything" composer. TODO: send a real message +
      reply + error/offline state.
- [~] You / Profile (`screens/profile/*`) — **Profile render-verified on sim
      2026-06-26** (Your Maxes, Weekly Progress, Progress calendar, Trophy Case).
      Edit/Personalization sub-screens still TODO.
- [ ] Settings (`screens/.../Settings*`) — every row; LegalDocument; delete-account
      modal; manage subscription. (iter 3: pending.)
- [ ] Achievements / Progress / Archives screens.
- [ ] Course / curriculum: CourseList, CourseDetail, ChapterView, TaskGuide
      (modal vertical pager), Fitmax suite.
- [ ] Notifications / SMS coaching setup screens.

## P1 — CORE FLOWS (end-to-end on sim)

- [~] Auth: signup validation, login success, forgot-password. **Login screen
      render-verified on sim 2026-06-26** (email/username, password w/ reveal,
      Forgot password, Continue, Google + Apple, "create account"). Functional
      login/signup submit still TODO.
- [ ] Onboarding (v2) → RoutineReveal → FeaturesIntro → FaceScan → Paywall.
- [ ] Paywall / Payment (`screens/payment/PaymentScreen.tsx`): plan toggle,
      referral field, CTA, Restore. **Prod paywall guards must stay intact**
      (no unpaid bypass; `__DEV__`-only Skip). Verify the new light hero renders.
- [ ] Post-pay redirect → FaceScanResults → main app + main-app tour.

## P2 — CROSS-CUTTING PRODUCTION CHECKS

- [~] `npx tsc --noEmit` clean (or deferred list). **2026-06-26: 3 pre-existing
  errors found (NOT from this review), to fix or delete:**
  - `components/glass/GlassCard.tsx:38` — Tamagui `backgroundColor` prop invalid
    (glass-redo remnant; the app moved to the flat "Craft" aesthetic — check if
    GlassCard/Tamagui are still used anywhere; if dead, remove).
  - `tamagui.config.ts:21` — `tokens.color` missing (same glass-redo remnant).
  - `screens/profile/ProfileScreen.tsx:696` — ✅ FIXED 2026-06-26 (iter 4): the
    Chad-Lite note read `p.chadliteNote` but the style lives in the `styles`
    sheet → it was rendering UNSTYLED on the live Profile screen. Repointed to
    `styles.chadliteNote`; tsc confirms the error is gone.
  - **NOTE: `tsc` total is 9 errors (all pre-existing, none from this review).**
    Beyond GlassCard/tamagui above, ~6 more remain (mostly the glass/Tamagui
    `todayV2`-gated path). Enumerate + clear (or delete the dead glass path) in a
    focused pass; a non-compiling tsc shouldn't ship.
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
- **Confirm the main-app tour runs clean on a fresh Day-1 account.** The orphan-
  step wedge (P0) is fixed structurally, but the exact dead-touch state couldn't
  be reproduced here because the test account already completed the tour. On a
  fresh paid account (tour-eligible), confirm: tour auto-starts, steps 1→5 each
  show a tooltip over the right element, Skip/Next/Done all work, and the app is
  fully tappable afterward. (Backend exposes only `/main-app-tour/complete`, no
  reset, so a fresh account or a DB flag flip is needed to retest.)

## ACCEPTED / DEFERRED (with reason)
- (none yet)

## ITERATION LOG (newest last — one line each)
- 2026-06-26: Seeded review. Applied `pointerEvents="none"` to TabBarFrost
  (TabNavigator.tsx) as partial P0 fix; SpotlightTour auto-start flagged as prime
  suspect for the whole-page dead-touch bug — needs sim repro next.
- 2026-06-26 (iter 1): **P0 root-caused & fixed.** Confirmed newNav=false ships →
  tour runs in prod; tour had 6 steps but only 5 anchors (PLANNER_TAB idx 3
  orphan) → wedges the full-screen backdrop = dead touches. Removed the orphan
  step + reindexed (mainTourSteps.tsx); tour now 5 steps all anchored. Added
  home_tap_regression.yaml; verified launch→assert HABITS→tap avatar→Profile
  (taps register). tsc clean for the change (3 unrelated pre-existing errors
  logged under P2). Live tour-wedge repro deferred to a tour-eligible account
  (logged under Needs Human Decision).
- 2026-06-26 (iter 2): **P0 overlay audit — clear.** Verified the only globally
  mounted overlays (celebration host, in-app alert host, dev drawer) all render
  `null` when idle / are self-dismissing Modals; none traps touches. P0 section
  now fully resolved. Next: P1 screen walk.
- 2026-06-26 (iter 3): **P1 screen walk — first pass.** Added
  prod_screen_walk.yaml. Render-verified on the sim: Home, Chat, Profile, Scan
  results, Login — all render cleanly; tab-restore works; Home launch shows NO
  tour wedge (P0 fix holds). Diagnosed & killed a hung iteration-1 maestro
  process that had been colliding with every run (root of the flaky failures) —
  documented the gotcha. Remaining: Planner, Explore, Settings + functional
  (not just render) checks — resume next pass.
- 2026-06-26 (iter 4): Fixed ProfileScreen Chad-Lite note (was rendering
  unstyled — `p.` vs `styles.` sheet mixup); tsc confirms resolved. Found tsc
  total is 9 pre-existing errors (logged under P2). Env note: the Expo dev client
  dropped to its launcher mid-walk (lost bundle) — recovered by terminate+launch
  com.cannon.mobile (Metro still up on :8081); app back in the paid account,
  Explore tab mounts ("Loading Explore"). Screen-walk env is fragile under
  repeated relaunches — drive deliberately, one Maestro session at a time.

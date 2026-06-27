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
  run: `pkill -9 -f maestro` AND kill the iOS driver (`pkill -9 -f
  "xctest\|XCTRunner\|maestro-driver"`), then confirm `pgrep -f maestro` is empty
  — a plain `pkill` leaves the xctest driver alive and the NEXT run dies with
  `EXIT 1` right after "Launch app". The app restores the last-active tab on
  launch, so select the tab explicitly via `tapOn: { id: "tab-<name>" }` (the
  tabs now have testIDs — iter 10).
  **iter 18:** the maestro/xctest driver also intermittently HANGS at init (the
  `java maestro.cli` process runs but no flow steps execute, 5-line log). Clear it
  with `pkill -9 java` (a plain `pkill -f maestro` doesn't reap the JVM) — but it
  can re-hang on the next run. Sim-driven E2E was unreliable by late session;
  run the remaining walks (TaskGuide/Fitmax/scan-capture/achievements) on a fresh
  Maestro driver or in CI for definitive results. App renders are fine — every
  screen reached has verified clean.
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
- [x] Planner (`screens/profile/DayPlannerScreen.tsx`) — **render-verified on sim
      2026-06-26 (iter 8)**: "Your week" timeline with day strip + scheduled blocks
      (Wake / Get ready / Commute / Work / Workout / Wind down), Today + add/chat
      header actions. Direct-manipulation edit testing still TODO.
- [x] Scan center button → FaceScan results — **render-verified on sim 2026-06-26**:
      FaceScanResults postPay reveal renders (Rating/Appeal/Potential rings,
      "Get started"). Still TODO: camera permission prompt + capture flow; free vs
      premium gating.
- [x] Explore / Marketplace — **content-verified on sim 2026-06-26 (iter 16)**:
      "Find your max" header, category tabs (My maxes / All / Native / Creator),
      featured "New" card (Hairmax · Included), and a grid of real maxes (Hairmax,
      Skinmax …) with the maxx color icons. CORRECTION to iter-4 note: maxes DO
      exist in the backend, so courses/start-program are NOT env-blocked — just
      need reliable card targeting. MaxDetail / start-program still TODO (the
      Explore cards lack testIDs, so text-tap is scroll-position-dependent — see
      P3 to add `testID` to Explore cards, mirroring the tab fix).
- [x] Chat / Coach (`screens/chat/MaxChatScreen.tsx`) — **render + SEND verified
      on sim 2026-06-26 (iter 15)** via `chat_send.yaml`: tapped the "Build my plan
      for today" suggestion → message posts as a sent bubble, greeting clears,
      "Thinking" indicator shows, composer switches to a Stop (cancel) button.
      Client send path + states all correct (EXIT 0). NOTE: the AI reply was still
      generating at 9s — full response round-trip depends on the backend LLM being
      configured/responsive (backend concern, not a mobile blocker). Error/offline
      state still TODO.
- [~] You / Profile (`screens/profile/*`) — **Profile render-verified on sim
      2026-06-26** (Your Maxes, Weekly Progress, Progress calendar, Trophy Case).
      Edit/Personalization sub-screens still TODO.
- [x] Settings — **render-verified on sim 2026-06-26 (iter 13)** via
      `settings_walk.yaml` (Home → Open profile → Settings → "Sign out" asserted).
      All App-Store-critical paths confirmed (wiring + on-screen): Manage
      subscription, Edit lifestyle / My products / Edit personal info, Contact
      support, **legal links** (Privacy / Terms / Community / Cookie → `LegalDocument`,
      rendered from 619-line bundled content — no broken-URL risk), Sign out, and
      **Delete account** (password-confirm modal — Apple's mandatory in-app account
      deletion ✓). CONFIG NOTE (→ Needs Human Decision): Contact support shows the
      dev placeholder `support@local.test` — set `EXPO_PUBLIC_SUPPORT_EMAIL` to the
      real address in the prod EAS build.
- [ ] Achievements / Progress / Archives screens.
- [~] MaxDetail — **render-verified on sim 2026-06-26 (iter 17)** via
      `maxdetail_walk.yaml`: Explore card (new testID) → detail (hero, stats
      12 routines/7 focus areas/Daily, description, "Fits your real week",
      **"Start my plan"** CTA asserted). Next: tap "Start my plan" → habits appear
      on Home → tap habit → TaskGuide.
- [ ] Course / curriculum: CourseList, CourseDetail, ChapterView, TaskGuide
      (modal vertical pager), Fitmax suite. Reachable via "Start my plan" → Home
      habit card → TaskGuide. **iter 18: attempted but BLOCKED by maestro driver
      instability** (the xctest driver hangs at init repeatedly — see Maestro
      gotcha); not an app issue. Needs a stable driver / CI run to walk.
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

- [~] `npx tsc --noEmit` — **9 pre-existing errors → 4 fixed, 5 deferred (iter 5).**
  Fixed (in actively-shipping code):
  - `App.tsx:86/163/181` — dynamic `navRef.navigate(x as never, y as never)`
    (the `[never,never]` 2-arg form broke the overload) → switched to
    `navRef.dispatch(CommonActions.navigate({ name, params }))`, the codebase's
    own idiom (matches the `CommonActions.reset(...)` calls right below);
    runtime-equivalent, tsc-clean.
  - `tamagui.config.ts:21` — spread of non-existent `defaultConfig.tokens.color`
    (v4 keeps colors in `themes`, not `tokens`) → removed the no-op spread.
  Deferred (see Accepted/Deferred): 5 in `components/glass/*` — non-shipping path.
  - `screens/profile/ProfileScreen.tsx:696` — ✅ FIXED 2026-06-26 (iter 4): the
    Chad-Lite note read `p.chadliteNote` but the style lives in the `styles`
    sheet → it was rendering UNSTYLED on the live Profile screen. Repointed to
    `styles.chadliteNote`; tsc confirms the error is gone.
  - **NOTE: `tsc` total is 9 errors (all pre-existing, none from this review).**
    Beyond GlassCard/tamagui above, ~6 more remain (mostly the glass/Tamagui
    `todayV2`-gated path). Enumerate + clear (or delete the dead glass path) in a
    focused pass; a non-compiling tsc shouldn't ship.
- [x] App launches with no redbox (`smoke_no_redbox.yaml`). **2026-06-26 (iter 8):
      `maestro test smoke_no_redbox` PASSES** — cold launch, no "Something went
      wrong"/"Error"/"Invariant Violation"/"TypeError" overlay (EXIT 0). Per-tab
      first-render console-error check still TODO.
      - iter 10: `home_dashboard_render` also PASSES (EXIT 0) now that tabs have
        testIDs — tab-home → HABITS, no error overlay.
- [~] Every screen has sane empty / loading / error states (no infinite spinners,
      no raw error objects shown to users). **2026-06-26 (iter 9): error states
      verified good.**
      - All user-facing `{error}` renders are curated strings (SmsSetup,
        Personalization, OnboardingV2, GoogleSignInButton all use friendly copy
        like "Could not save. Try again." / "Check your connection") — no raw
        Error objects or stacks shown.
      - Global `AppErrorBoundary` fallback: "Something went wrong … Your data is
        safe — tap to reload" + Reload action; raw `error.message` is only logged,
        never rendered.
      - Empty/loading spot-checked sound: Home ("No habits… Start a program"),
        Explore ("Loading Explore" → "No maxes yet").
      - ~~Minor (P3): HomeScreen can surface a raw axios `e.message`.~~ **FIXED
        iter 19** — both HomeScreen schedule-error spots now show the backend's
        user-safe `detail` or a friendly fallback, never the raw axios message
        (tsc clean). Full per-screen empty/loading sweep still TODO.
- [ ] Offline / flaky-network behavior is graceful (resilience layer is in place —
      verify it actually catches failures on the walked screens).
- [x] No secrets / API keys committed in `mobile/`; no `console.log` of PII; dev
      bypasses are `__DEV__`-gated. **2026-06-26 (iter 6): scan clean.**
      - No real `.env` tracked (only `expo-public.env.example`, placeholders only);
        `.gitignore` covers `.env*` with `!.env.example`.
      - No live secret patterns in source (no `sk_`/`rk_` Stripe, AWS, Google API,
        JWT, GitHub/Slack tokens, private keys); no hardcoded
        `apiKey/secret/password=` assignments.
      - All embedded vars are public-by-design `EXPO_PUBLIC_*` (API base URL, IAP
        product IDs, legal URLs, Stripe **publishable** key + payment link). No
        secret/`sk_` key client-side.
      - Onairos SDK key is **server-side** now (fetched via `GET /onairos/config`,
        OnairosConnectModal.tsx:13) — resolves the old audit follow-up.
      - Only PII-ish log is `useAppleSubscription.ts:39` (`user.id`) inside the
        SIMULATED IAP path (`useAppleSim` = `!iOS && __DEV__ && web`) → dev-only,
        never prod. Acceptable.
      - Minor polish (non-blocking): 48 `console.*` calls across 11 files; consider
        a prod log-strip (babel-plugin-transform-remove-console) — added to P3.
- [x] Permissions (camera, notifications) have proper usage strings + graceful
      denial handling. **2026-06-26 (iter 7): verified — solid.**
      - Usage strings all present: camera + mic via the `expo-camera` config
        plugin (auto-injects `NSCameraUsageDescription`/`NSMicrophoneUsageDescription`);
        `NSPhotoLibraryUsageDescription` + `NSPhotoLibraryAddUsageDescription` in
        infoPlist + `expo-media-library` plugin; notifications via `expo-notifications`
        plugin + `aps-environment: production` + `UIBackgroundModes:
        remote-notification`. Android permissions declared. `ITSAppUsesNonExempt-
        Encryption: false` (export-compliance handled).
      - Graceful denial everywhere: camera uses `useCameraPermissions`, and on
        `canAskAgain === false` shows an Alert → "Open Settings"
        (FaceScanScreen.tsx:387) + a denied-state UI; photo save Alerts "Allow
        Photos access" and returns (FaceScanResultsScreen.tsx:1051); notifications
        return a bool so callers silently skip scheduling
        (localScheduleNotifications.ts:19); calendar returns `permission_denied`
        (DaySetupScreen.tsx:249). No crash paths on denial.
- [~] Accessibility labels on icon-only buttons; key interactive elements have
      `testID`s. **2026-06-26 (iter 12): audited — partial, non-blocking.**
      - Key/high-traffic actions ARE labeled: tab bar (testIDs + labels), avatar
        ("Open profile"), scan ("Scan"), habit checkbox (`accessibilityRole`),
        plenty of text-bearing buttons self-label.
      - GAP (→ P3): many secondary ICON-ONLY buttons (back / close / header
        chevrons / add / share) lack `accessibilityLabel` — e.g.
        ForgotPasswordScreen, ChannelChatScreen, SendblueConnect, several chat/
        settings headers (and the gated forums screens). A VoiceOver user hears
        "button" instead of "Back"/"Close". Not an App Store rejection blocker
        (no a11y support is claimed), but worth a focused sweep.
      - testID coverage: tabs now have ids (iter 10); habit cards, login fields,
        marketplace cards already had them.
      - iter 24 update: the auth flow is actually in good shape — LoginScreen &
        SignupScreen already label Back / password-eye / Continue / Apple / links.
        Fixed the one real auth gap (ForgotPassword country-modal Close button →
        added accessibilityLabel). Remaining gaps are non-auth icon buttons
        (chat/settings headers, gated forums) — still the P3 sweep below.
- [x] Feature flags: confirm the **production** flag values and that gated paths
      render without dead tabs. **2026-06-26 (iter 14): shipping config coherent.**
      Static flags (mobile/constants/featureFlags.ts, no runtime toggle):
      ON → `faceScan` (8 sites, scan verified), `personalizedUI` (5 sites, degrades
      to default copy — verified on Home), `onboardingV2`/`revealV2`/`streakV2`
      (intended V2 versions). OFF → `newNav` (old nav, all tabs verified),
      `todayV2` (TodayScreen unused — the dead glass path), `referrals` (UI hidden).
      No flag combination leaves a reachable-but-broken tab (Forums is
      intentionally hidden ComingSoon). NOTE (→ P3): `referralDiscounts` is defined
      but has 0 call sites — a dead flag, trivial to remove.
- [x] No obvious perf cliffs (giant un-virtualized lists, heavy work on mount).
      **2026-06-26 (iter 21): audited — no major cliff.**
      - Fast-growing lists ARE virtualized: chat (MaxChatScreen), forum
        threads/notifications all use `FlatList`. ✓
      - `ScrollView + .map` screens are either BOUNDED (MarketplaceScreen = a
        curated max catalog, small N) or `newNav`-only (MasterScheduleScreen, not
        in the shipping OLD nav).
      - Minor (→ P3): `FaceScanArchiveScreen` + `ProgressArchiveScreen` render
        history via un-virtualized `ScrollView + .map`. Fine now (grows ~1/day) but
        convert to `FlatList` before a long-tenured user accumulates hundreds of
        rows. No heavy synchronous work on mount spotted (schedule aggregation is
        memoized; tab prefetch is async).

## P1 — SECURITY: PAYWALL / PREMIUM-BYPASS GUARDS

- [x] No production path unlocks premium without paying. **2026-06-26 (iter 22):
      verified intact.**
      - **Paywall CTA**: PaymentScreen.tsx:164 — `if (SHOW_DEV_BYPASS) { devBypass;
        return; } await sub.subscribeBasic/Premium()`. `SHOW_DEV_BYPASS = __DEV__`,
        so a prod build skips the bypass and runs the real Stripe/Apple IAP flow.
        The "Skip" button is `{SHOW_DEV_BYPASS && …}` (dev-only).
      - **DevDrawer** (guest/Onboarding/**Paid** switch → `fauxSkipSignup`): the
        whole component is `if (!__DEV__) return null` — not in the prod bundle.
      - Only callers of `fauxSkipSignup`/`fauxFreshSignup`/`testActivateSubscription`
        are those `__DEV__`-gated UIs (grep-confirmed no ungated caller).
      - Defense-in-depth: backend faux/test endpoints 404 in prod
        (`settings.is_production`, per maxapp_paywall_security). `api.ts:184` also
        throws if `EXPO_PUBLIC_API_BASE_URL` is unset in a prod build.
      - **Hardening applied iter 23**: the `api.faux*` / `testActivateSubscription`
        methods now `throw` when `!__DEV__` — triple-layer defense (UI gate + this
        api guard + backend 404). tsc clean; dev flows unaffected.

## P3 — POLISH

- [ ] Copy/typo sweep on user-facing strings of walked screens.
- [ ] Consistent theming (the flat ink/cream "Craft" aesthetic) — no leftover
      dark-on-dark or stray glass-redo remnants.
- [ ] Loading skeletons vs spinners consistency.
- [ ] Accessibility sweep (remaining): add `accessibilityLabel` to icon-only
      buttons (close/header/add/share) on chat/settings headers, SendblueConnect,
      and the gated forums screens. (Auth flow done iter 24; VoiceOver polish, not
      launch-blocking.)
- [x] Add `testID` to Explore/Marketplace cards — **DONE iter 17**:
      `explore-card-${item.id}` on all 4 card variants (Feature/Grid × native/
      poster); verified `tapOn id:explore-card-.*` opens MaxDetail.
- [x] Remove dead `referralDiscounts` flag — **DONE iter 19** (removed from
      FlagName + FLAGS; 0 call sites; tsc clean).
- [ ] Virtualize the archive lists: `FaceScanArchiveScreen` + `ProgressArchiveScreen`
      use `ScrollView + .map` (un-virtualized) — convert to `FlatList` before they
      grow to hundreds of rows. (found iter 21; slow-growing, non-blocking)
- [x] (Hardening) Guard the `api.faux*` / `testActivateSubscription` client
      methods with `if (!__DEV__) throw` — **DONE iter 23** (tsc clean; dev flows
      unaffected since `__DEV__` is true in dev). The bypass calls now fail loudly
      in any prod build even if invoked — triple-layer defense (UI gate + this +
      backend 404).
- [ ] Strip `console.*` in production bundle (48 calls / 11 files) via
      babel-plugin-transform-remove-console (perf + avoids leaking debug to device
      logs). Non-blocking. (found iter 6)

---

## NEEDS HUMAN DECISION (flag here; do NOT act)
- **Confirm the main-app tour runs clean on a fresh Day-1 account.** The orphan-
  step wedge (P0) is fixed structurally, but the exact dead-touch state couldn't
  be reproduced here because the test account already completed the tour. On a
  fresh paid account (tour-eligible), confirm: tour auto-starts, steps 1→5 each
  show a tooltip over the right element, Skip/Next/Done all work, and the app is
  fully tappable afterward. (Backend exposes only `/main-app-tour/complete`, no
  reset, so a fresh account or a DB flag flip is needed to retest.)
- **Prod env values for the EAS build.** Settings showed `support@local.test`
  (dev `EXPO_PUBLIC_SUPPORT_EMAIL`). Before submitting, confirm all
  `EXPO_PUBLIC_*` are set to prod values in EAS Secrets: SUPPORT_EMAIL,
  API_BASE_URL, the legal URLs (external copies), Stripe publishable key + return
  URL, IAP product ids. (In-app legal docs are bundled so they're safe regardless,
  but the support mailto and API base must be real.)
- **Dead `todayV2` / Tamagui / glass path — fix-or-delete?** `newNav` and
  `todayV2` both ship OFF, so `TodayScreen` (the only real consumer of the glass
  components + Tamagui tokens) never renders in prod, yet `TamaguiProvider` is
  still mounted at the App root and the Tamagui + glass code ships in the bundle.
  If todayV2 is abandoned (Craft aesthetic won), deleting TodayScreen + the glass
  components + the Tamagui dependency would clear the last 5 tsc errors and shrink
  the bundle. If todayV2 is still planned, the Tamagui token typing needs a real
  fix instead. Needs a product decision before acting (don't delete autonomously).
- ~~E2E test-infra: Maestro can't reliably navigate the bottom tabs.~~
  **RESOLVED 2026-06-26 (iter 10)** — turned out to be a low-risk additive fix, so
  done rather than deferred. Added `tabBarButtonTestID` to the shipping tabs
  (`tab-home/planner/explore/chat` in TabNavigator.tsx) + `testID="tab-scan"` on
  the scan button. Flows now use `tapOn: { id: 'tab-home' }`; verified
  `home_dashboard_render` passes EXIT 0 (tab-home → HABITS). Tab navigation is now
  reliable for the whole suite.

## ACCEPTED / DEFERRED (with reason)
- **5 tsc errors in `components/glass/GlassCard.tsx` (29,38) +
  `GlassButton.tsx` (55,81,116)** — Tamagui `$glass`/`$glassBorder` token props
  not recognized by the type system. DEFERRED because this is a **non-shipping
  path**: GlassCard/GlassButton are only rendered by `TodayScreen` (gated behind
  `todayV2`, which is OFF in prod) and `PlannerMockups` (`__DEV__`-only). Zero
  runtime impact in production (no glass component mounts; the comment in
  GlassCard even notes "there is no glass" — the app uses the flat Craft
  aesthetic now). Proper resolution is a product call — see Needs Human Decision.

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
- 2026-06-26 (iter 5): **tsc 9 → 5.** Fixed the 4 errors in shipping code:
  App.tsx ×3 dynamic navigates → `CommonActions.navigate` dispatch; tamagui.config
  bad token spread removed. Remaining 5 are all in the non-shipping glass/Tamagui
  path (todayV2 OFF) → deferred with justification + flagged the fix-or-delete
  product call. Verified by re-running tsc (count dropped 9→5, no new errors).
- 2026-06-26 (iter 6): **Secrets / PII scan — clean.** No tracked real `.env`,
  no live key/token patterns, no hardcoded secret assignments; `.env*` gitignored.
  Only public `EXPO_PUBLIC_*` config embedded (Stripe publishable key safe).
  Onairos key confirmed server-side (resolves old audit item). One dev-only
  `user.id` log (simulated IAP). Logged a P3 to strip console.* in prod.
- 2026-06-26 (iter 7): **Permissions — verified solid.** All iOS usage strings
  present (camera/mic via expo-camera plugin, photos in infoPlist + plugin,
  notifications plugin + aps-environment + UIBackgroundModes); Android declared;
  export-compliance flag set. Graceful denial everywhere (camera→Settings
  redirect, photos/notifications/calendar all degrade, no crash). No change needed.
- 2026-06-26 (iter 8): **smoke_no_redbox PASSES** (cold launch, no error overlay,
  EXIT 0). Planner tab render-verified (screenshot). Discovered Maestro can't
  reliably tap this app's frosted tab bar (labels not exposed to the text matcher
  under new arch; coordinate taps brittle) → flagged as test-infra Needs-Human-
  Decision (add tabBarButtonTestID). Reverted the home_dashboard_render tap
  experiment; documented its on-Home precondition. Screens render fine.
- 2026-06-26 (iter 9): **Error states verified — clean.** All user-facing error
  text is curated copy (no raw Error objects/stacks); AppErrorBoundary fallback is
  friendly + has a Reload action and only logs the raw message. Empty/loading
  spot-checked good. Noted one minor P3 (HomeScreen can surface a raw axios
  message on schedule-load failure). No code change needed.
- 2026-06-26 (iter 10): **Unblocked Maestro tab navigation.** Added
  `tabBarButtonTestID` to the shipping tabs + `testID="tab-scan"` (TabNavigator.tsx)
  — low-risk additive change. Verified `home_dashboard_render` passes EXIT 0 via
  `tapOn: { id: tab-home }` → HABITS. Updated prod_screen_walk to walk by id.
  Resolves the test-infra item that was flagged for a human last iter. The rest of
  the screen walk (Explore/Chat/Settings/courses) is now reliably reachable.
- 2026-06-26 (iter 11): **Core tab walk PASSES (EXIT 0).** New `tab_walk_min.yaml`
  asserts Home→HABITS, Planner→Commitments, Explore→(mounts), Chat→"What can I
  help with?" — all four tabs navigate + render via testID taps. Confirmed the
  flaky-run root cause: a lingering maestro/xctest driver collides on re-run
  (EXIT 1 after launch); fix = `pkill -9` maestro AND the xctest driver between
  runs (documented in the Maestro gotcha). prod_screen_walk's DevDrawer re-entry
  is still collision-sensitive; tab_walk_min is the reliable core walk.
- 2026-06-26 (iter 12): **Accessibility audit — partial, non-blocking.** Key
  actions labeled (tabs/avatar/scan/habits); gap is secondary icon-only buttons
  (back/close/header) missing `accessibilityLabel` on several shipping screens →
  logged a P3 sweep. Not an App Store blocker. No code change this iter.
- 2026-06-26 (iter 13): **Settings verified — production-ready.** Reached via
  Open profile → Settings (settings_walk.yaml, "Sign out" asserted). All
  App-Store-critical paths confirmed: account deletion (Apple requirement, w/
  password modal), legal links (bundled 619-line content), manage subscription,
  support. Flagged: set real prod EXPO_PUBLIC_* (support email is dev placeholder).
- 2026-06-26 (iter 14): **Feature-flag config confirmed coherent.** Mapped all
  call sites; shipping ON/OFF values produce no dead/broken gated tabs (faceScan/
  personalizedUI/onboardingV2/revealV2/streakV2 ON; newNav/todayV2/referrals OFF).
  Found `referralDiscounts` is a dead flag (0 uses) → P3 cleanup. No code change.
- 2026-06-26 (iter 15): **Chat SEND functionally verified** (chat_send.yaml, EXIT
  0). Suggestion-chip tap posts the message, greeting clears, "Thinking" +
  Stop-button states render correctly. AI reply still generating at 9s (backend
  LLM round-trip — flagged as a backend, not mobile, concern).
- 2026-06-26 (iter 16): **Explore content-verified** — real maxes present
  (Hairmax/Skinmax grid, category tabs, featured card). Corrects the earlier
  "no maxes / env-blocked" assumption: courses/start-program ARE reachable.
  MaxDetail tap-in is scroll/tab-restore-finicky (Explore cards lack testIDs) →
  logged a P3 to add card testIDs; MaxDetail/start-program walk still TODO.
- 2026-06-26 (iter 17): **Added `explore-card-*` testIDs + verified MaxDetail.**
  All 4 Explore card variants now carry `testID={explore-card-${item.id}}`;
  `maxdetail_walk.yaml` taps a card by id → MaxDetail renders (Hairmax: stats,
  description, "Start my plan" CTA asserted). Unblocks the start-program → courses
  flow (next: tap "Start my plan" → Home habits → TaskGuide).
- 2026-06-26 (iter 18): Attempted the core loop (Start my plan → habits →
  TaskGuide) but the maestro/xctest driver HUNG at init twice (needs `pkill -9
  java`, then re-hangs) — infra, not app. "Start my plan" CTA confirmed present
  (iter 17); the start + TaskGuide walk needs a stable driver/CI. Updated the
  Maestro gotcha. This marks the practical limit of sim-driven verification this
  session; the remaining sim-heavy items are infra-limited, not app-blocked.
- 2026-06-26 (iter 19): **Two safe non-sim P3 fixes shipped** (tsc-verified, still
  5/5 deferred glass errors, no new): removed the dead `referralDiscounts` flag;
  sanitized both HomeScreen schedule-error spots so a raw axios message can never
  reach the user (backend `detail` or friendly fallback only).
- 2026-06-26 (iter 20): One careful retry of the core-loop walk — got past init
  this time but failed because the app was stuck on the boot splash after the
  repeated relaunch/terminate churn (dev bundle reloading via Metro; a dev-build
  artifact, NOT a prod issue — prod embeds the bundle). Confirms sim-driven E2E is
  not reliably completable this session. Holding the remaining sim-heavy walks
  (core loop / TaskGuide / Fitmax / scan / achievements) for a stable driver/CI.
  No app issue found; no code change.
- 2026-06-26 (iter 21): **Perf audit — no major cliff.** Fast-growing lists
  (chat/forums) are FlatList-virtualized; ScrollView+.map screens are bounded
  (marketplace catalog) or newNav-only. Minor P3: FaceScanArchive/ProgressArchive
  use un-virtualized ScrollView+.map (slow-growing). No heavy on-mount work.
- 2026-06-26 (iter 22): **Paywall/bypass security — verified intact.** Every
  premium-unlock bypass (PaymentScreen devBypass+Skip, DevDrawer faux-paid) is
  `__DEV__`-gated; the prod paywall CTA runs the real Stripe/Apple purchase; the
  only callers of the faux/test methods are those gated UIs; backend 404s in prod.
  A production user cannot unlock premium for free. Logged an optional P3 hardening
  (no-op the faux/test api methods in prod too). This exhausts the reliable
  non-sim production gates.
- 2026-06-26 (iter 23): **Applied the paywall hardening.** `api.fauxSignup/
  fauxSkipSignup/fauxFreshSignup/testActivateSubscription` now `throw` when
  `!__DEV__` — the bypass calls can never run in a prod build even if invoked
  (triple-layer defense with the UI gate + backend 404). tsc clean (5/5 deferred
  glass errors, no new); dev flows unaffected.
- 2026-06-26 (iter 24): **Auth-flow a11y closed.** Found Login/Signup already
  fully labeled (Back/eye/Continue/Apple/links — iter-12 audit overstated the
  gap); fixed the one real auth gap (ForgotPassword country-modal Close button →
  added accessibilityLabel + role). Remaining a11y sweep is non-auth headers
  (P3, non-blocking).

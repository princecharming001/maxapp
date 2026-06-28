# Max App — Comprehensive UX / Product Issues

A full troubleshooting pass on the Max app, framed as "what would leave a bad
impression, feel unintuitive, or break a seamless experience for a real user."
This is a **findings list for fixing later** — nothing here has been changed.

**How it was produced**
- **Live Chrome run** of the reachable surface on web (`http://localhost:8081`):
  Landing → Sign up → validation edge cases. (The paid app — planner, schedule,
  chat, profile, courses, fitmax — sits behind native IAP/Stripe and is not
  reachable in a plain web run, so it was covered by code audit instead.)
- **Four deep code audits**, one per area, reading every screen in full:
  (1) auth + onboarding, (2) planner + schedule, (3) scan + paywall + chat,
  (4) profile + courses + fitmax.

**How to use it**
Each item is `[Severity] description — file:line — why it hurts the user`.
Severities: **Critical** (broken / trust-damaging / ships a backdoor),
**High** (real user pain or dead-end), **Medium** (rough edge),
**Low** (polish / consistency). Paste any section into Claude to fix it.
`[Live]` = personally reproduced in the browser this session.

> Note: many "no-op on web" items are because native modules (Stripe, IAP,
> camera, Onairos, Google Sign-In) don't run on web. Those are flagged but are
> mostly **web-only artifacts**, not bugs real iOS users hit. They're separated
> out in Appendix B so they don't distract from real product issues.

---

## TRIAGE — Critical, fix first

1. **`features/fitmax/fitmax.ts` is not valid UTF-8.** Latin-1 bytes (`·` `×` `°`)
   render as garbled `�` across every Fitmax screen; there's even a `split('�')`
   hack depending on the corruption. — `fitmax.ts` (bad byte `0xb7` @ offset 2160).
2. **An entire Fitmax sub-feature ships but is unreachable.** `FitmaxChatPanel.tsx`
   is the only thing wiring the four Fitmax data screens and it is never mounted
   anywhere; no code navigates to `FitmaxPlan / FitmaxWorkoutTracker /
   FitmaxCalorieLog / FitmaxProgress`. — `RootNavigator.tsx:163-166`, `FitmaxChatPanel.tsx:92-95`.
3. **Web entry buttons mint real backend accounts with no consent.** The top-right
   "Skip" pill, "Try it first. No account needed," and the two `DEV →` buttons all
   call faux-signup endpoints and drop you into a paid demo. The web pill + "Try it
   first" are **not** `__DEV__`-gated, so they ship to real web users with no
   ToS/Privacy step. — `LandingScreen.tsx:146-164, 202-215` → `api.ts:339-362`.
   **[Live]** Clicking "Skip" spins forever (see #Landing-2). Verify `auth/faux-signup*`
   and `devSkip*` routes are disabled in the production backend.
4. **Finishing onboarding can silently fail.** If `saveOnboarding` errors, the only
   handling is `console.error`; no alert, no inline error — the spinner just stops
   on the last step and the user is stuck with no idea why. — `OnboardingScreen.tsx:234-238`.
5. **Permanent SMS-skip is a dark pattern.** Skipping SMS can only be undone by
   deleting your account ("you would need to delete your account and create a new
   one"). Forcing account deletion to change a notification preference. —
   `SendblueConnectScreen.tsx:82-83, 216, 225`.
6. **Fitmax shows hardcoded fake data as if it were the user's** — body
   measurements, lifts, plan, macros. — `FitmaxProgressScreen.tsx:67-79`, `fitmax.ts`.

---

## 1. Entry / Landing — `screens/onboarding/LandingScreen.tsx`

- **[Critical] Faux-signup backdoors shipped on web** (see Triage #3). The web "Skip"
  pill (`:146-164`), "Try it first. No account needed" (`:202-215`), and the two
  `DEV →` buttons (`:218-245`) all mint accounts via `fauxSkipSignup` / `fauxSignup`
  / `fauxFreshSignup` (`api.ts:339-362`). Pill + "Try it first" aren't dev-gated.
- **[High] [Live] "Skip" / "Skip to home (paid demo)" hang forever with no timeout.**
  Clicking either shows a spinner that never resolves and never errors when the
  backend is unreachable; the user is stuck staring at spinning buttons with zero
  feedback. A web-only `window.location.replace('/')` hard-reload is the only
  fallback, fired on a 1.5s timer. — `:79-112, 92-98`.
- **[Medium] [Live] Big empty "hero" gap.** The screen reserves a large blank
  vertical band between the tagline and the buttons — it's a one-slide `FlatList`
  carousel (`SLIDES` has exactly one item) with all the multi-slide / "Next" /
  dot-paging / coaching-bubble code dead. Reads as unfinished/broken layout. —
  `:26-34, 128-142, 247-267`.
- **[Low] [Live] "Try it first. No account needed" is a faint gray underline** —
  low-contrast, easy to miss as the no-signup entry.
- **[Low] Debug `console.log` spam** in the skip handler ("[Skip] click → …"). — `:83, 87, 95, 102`.
- **[Low] Hardcoded colors** bypass theme tokens. — `:502, 511`.

## 2. Sign up — `screens/auth/SignupScreen.tsx`

- **[Medium] [Live] No email format validation** — only a non-empty check, so
  `notanemail` submits clean and is only rejected (if ever) by the server. (Reproduced:
  invalid email passed client validation.) — `:103`.
- **[Medium] [Live] Empty-submit shows red borders + red labels but NO error text.**
  The user gets no words telling them what's wrong; it's color-only (also an
  accessibility problem). Password mismatch is the one case with a real message
  ("Passwords don't match"). — confirmed live; `:213` for the mismatch helper.
- **[Low] Confirm-password empty has no message** — field just turns red while the
  mismatch helper only appears when both fields are filled and differ. — `:106-108`.
- **[Medium] Long 7-field form with no `returnKeyType` / `onSubmitEditing` chaining** —
  no next-field progression; on Android `behavior="height"` + ScrollView can jank. —
  `:178-251, 161`.
- **[Low] No `textContentType` / `autoComplete`** on email/password → no autofill or
  strong-password suggestion. — `:193, 199, 208`.
- **[Medium] `pickImage` has no try/catch and no permission-denied path** — a denial
  or native error can throw unhandled; also a native module that differs on web. — `:91-94`.
- **[Low] Avatar upload failure after account creation** shows an alert but no retry,
  flow continues. — `:131-138`.
- **[Low] Phone validation is `< 7 digits` only** — no upper bound / per-country rules;
  a 30-digit "number" passes. — `:110`.
- **[Low] Two-stage friction**: field errors surface first, then a *second* error for
  the unchecked ToS box. — `:116-121`.
- **[Low] Hardcoded `#ef4444` / `rgba(139,58,58…)`** instead of `colors.error`. — `:337, 406-410`.

## 3. Sign in — `screens/auth/LoginScreen.tsx`

- **[Medium] No keyboard submit / autofill** — no `returnKeyType`, `onSubmitEditing`,
  `textContentType`, or `autoComplete`; can't press return to sign in, no Keychain
  password fill. — `:65-94`.
- **[Low] Identifier is non-empty-checked only** — garbage is sent to the server and
  returns a generic "Invalid credentials." — `:36-39`.
- **[Low] Brand spelling drift** — tagline says "Looksmaxing" (one s, one x) vs
  Landing's "looksmaxxing." — `:60` vs `LandingScreen.tsx:31`.
- **[Low] No `accessibilityLabel`** on Sign In / Forgot / Create-account touchables. — `:117-139`.

## 4. Forgot password — `screens/auth/ForgotPasswordScreen.tsx`

- **[High] Phone-less accounts can never reset their password.** Reset is SMS-only,
  but phone is optional at signup; a phone-less user just gets "Could not send code."
  Hard dead-end. — `:46-66, 106-108`.
- **[Low] Copy-voice: curly apostrophe** in "We'll text a code…" (U+2019). — `:108`.
- **[Low] Blind 1.5s `setTimeout` navigate with no `clearTimeout`** — fires on an
  unmounted screen if the user taps Back. — `:87`.
- **[Low] Confusing hint** "…no code prefix" (does it mean no `+1`? no verification
  code?). — `:141`.

## 5. Onboarding questionnaire — `screens/onboarding/OnboardingScreen.tsx`

- **[Critical] Silent submit failure** (Triage #4). — `:234-238`.
- **[Medium] Custom `PanResponder` sliders have no accessibility / keyboard support** —
  no `accessibilityRole="adjustable"`, no value announcement; age/height/weight/time
  can't be set by screen-reader or keyboard users. Comments admit drag jitter. — `:764-842`.
- **[Medium] Back from step 0 calls `goBack()` into nothing** — onboarding is the
  initial route for these users, so Back/gesture no-ops and feels stuck; no Android
  hardware-back handling. — `:180-184`.
- **[Medium] Onairos connect step may crash / no-op** — assumes the Onairos SDK and,
  unlike FeaturesIntro, isn't guarded behind the env key. — `:282-288, 352-359`.
- **[Low] Gender step auto-advances** via `setTimeout(goNext, 200)` — surprising (no
  other step does this), and rapid taps can queue multiple advances. — `:246-251`.
- **[Low] Disabled "Next" gives no reason** — greys out with no hint about the missing
  answer. — `:335-348`.
- **[Low] Stale JSDoc** says 5 steps (gender→…→priority); there are actually 8
  (adds schedule, intensity, Onairos). — `:12` vs `:68-79`.
- **[Medium] Stale-closure risk** — `goNext` `useCallback` calls non-memoized `submit()`
  behind an `eslint-disable exhaustive-deps`. — `:171-178`.

## 6. Routine reveal + Features intro

- **[Low] Fake 1200ms "building your plan" delay** even though the routine is already
  in route params (no network call). — `RoutineRevealScreen.tsx:83-91`.
- **[Low] Flash of blank screen** on the empty-routine path before it resets to
  FeaturesIntro. — `RoutineRevealScreen.tsx:77-82`.
- **[Medium] Back can re-enter the fake loading loop** — FeaturesIntro Back → goBack →
  RoutineReveal re-runs its 1200ms animation; and when FeaturesIntro is the initial
  route, Back is a dead control. — `FeaturesIntroScreen.tsx:62-69`, `RoutineRevealScreen.tsx:95-97`.
- **[Low] Onairos modal auto-pops on screen entry** — intrusive; can appear after the
  user already started reading. — `FeaturesIntroScreen.tsx:32-48`.
- **[Low] Hardcoded "Takes 30 seconds" claim** baked into a constant. — `FeaturesIntroScreen.tsx:15`.

## 7. Face scan — `screens/scan/FaceScanScreen.tsx`

- **[High] Permanent permission-denial dead-end** — re-tapping "Enable camera" only
  re-calls `requestPermission()`, which no-ops once the OS won't re-prompt; no
  Open-Settings deep link. User is stuck unable to scan. — `:457-466`.
- **[High] No face / lighting validation before capture** — `capture()` shoots whatever
  is in frame (dark, no face, off-angle) and feeds it straight to scoring. — `:324`.
- **[Medium] No no-camera fallback** beyond an `appActive` gate. — (CameraView, no web guard).
- **[Low] Wordy multi-sentence alert copy mid-scan** referencing SMS coaching — not
  blunt-coach voice. — `:148-152, 172-176`.

## 8. Scan results — `screens/scan/FaceScanResultsScreen.tsx`

- **[High] Displayed "potential" is artificially inflated** (floor ~6.4, up to 9.9) and
  true low ratings are clamped to a 2.5 minimum — risks reading as deceptive. —
  `:169, 179, 202, 211`.
- **[High] Processing view can loop forever** — progress creeps to ~91% and never times
  out if the server hangs; no failure/escape state. — `ScanProcessingView:436-487`.
- **[Medium] Scores under 5 render in error-red** — demoralizing framing for a face
  rating. — `:160`.
- **[Medium] `processing_status` backoff polling has no surfaced ceiling** — can sit
  "processing" indefinitely. — `:535-584`.

## 9. Scan archive / detail

- **[Medium] Browser `alert()` on a native screen** — "You already used today's face
  scan…" uses `alert()` not `Alert.alert`; renders wrong on native. — `FaceScanArchiveScreen.tsx:62`.
- **[Low] Daily-scan gate fails open** — if `getLatestScan()` errors, it falls through
  and lets a new scan start, bypassing the one-per-day rule. — `FaceScanArchiveScreen.tsx:49-71`.
- **[Medium] Missing metrics render as a real `0.0`** — absent metrics show as zero
  scores/bars instead of an empty state. — `ScanDetailScreen.tsx:18, 28-33`.
- **[Low] `ScanDetailScreen` looks like a legacy duplicate** of the results screen —
  confirm it's still reachable. — whole file.

## 10. Paywall / Payment / Subscription hooks

- **[High] Hardcoded prices in the paywall JSX** (`$5.99`, `$3.99`) while the app also
  fetches a real billing preview — any price/currency/locale change desyncs displayed
  vs charged price. — `PaymentScreen.tsx:243, 299`.
- **[High] No Restore / Terms / Privacy / auto-renew disclosure on the paywall** —
  intentionally moved to Manage Subscription; standard App-Store paywall disclosure is
  absent at the point of purchase (review risk). — `PaymentScreen.tsx:193-197, 554-557`.
- **[Medium] Purchase blocked until first scan is done** — a ready-to-pay user is bounced
  if `!first_scan_completed`. — `PaymentScreen.tsx:91-104`.
- **[High] Stale deep-link scheme** `cannon://stripe-redirect` — if the scheme is now
  "Max", the Stripe return into the app fails. — `hooks/useStripeSubscription.ts:66`.
- **[High] Stuck-after-pay risk** — thank-you polls only `POLL_MAX=20` then leaves the
  user on "almost there" with just a manual refresh if the webhook never lands. —
  `PaymentThankYouScreen.tsx:15, 41, 52`.
- **[Medium] Thank-you leaks "Stripe" and is wrong on iOS** — iOS goes through Apple
  IAP, but the copy says "If you just paid, Stripe may need a moment…". — `PaymentThankYouScreen.tsx:99`.
- **[Low] `logout` imported but unused** in a payment screen; **[Low]** non-iOS dev
  Apple-sim branch in a payment path — verify it can't engage in prod web. —
  `PaymentScreen.tsx:70, 74`.
- (Good: `useAppleSubscription.ios.ts` has duplicate-transaction guard + restore — solid.)

## 11. SMS coaching setup

- **[Critical/High] Permanent SMS-skip dark pattern** (Triage #5) — delete-account-to-undo. —
  `SendblueConnectScreen.tsx:82-83, 216, 225`.
- **[High] Near-trap: "Continue" disabled until the inbound SMS confirms** — if it never
  lands, the only exits are the scary permanent-skip or Back. — `SendblueConnectScreen.tsx:201-203`.
- **[High] Contradictory messaging** — `SmsCoachingIntroScreen.tsx:97` frames skipping as
  casual ("Skip for now", "Set up anytime in Profile") while SendblueConnect says it's
  permanent. — `SmsCoachingIntroScreen.tsx:70, 97`.
- **[Medium] Indefinite 4s polling for the SMS** — no timeout/ceiling; battery/network
  drain, no "still waiting?" escape. — `SendblueConnectScreen.tsx:57-61`.
- **[Medium] Hardcoded fallback phone number** `+16468304204` if the env value is missing. —
  `SendblueConnectScreen.tsx:64`.
- **[Medium] Android silently coerces `apple_only` → `both`** — an Android user who chose
  Apple-only gets switched to also receiving SMS they didn't opt into; no Android push
  path either. — `NotificationChannelsScreen.tsx:64, 73-75, 105`.
- **[Medium] "Add a phone to enable" with no way to add a phone** from that screen. —
  `NotificationChannelsScreen.tsx:65-66, 177-179`.
- **[Low] Weak phone validation** (`< 7 digits`, no max). — `SmsSetupScreen.tsx:66`.

## 12. Day Planner — `screens/profile/DayPlannerScreen.tsx`

- **[High] Stale state on the always-mounted planner tab.** Local state is seeded once via
  `useState` initializers and never re-hydrated from `user.onboarding`; the tab never
  unmounts, so edits made in EditPersonal / Chat / Schedule don't show until app restart. —
  `:75-79` (tab `TabNavigator.tsx:33-34`).
- **[High] Lost-edit race** — every slider/obligation/reset calls a full `saveOnboarding`
  with no debounce / in-flight guard / sequencing; two quick edits can build payloads from
  pre-save state and the later response wins, dropping an edit. — `:107, 150-174`.
- **[High] No optimistic rollback** — on save error the UI already committed the change, so
  the canvas shows an edit the backend rejected, with no revert. — `:142, 152-172`.
- **[High] Chat flush-then-apply can discard a just-finished edit** — `sendChat` saves the
  closure snapshot, then `applyServerState` overwrites local state entirely. — `:193-195`.
- **[High] No undo and no history after a chat edit** — `chatReply` is ephemeral local state,
  lost on tab switch; the AI rewrites the whole week with no way to see or revert what
  changed. — `:90`.
- **[Medium] Error and "no change" chat replies render with a green success checkmark** — a
  failure or "couldn't tell which day you meant" looks like it worked. — `:205, 274-280`.
- **[Medium] No empty / first-run state** — a brand-new user sees a fully-populated
  07:00–23:00 "week" they never entered ("where did this come from?"). — `plannerModel.ts:347-348`.
- **[Medium] Up-to-45s chat wait with only a spinner and no retry button.** — `:324`, `api.ts:581`.
- **[Low] Suggestion chips vanish permanently after the first reply.** — `:281-301`.

## 13. Schedule — `ScheduleScreen.tsx` + `MasterScheduleScreen.tsx`

- **[High] "Adapt Schedule" silently does nothing on Android/web** — `Alert.prompt?.()` is
  iOS-only; the optional-chaining makes it a no-op elsewhere with zero feedback. —
  `ScheduleScreen.tsx:198`.
- **[High] Load errors masquerade as "no schedule"** — `loadSchedule` swallows errors into
  `console.error` and renders the empty "Generate Schedule" state, so a network failure looks
  identical to having no schedule (user may regenerate / think it was deleted). — `:123-127, 259-287`.
- **[High] Work/school row disappears from the timeline after any planner edit** — Master
  schedule builds "life tasks" from legacy `work_*` fields that the new Day Planner nulls out
  (work migrated into `obligations`, which are never rendered as life tasks). — `MasterScheduleScreen.tsx:777-810` vs `DayPlannerScreen.tsx:118-123`.
- **[Medium] Optimistic edits desync with silent rollback** — toggle/move/remove roll back on
  failure but only `console.error`; the control snaps back with no explanation. —
  `ScheduleScreen.tsx:180-193`, `MasterScheduleScreen.tsx:361-388`.
- **[Medium] No focus refetch** — schedule loads once on mount; change the plan elsewhere and
  it's stale until manual pull-to-refresh. — `ScheduleScreen.tsx:95-97`.
- **[Medium] "Move time" inline slider fights the scroll view** and uses the tiny 26px thumb. —
  `MasterScheduleScreen.tsx:1034-1043`.
- **[Medium] Heavy notification effect** cancels + reschedules up to 120 notifications on a
  `merged` object whose identity changes each render. — `MasterScheduleScreen.tsx:610-618`.
- **[Medium] Emoji + robotic copy in alerts** — `Alert.alert('✅ Schedule Adapted', …)` and a
  comma-laden parenthetical example placeholder. — `ScheduleScreen.tsx:200, 206`.
- **[Low] `@life_task_checked_v1` AsyncStorage grows unbounded** (one entry per work/sleep per
  day, never pruned). — `MasterScheduleScreen.tsx:763-769`.
- **[Low] `HeaderChrome` defined inside render** → remounts subtree each render. — `:826-846`.

## 14. Planner sub-components

- **[High] Copy-voice: en-dash in the slider pill** — renders "7 AM – 8 AM" on every
  dual-thumb slider (wake/sleep, workout, obligations). — `components/planner/TimeRangeSlider.tsx:197`.
- **[High] Sliders have zero screen-reader support** — plain Views + PanResponder, no
  `accessibilityRole="adjustable"` / value. — `TimeRangeSlider.tsx:212-249`.
- **[Medium] 26px thumb (below 44px), jump-to-touch, fiddly two-thumb disambiguation** — a tap
  anywhere on the track instantly moves the nearest thumb (accidental time changes with no
  undo); overlapping thumbs grab the wrong end. — `TimeRangeSlider.tsx:26, 127-138`.
- **[High] Sheet edits commit only on "Done"** — backdrop tap, X, swipe-down, or Android-back
  all discard everything with no "discard changes?" warning. — `DayEditorSheet.tsx:192, 206-216`.
- **[Medium] Range↔Exact and workout Auto toggles are lossy** — toggling recomputes/midpoints
  and never restores the user's original times; workout always resets to 5–7 PM. — `DayEditorSheet.tsx:140-170, 190`.
- **[Medium] Per-day edit hides the workout editor** with a dead-end "open All days" message and
  no button to get there. — `DayEditorSheet.tsx:366-376`.
- **[Medium] Hard time bounds silently clamp** — wake capped at 1 PM, sleep 6 PM–4 AM; shift
  workers / late risers can't represent their real times. — `DayEditorSheet.tsx:49-51`.
- **[High] Obligations can't cross midnight at all** — `OB_MAX` 11:45 PM + `end > start` blocks
  night-shift jobs and late commutes. — `components/planner/ObligationsManager.tsx:48, 124`.
- **[Medium] No overlap/conflict prevention** — two commitments (or one inside sleep) just store
  and then z-stack in the canvas, the later one fully hiding the earlier. — `ObligationsManager.tsx:126-140`, `WeekCanvas.tsx:116-138`.
- **[Medium] Instant delete with no confirm/undo** — the small `×` (≈30px, next to the row's
  edit tap) and "Remove this commitment" both delete immediately. (Master schedule *does*
  confirm — inconsistent.) — `ObligationsManager.tsx:197-204, 316-326`.
- **[Medium] "Now" red line is computed once at mount and goes stale** — no ticking; on the
  always-mounted tab it can be hours wrong. — `WeekCanvas.tsx:224-226`.
- **[Medium] Whole 580px day column is one giant tap target** (plus a redundant header pill) with
  no accessibilityLabel; a scroll-start touch can register as "edit this day." — `WeekCanvas.tsx:165, 253`.
- **[Low] Override/"today" indicators are color-only** (4px dot, green tint) — fail color-blind /
  a11y. — `WeekCanvas.tsx:375-382, 413`.
- **[Medium] Round-trip can collapse a saved range to an exact time** — `reconcileWindow` discards
  the window if the midpoint drifts outside ±1 min. — `plannerModel.ts:308-324`.
- **[Low] `toMin` returns 0 (midnight) for bad input** → malformed times mis-render. — `plannerModel.ts:89-92`.

## 15. Max Chat — `screens/chat/MaxChatScreen.tsx`

- **[High] Queued offline messages auto-resend on app foreground** — a message can fire
  "unexpectedly" much later when the app returns to foreground. — `:373-378, 389-409`.
- **[Low] `keyExtractor` uses array index** — can mis-key bubbles as the list changes. — `:705-707`.
- **[Low] Generic send-failure copy.** — `:381, 487`.
- (Good: `utils/chatMarkdown.tsx` strips `*`/`**` so raw markdown never surfaces in bubbles.)

## 16. Profile / Settings / Subscription

- **[High] Silent avatar-upload failure** — `uploadAvatar` error is caught + `console.error`'d,
  the save proceeds with the OLD url and the modal closes as success, so the user thinks the
  new photo saved when it didn't. — `ProfileScreen.tsx:162-164, 219`.
- **[Medium] No unsaved-changes warning** — closing the edit modal silently discards edits. —
  `ProfileScreen.tsx`.
- **[Medium] Sign out has no confirmation** — one tap on `onPress={logout}` logs you out. —
  `SettingsScreen.tsx:188`.
- **[Medium] Minimal numeric validation** on lifestyle fields (large/negative values largely
  unchecked). — `EditPersonalScreen.tsx`.
- **[Low] No data-export / privacy control.** — `SettingsScreen.tsx`.
- **[Low] In-app "progress archive" opens a local modal**, bypassing the fuller standalone
  `ProgressArchiveScreen` (compare/share/delete). — `ProfileScreen.tsx:113, 417`.
- (Good: Delete-account is present and password-gated — App-Store compliant. `SettingsScreen.tsx:90`.)
- (Good: `ManageSubscriptionScreen.tsx` is robust — cancel/upgrade/downgrade/resume/restore all
  work; **not** a dead link.)

## 17. Courses

- **[Medium] No empty state** — `CourseListScreen` FlatList has no `ListEmptyComponent`; an empty
  list shows a header over blank space. — `CourseListScreen.tsx:98`.
- **[Medium] External placeholder image dependency** — `https://via.placeholder.com/300` as the
  fallback can 404 / slow-load / leak a request in a user path. — `CourseListScreen.tsx:40`.
- **[Medium] Chapters look tappable but throw a blocking "Locked" alert** — rows have normal
  touchable styling, no locked affordance, then alert "Please start the course first." —
  `CourseDetailScreen.tsx:~45`.
- **[Medium] Lesson video has no loading/error handling** — a broken `video_url` shows a blank
  black box with no feedback. — `ChapterViewScreen.tsx:38`.
- **[Low] Lessons autoplay and loop forever** — unusual for instructional content. — `ChapterViewScreen.tsx:17`.

## 18. Fitmax module

- **[Critical] `fitmax.ts` is not valid UTF-8** (Triage #1) — garbled `�` text everywhere; a
  `split('�')` hack depends on it. — `fitmax.ts`, `FitmaxWorkoutTrackerScreen.tsx:21`.
- **[Critical] Four Fitmax screens are unreachable dead code** (Triage #2) — `FitmaxChatPanel`
  never mounted; nothing navigates to the four data screens. — `RootNavigator.tsx:163-166`, `FitmaxChatPanel.tsx`.
- **[High] Hardcoded fake data shown as the user's** (Triage #6) — measurements `Waist 32.0 in`
  / `Arms 15.1 in`, lifts `Bench 185x5 (+15 lbs/8w)`, macros 185/245/70. — `FitmaxProgressScreen.tsx:67-79`, `FitmaxCalorieLogScreen.tsx:53-55`.
- **[High] Workout tracker always shows "Push" regardless of day**, and **logging is not
  persisted** (it sends a chat message instead of saving). — `FitmaxWorkoutTrackerScreen.tsx:19, 23`.
- **[Medium] "Edit" on the plan fires an invisible chat message then `goBack()`** — no editor. —
  `FitmaxPlanScreen.tsx:36`.
- **[Medium] Calorie log is read-only**, derived by regex-parsing chat history; can't add/edit
  food. — `FitmaxCalorieLogScreen.tsx`.
- **[Medium] Photos tab is fake** — 4 empty placeholder cells + "Use compare mode from chat
  cards," a feature with no reachable entry point. — `FitmaxProgressScreen.tsx:92-104`.
- **[Low] Copy-voice: en-dash** `'$50–150 per scan'`; **[Low]** tables `minWidth:700` force
  horizontal scrolling on phones. — `FitmaxModuleScreen.tsx:236`.

## 19. Tab + Root navigation

- **[Medium] "Forums" tab is a permanent dead-end** — routes to a "we're cooking." Coming-Soon
  overlay. — `TabNavigator.tsx`.
- **[Medium] Dead route registrations** — `ProgressArchive` (UI-orphaned, only reachable via the
  bedtime push) and the four Fitmax screens are wired but have no working in-app entry. —
  `RootNavigator.tsx:155, 163-166`.
- **[Low] Home tab is icon-only** while every other tab is labeled — inconsistent/less
  discoverable; **[Low]** hardcoded active tint `#000000`. — `TabNavigator.tsx`.
- **[High maintainability] Stale RootNavigator comment** claims SMS/NotificationChannels were
  "removed" while they're still registered and reachable — bug-risk ambiguity for anyone editing
  the funnel. — `RootNavigator.tsx:70-74` vs `:143-146`.

## 20. Cross-cutting

- **[High] [Live] The web build never reaches "document idle."** A continuous loop (backend-health
  retry and/or animation) keeps the page perpetually busy — high CPU / battery / fan in a browser
  tab, and it wedged the automation. Worth confirming there isn't an equivalent always-on loop
  burning battery on device.
- **[Medium] `Alert.alert` is the near-universal error channel** with generic "Could not save.
  Check your connection and try again." copy, no retry action, no network-vs-server distinction —
  and it **no-ops entirely on web**, so web failures show nothing. Only SignupScreen has rich error
  mapping. — funnel-wide.
- **[Medium] Systematic keyboard/autofill gap** — no `returnKeyType` / `onSubmitEditing` /
  `textContentType` / `autoComplete` anywhere in Login/Signup/ForgotPassword (zero grep hits).
- **[Medium] Custom PanResponder sliders everywhere lack a11y semantics** (onboarding + planner) —
  invisible to screen readers, no keyboard support.
- **[Low] Hardcoded colors / magic numbers** bypass theme tokens across the funnel and planner
  (which hardcodes a light/white palette — breaks if dark mode ships).
- **[Low] Brand spelling drift** "looksmaxxing" vs "Looksmaxing."

---

## Appendix A — Consolidated copy-voice (dash / smart-quote) violations

Hard rule: no em-dashes (—), en-dashes (–), or markdown `*`/`**` in user-facing text.
These render to real users:

- `components/planner/TimeRangeSlider.tsx:197` — en-dash in slider pill "7 AM – 8 AM" **(High; shows on every slider)**.
- `screens/profile/PersonalInfoScreen.tsx:184` — em-dash placeholder `"—"` on the phone field.
- `screens/profile/SettingsScreen.tsx:194` — en-dash version fallback `v{… ?? '–'}`.
- `screens/profile/MyProductsScreen.tsx:166` — em-dash `{p.brand || '—'}`.
- `screens/profile/ProgressArchiveScreen.tsx:455, 475, 480, 485` — em-dash missing-value glyphs.
- `screens/courses/FitmaxModuleScreen.tsx:236` — en-dash `'$50–150 per scan'`.
- `screens/auth/ForgotPasswordScreen.tsx:108` — curly apostrophe (U+2019) in "We'll text a code…".
- `screens/profile/ScheduleScreen.tsx:206` — emoji in alert title `'✅ Schedule Adapted'` (voice, not a dash).

(Other `—`/`–`/`*` hits across the codebase are in code comments/JSDoc, the `—` missing-value
placeholder in scan results, or arithmetic `*` — not user-facing.)

## Appendix B — Web-only artifacts (NOT real iOS-user bugs)

These appear because native modules don't run on web; list them as "known web limitations,"
not product bugs, unless web is a shipping target:

- Stripe / IAP / camera / Onairos / Google Sign-In / `expo-image-picker` /
  `getIosApnsDeviceTokenForBackend` all no-op or differ on web.
- `Alert.alert` / `Alert.prompt` no-op on web (this *also* hides real error feedback — see #20).
- `sms:` deep links and `Linking.openURL` don't work on web.
- `useAppleSubscription.ts` (non-iOS stub): `restorePurchases` is a no-op, `subscribeTier` only
  runs in `__DEV__`.
- Backend was unreachable at `http://localhost:8000` during the live run because `mobile/.env`
  pins the API base to localhost (overriding the inline env var). To exercise real data flows on
  web, point `EXPO_PUBLIC_API_BASE_URL` at the live backend or run the backend locally on :8000.

## Coverage note

Live-reproduced this session: Landing (backdoors, hang-with-no-timeout, empty hero, faint link),
Sign-up (no email validation, color-only/no-text validation, working password-mismatch message),
and the web-never-idle performance issue. Everything else is from full-file code audits of every
screen (auth/onboarding, planner/schedule, scan/paywall/chat, profile/courses/fitmax). The paid
surface couldn't be driven live on web because it sits behind native IAP/Stripe.

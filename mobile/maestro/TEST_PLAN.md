# Max — Maestro Test Plan (iOS Simulator, Fabric / New Architecture)

> Hand-off spec for an execution agent. Every selector below is grounded in the
> real codebase (`/Users/home/maxapp/mobile`). App id: **`com.cannon.mobile`**.
> Simulator: iPhone 17 Pro, iOS 26. Metro on `:8081`, FastAPI backend on `:8000`.

## Environment facts that shape every test

| Fact | Value | Consequence for tests |
|------|-------|----------------------|
| Feature flags | Compile-time constants in `constants/featureFlags.ts`: `onboardingV2=true`, `newNav=false`, `faceScan=true`. `setFlag()` is a no-op. | Cannot toggle flags via simctl. Active tabs = **legacy** set: **Home / Planner / Scan / Explore / Coach**. The `You`/`Today` V2 tabs are NOT active — do not target them. |
| Paid-app gate | `RootNavigator.tsx:98` → `treatAsFull = isPaid \|\| (onboardingV2 && onboardingCompleted)` | Finishing onboarding unlocks the **entire** paid app (`Main`) with no payment. This is the soft gate — see §4. |
| Real hard gate | `FaceScanResultsScreen` → `treatAsPaid = isPaid \|\| isScanUser \|\| scan?.is_unlocked` | Scan scores stay locked behind entitlement even after onboarding. This gate WORKS. |
| Fabric tap bug | Maestro XCTest `tap()` does NOT fire RN `onPress` unless the target has an explicit `accessibilityLabel`. | Any navigation/submit tap needs a label added (see §5). Tests that only `assertVisible` need no source change. |
| Nested `<Text>` | Children merge into one a11y string. | Match the full merged string, and avoid regex metachars. e.g. tap `"create account"` (label added), never `"New here?"` (the `?` is a regex quantifier). |
| Expo dev modal | Disabled via `EXDevMenuIsOnboardingFinished=YES` (run `setup_simulator.sh`). | No `when: visible` guard needed for it anymore. |

---

## 1. Test Suite Map

| File | Covers | Priority |
|------|--------|----------|
| `smoke_launch.yaml` | App cold-starts to Login without crashing; wordmark renders. | **P0** |
| `smoke_no_redbox.yaml` | No RN error overlay / "Something went wrong" on any first paint. | **P0** |
| `auth_login_render.yaml` | Login screen shows all fields + CTAs, no error state. | **P0** |
| `auth_login_validation.yaml` | Empty submit shows "Please fill in all fields." | **P0** |
| `auth_login_success.yaml` | Valid creds → leaves Login (lands on funnel/Main). | **P0** |
| `auth_signup_render.yaml` | Signup form renders all 4 inputs + legal links. | **P0** |
| `auth_signup_validation.yaml` | Per-field validation errors fire on bad input. | **P1** |
| `auth_forgot_password.yaml` | Forgot-password step 1 (phone) renders + advances. | **P2** |
| `nav_login_to_signup.yaml` | "create account" link navigates Login→Signup. | **P0** |
| `nav_landing_to_login.yaml` | Landing "Sign in" → Login (guest entry). | **P1** |
| `onboarding_v2_flow.yaml` | Full multi-step OnboardingV2 happy path → reaches paid app. | **P1** |
| `onboarding_v2_back.yaml` | Back button steps backward without losing state/crashing. | **P2** |
| `home_dashboard_render.yaml` | Home tab renders greeting + habits section (authed+paid). | **P1** |
| `nav_tabs_no_crash.yaml` | Tapping each legacy tab (Home/Explore/Coach) doesn't crash. | **P1** |
| `chat_entry_render.yaml` | Coach tab → MaxChat shows starter prompts + input. | **P1** |
| `chat_send_message.yaml` | Typing + Send posts a message, assistant replies. | **P1** |
| `camera_scan_entry.yaml` | Scan tab → FaceScan shows camera/permission UI. | **P1** |
| `camera_capture_trigger.yaml` | Shutter capture + Analyze submit (needs labels). | **P1** |
| `paywall_scan_locked_free.yaml` | **§4** FaceScanResults shows lock UI for non-paid. | **P0** |
| `paywall_scan_unlock_cta.yaml` | **§4** "Unlock full results" → Payment screen. | **P0** |
| `paywall_onboarding_bypass.yaml` | **§4** Documents soft gate: onboarding-complete unpaid user reaches `Main`. Expected to expose the gap. | **P0** |
| `paywall_premium_modal_dead.yaml` | **§4** TabNavigator PremiumGateModal never shows (dead code). | **P2** |
| `payment_screen_render.yaml` | Paywall plans + prices + legal links render. | **P1** |
| `settings_render.yaml` | Settings rows render; sign-out present. | **P2** |
| `settings_delete_account_modal.yaml` | Delete-account modal opens, password field present. | **P2** |
| `profile_render.yaml` | Profile shows name, maxes, trophy case. | **P2** |

---

## 2. Per-file specs

> Maestro YAML conventions used below: `id:` matches `testID`, a bare string
> matches `accessibilityLabel`/text. Pseudo-YAML shows intent — the executing
> agent writes the real flow. Every flow begins `appId: com.cannon.mobile`.

### P0 — smoke_launch.yaml
- **Preconditions:** `setup_simulator.sh` run; Metro+backend up; auth state irrelevant.
- **Steps:**
  ```
  launchApp
  waitForAnimationToEnd timeout=10000
  assertVisible "max"
  ```
- **Pass:** wordmark `"max"` visible, no crash dialog.
- **Limitations:** none (assert-only).
- **Source changes:** none.

### P0 — smoke_no_redbox.yaml
- **Preconditions:** as above.
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  assertNotVisible "Something went wrong"
  assertNotVisible "Error"
  takeScreenshot boot_state
  ```
- **Pass:** neither error string present.
- **Limitations:** Only catches the app-level `AppErrorBoundary` ("Something went wrong") and generic "Error" text; native redboxes in release-style builds won't surface text — pair with a screenshot diff.
- **Source changes:** none.

### P0 — auth_login_render.yaml
- **Preconditions:** logged-out (`CLEAR_AUTH=1 ./setup_simulator.sh`), Login is initial route.
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  assertVisible "max"
  assertVisible "welcome back"
  assertVisible "Email or username"   # TextInput placeholder
  assertVisible "Password"            # TextInput placeholder
  assertVisible "Continue"
  assertVisible "Continue with Google"
  assertVisible "Continue with Apple"
  ```
- **Pass:** all present, no error text.
- **Limitations:** render-only; does not exercise auth.
- **Source changes:** none.

### P0 — auth_login_validation.yaml
- **Preconditions:** logged-out.
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  tapOn "Continue"                    # submit empty — NEEDS LABEL (see §5)
  assertVisible "Please fill in all fields."
  ```
- **Pass:** inline validation string appears.
- **Limitations:** The submit `TouchableOpacity` already sets `accessibilityLabel="Continue"` — but verify the tap fires `onPress` (Fabric). If not, the label is missing/incorrect.
- **Source changes:** confirm `accessibilityLabel="Continue"` on the login submit button (LoginScreen).

### P0 — auth_login_success.yaml
- **Preconditions:** logged-out; a known test account exists in Supabase (`MAX_TEST_EMAIL`/`MAX_TEST_PASSWORD` env, injected via Maestro `--env`).
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  tapOn "Email or username"; inputText ${MAX_TEST_EMAIL}
  tapOn "Password"; inputText ${MAX_TEST_PASSWORD}
  hideKeyboard
  tapOn "Continue"                    # NEEDS LABEL
  waitForAnimationToEnd timeout=15000
  assertNotVisible "welcome back"     # left the Login screen
  ```
- **Pass:** Login screen no longer visible (advanced into funnel or Main).
- **Limitations:** Depends on live backend + seeded account. `inputText` into RN TextInputs works without labels; only the submit tap needs the label.
- **Source changes:** login submit `accessibilityLabel="Continue"` (verify).

### P0 — auth_signup_render.yaml
- **Preconditions:** logged-out; navigate Login→Signup first (see nav test) or deep-link.
- **Steps:**
  ```
  # from Login:
  tapOn "create account"              # label added (§5)
  waitForAnimationToEnd
  assertVisible "Create your account"
  assertVisible "Full name"
  assertVisible "Username"
  assertVisible "Email address"
  assertVisible "Password"
  assertVisible "Terms"
  assertVisible "Privacy Policy"
  ```
- **Pass:** all 4 input placeholders + legal links present.
- **Source changes:** `accessibilityLabel="create account"` on LoginScreen sign-up link (already added).

### P1 — auth_signup_validation.yaml
- **Preconditions:** on Signup.
- **Steps:**
  ```
  tapOn "Continue"                    # submit empty — NEEDS LABEL (verify "Continue")
  assertVisible "Name is required."
  # then fill a bad username:
  tapOn "Username"; inputText "ab"
  tapOn "Continue"
  assertVisible "Username needs at least 3 characters."
  ```
- **Pass:** field-level errors render.
- **Limitations:** Many error strings; assert one or two representative ones.
- **Source changes:** signup submit `accessibilityLabel="Continue"` (verify).

### P2 — auth_forgot_password.yaml
- **Preconditions:** on Login.
- **Steps:**
  ```
  tapOn "Forgot password?"            # NEEDS LABEL — "?" is regex-safe only as exact text; add label "forgot password"
  waitForAnimationToEnd
  assertVisible "reset password"
  assertVisible "National number"
  ```
- **Pass:** reset step-1 renders.
- **Limitations:** Sending an SMS code hits Sendblue — do NOT submit in CI. Render-only.
- **Source changes:** `accessibilityLabel="forgot password"` on the Forgot link (ForgotPassword entry in LoginScreen).

### P0 — nav_login_to_signup.yaml
- **Preconditions:** logged-out, on Login.
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  assertVisible "welcome back"
  tapOn "create account"              # label present
  waitForAnimationToEnd
  assertVisible "Create your account"
  ```
- **Pass:** Signup header visible.
- **Limitations:** This is the canonical proof the Fabric-tap-with-label pattern works.
- **Source changes:** none beyond the existing `create account` label.

### P1 — nav_landing_to_login.yaml
- **Preconditions:** Guest stack with Landing as entry (only when no token AND not coming straight to Login). If the build boots straight to Login, mark this N/A.
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  assertVisible "Get started"
  tapOn "Sign in"                     # NEEDS LABEL (§5)
  assertVisible "welcome back"
  ```
- **Source changes:** `accessibilityLabel="Sign in"` on LandingScreen sign-in link.

### P1 — onboarding_v2_flow.yaml
- **Preconditions:** authed, onboarding NOT completed (fresh account). Initial route = `Onboarding`.
- **Steps (pseudo — 10 steps, OnboardingV2):**
  ```
  assertVisible "What are we working on?"
  tapOn "Skinmax"; tapOn "Fitmax"            # multi-select up to 3 — NEED LABELS
  tapOn "Continue"                           # CTA — NEEDS LABEL
  assertVisible "What's pulling you here?"
  tapOn "Just curious"                       # NEEDS LABEL
  tapOn "Continue"
  # ... day-shape / work / chronotype / meals / rhythm / anchors steps ...
  # each: assertVisible <step title>; make selection (LABELS); tapOn "Continue"
  assertVisible "Here's your day"
  tapOn "Build my day"                       # final CTA — NEEDS LABEL
  waitForAnimationToEnd timeout=15000
  assertVisible "HABITS"                     # landed on Home (paid app)
  ```
- **Pass:** reaches the paid app Home after the recap.
- **Limitations:** Wheel-picker time steps are hard to drive deterministically; accept defaults and only tap "Continue". Every tile/CTA needs a label (§5) — this is the single biggest source-change cluster. Until labels land, this test can only `assertVisible` each step title, not advance.
- **Source changes:** labels on all OnboardingV2 goal tiles, motivation tiles, chronotype/meal/anchor tiles, and the step CTA (`"Continue"` / `"Build my day"`). See §5.

### P2 — onboarding_v2_back.yaml
- **Preconditions:** mid-onboarding (advance 2 steps first).
- **Steps:** `tapOn "Back"` (label exists) → `assertVisible` previous step title.
- **Source changes:** none (Back already labeled).

### P1 — home_dashboard_render.yaml
- **Preconditions:** authed + `treatAsFull` (paid OR onboarding-complete). Home tab active (legacy nav).
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  assertVisible "HABITS"
  # greeting is time-dependent — assert one of the three or skip
  ```
- **Pass:** Home renders its habits section.
- **Limitations:** Greeting ("Good morning,"/etc.) varies by clock; don't hard-assert it.
- **Source changes:** none for render.

### P1 — nav_tabs_no_crash.yaml
- **Preconditions:** authed + paid app, Home visible.
- **Steps:**
  ```
  tapOn "Explore"                # tab label — NEEDS LABEL on tab button
  waitForAnimationToEnd; assertNotVisible "Something went wrong"
  tapOn "Coach"                  # NEEDS LABEL
  waitForAnimationToEnd; assertVisible "What can I help with?"
  tapOn "Home"                   # NEEDS LABEL
  waitForAnimationToEnd; assertVisible "HABITS"
  ```
- **Pass:** each tab swaps without an error boundary.
- **Limitations:** Bottom-tab buttons render via React Navigation; their `tabBarButton`/`tabBarAccessibilityLabel` must be set for taps to fire under Fabric. The "Scan" tab is a custom center button → covered separately.
- **Source changes:** `tabBarAccessibilityLabel` on each tab in TabNavigator (§5).

### P1 — chat_entry_render.yaml
- **Preconditions:** paid app; navigate to Coach tab.
- **Steps:**
  ```
  tapOn "Coach"
  assertVisible "What can I help with?"
  assertVisible "Ask Max anything"          # input placeholder
  assertVisible "Build my plan for today"   # starter chip
  ```
- **Pass:** chat empty-state renders.
- **Source changes:** Coach `tabBarAccessibilityLabel` (§5).

### P1 — chat_send_message.yaml
- **Preconditions:** on MaxChat, backend up.
- **Steps:**
  ```
  tapOn "Ask Max anything"; inputText "hi"
  tapOn "Send"                              # MorphSend a11y "Send" — already labeled
  waitForAnimationToEnd timeout=20000
  assertNotVisible "Something went wrong"
  ```
- **Pass:** message sends, no crash; (optionally) assert streamed text appears.
- **Limitations:** MorphSend already exposes `accessibilityLabel="Send"` when text present — verify tap fires. Assistant latency: use a long timeout, don't assert exact reply text.
- **Source changes:** none if "Send" label confirmed working.

### P1 — camera_scan_entry.yaml
- **Preconditions:** paid app. Scan opens the camera screen.
- **Steps:**
  ```
  # ScanCenter is a custom center tab button → needs label "Scan"
  tapOn "Scan"
  waitForAnimationToEnd
  assertVisible "Front"                     # angle label
  # On a sim with no camera grant you'll instead see:
  # assertVisible "Camera access is needed for your face scan."
  ```
- **Pass:** either the camera framing UI ("Front"/"Straight on…") or the permission prompt renders.
- **Limitations:** Simulator has no camera — capture path can't produce a real frame; this test verifies entry only.
- **Source changes:** `accessibilityLabel="Scan"` on the ScanCenter center button (TabNavigator). Add labels to shutter/Analyze for the next test.

### P1 — camera_capture_trigger.yaml
- **Preconditions:** on FaceScan with library-upload fallback (sim has no camera).
- **Steps:**
  ```
  tapOn "Use photo library"                 # NEEDS LABEL — upload fallback
  # (Maestro can't drive the iOS photo picker reliably; OR:)
  tapOn "Allow camera"                       # NEEDS LABEL if permission prompt
  # capture path:
  tapOn "Capture"                            # shutter — NEEDS LABEL
  tapOn "Next angle"                         # NEEDS LABEL
  # repeat x3 then:
  tapOn "Analyze"                            # NEEDS LABEL — submits triple
  waitForAnimationToEnd timeout=20000
  assertVisible "%"                          # AnalyzingScreen progress
  ```
- **Pass:** reaches AnalyzingScreen.
- **Limitations:** **Cannot fully run on Simulator** — no camera frames, and the system photo picker is outside the app's a11y tree. Best-effort: assert shutter/Analyze controls are present + labeled; full capture→analyze needs a physical device or a dev build with a mock image source.
- **Source changes:** labels on shutter ("Capture"), "Retake", "Next angle", "Analyze", "Allow camera", library-upload (§5).

### P0 — paywall_scan_locked_free.yaml  *(see §4)*
- **Preconditions:** authed, **non-paid** (`isPaid=false`, not a scan user), a completed scan exists so FaceScanResults has data. Reach FaceScanResults.
- **Steps:**
  ```
  assertVisible "Your Analysis"
  assertVisible "Unlock your full results"   # locked CTA/hint
  assertVisible "Unlock full results"         # primary CTA text (locked)
  assertNotVisible "Continue"                 # paid CTA must be absent
  ```
- **Pass:** lock UI present, paid-only "Continue" CTA absent, no numeric scores leaked.
- **Limitations:** Needs a non-paid account with a finished scan. The lock is real (`treatAsPaid`), so this test should PASS today.
- **Source changes:** none required to assert; optional `testID="scan-locked-cta"` for robustness.

### P0 — paywall_scan_unlock_cta.yaml  *(see §4)*
- **Preconditions:** as above, FaceScanResults locked.
- **Steps:**
  ```
  tapOn "Unlock full results"                # NEEDS LABEL on the CTA
  waitForAnimationToEnd
  assertVisible "Max Pro"                     # PaymentScreen header
  ```
- **Pass:** navigates to Payment.
- **Source changes:** `accessibilityLabel="Unlock full results"` on the FaceScanResults primary CTA + the in-overlay unlock button (§5).

### P0 — paywall_onboarding_bypass.yaml  *(see §4 — documents the gap)*
- **Preconditions:** authed, **non-paid**, onboarding **completed** (`onboarding.completed=true`, `is_paid=false`).
- **Steps:**
  ```
  launchApp; waitForAnimationToEnd
  assertVisible "HABITS"                      # i.e. landed on Main/Home, unpaid
  ```
- **Expected result TODAY:** **PASS** — which proves the soft gate: an unpaid user is inside the full app. This test is written to *document* the bypass. Once a hard entitlement gate is added, flip it to `assertNotVisible "HABITS"` / `assertVisible "Max Pro"`.
- **Limitations:** Requires seeding a user in that exact state (onboarding done, unpaid). Do it via backend test fixture or a faux-signup dev endpoint.
- **Source changes:** none in the app for the test; the FIX (separate `entitled` from `onboardingCompleted` in `RootNavigator.tsx:98`) is the dev action this test exists to motivate.

### P2 — paywall_premium_modal_dead.yaml  *(see §4)*
- **Preconditions:** paid app.
- **Steps:**
  ```
  tapOn "Scan"
  assertNotVisible "Premium Feature"          # PremiumGateModal body never set visible
  ```
- **Pass:** modal text absent (confirms `showGate` is dead code, not a live gate).
- **Source changes:** none — this is a documentation test.

### P1 — payment_screen_render.yaml
- **Preconditions:** reach Payment (via scan-unlock CTA or unpaid funnel).
- **Steps:**
  ```
  assertVisible "Max Pro"
  assertVisible "Daily Face Scans"
  assertVisible "Chad"
  assertVisible "Restore Purchases"
  ```
- **Pass:** plan grid + restore link render.
- **Limitations:** Do NOT tap purchase — real IAP / StoreKit. Render-only.
- **Source changes:** none.

### P2 — settings_render.yaml
- **Preconditions:** paid app; navigate Profile→Settings (or deep route).
- **Steps:** `assertVisible "Settings"`, `assertVisible "Sign out"`, `assertVisible "Delete account"`.
- **Source changes:** label the Settings entry-point row if reaching it requires a tap.

### P2 — settings_delete_account_modal.yaml
- **Preconditions:** on Settings.
- **Steps:**
  ```
  tapOn "Delete account"                      # NEEDS LABEL
  assertVisible "Enter your password"
  tapOn "Cancel"                              # NEEDS LABEL — close without deleting
  ```
- **Pass:** modal opens then dismisses. **Never tap "Delete".**
- **Source changes:** `accessibilityLabel` on the Delete-account row + modal Cancel/Delete buttons (§5).

### P2 — profile_render.yaml
- **Preconditions:** paid app; on Profile.
- **Steps:** `assertVisible "Your Maxes"`, `assertVisible "Trophy Case"`.
- **Source changes:** none for render.

---

## 3. Priority ranking

**P0 — blocks ship**
`smoke_launch`, `smoke_no_redbox`, `auth_login_render`, `auth_login_validation`,
`auth_login_success`, `auth_signup_render`, `nav_login_to_signup`,
`paywall_scan_locked_free`, `paywall_scan_unlock_cta`, `paywall_onboarding_bypass`.

**P1 — core UX**
`auth_signup_validation`, `nav_landing_to_login`, `onboarding_v2_flow`,
`home_dashboard_render`, `nav_tabs_no_crash`, `chat_entry_render`,
`chat_send_message`, `camera_scan_entry`, `camera_capture_trigger`,
`payment_screen_render`.

**P2 — nice to have / edge**
`auth_forgot_password`, `onboarding_v2_back`, `paywall_premium_modal_dead`,
`settings_render`, `settings_delete_account_modal`, `profile_render`.

---

## 4. Paywall security tests (HARD gate vs SOFT gate)

The app has **two different gates**, and only one is real:

1. **Content gate on scan results — REAL / HARD.**
   `FaceScanResultsScreen`: `treatAsPaid = isPaid || isScanUser || scan?.is_unlocked`;
   `locked = !treatAsPaid`. When locked, scores are replaced by lock icons, the
   "Recommended" + Share/Save blocks are hidden, and the CTA reads "Unlock full
   results" → Payment.
   - `paywall_scan_locked_free.yaml` and `paywall_scan_unlock_cta.yaml` verify it.
   - **These PASS today** — entitlement genuinely gates the content.

2. **App-shell gate — SOFT (the gap).**
   `RootNavigator.tsx:98`: `treatAsFull = isPaid || (onboardingV2 && onboardingCompleted)`.
   With `onboardingV2` hardcoded `true`, **any user who finishes onboarding gets
   the entire paid app (`Main`, all premium screens) without paying.** Premium
   screens aren't entitlement-checked individually — they're simply registered in
   the "paid" stack, and stack selection keys off onboarding completion, not money.
   - `paywall_onboarding_bypass.yaml` asserts `assertVisible "HABITS"` for an
     **unpaid, onboarding-complete** user. It **PASSES today**, and that pass *is
     the finding*: the shell is not entitlement-gated.
   - **Will FAIL to protect revenue until** `RootNavigator` separates an
     `entitled` flag from `onboardingCompleted`. After the fix, invert the assertion
     to `assertNotVisible "HABITS"` + `assertVisible "Max Pro"`.

3. **TabNavigator `PremiumGateModal` — DEAD CODE.**
   The "Premium Feature" modal exists but its `showGate` state is never set true.
   `paywall_premium_modal_dead.yaml` asserts it never appears, so nobody mistakes
   it for an active gate.

**Which tests currently FAIL their security intent:**
- `paywall_onboarding_bypass.yaml` — passes mechanically but **documents an open
  hole**. Treat its green as RED for ship-readiness until the entitlement split lands.
All other paywall tests pass and correctly enforce the real content gate.

---

## 5. Source-code changes manifest

> Add these before the corresponding flows can drive navigation. Pattern:
> add `accessibilityLabel` (required for Fabric tap) and `testID` (selector
> robustness). Text-only `assertVisible` tests need none of these.

```
File: screens/auth/LoginScreen.tsx
Component: <TouchableOpacity> (login submit)
Add: accessibilityLabel="Continue" testID="login-submit-btn"   # verify existing label fires onPress

File: screens/auth/LoginScreen.tsx
Component: <TouchableOpacity> (Forgot password link)
Add: accessibilityLabel="forgot password" testID="forgot-password-link"

File: screens/auth/LoginScreen.tsx
Component: <TouchableOpacity> (create-account link)
Status: DONE — accessibilityLabel="create account" testID="create-account-btn"

File: screens/auth/SignupScreen.tsx
Component: <TouchableOpacity> (signup submit)
Add: accessibilityLabel="Continue" testID="signup-submit-btn"   # verify

File: screens/onboarding/LandingScreen.tsx
Component: <TouchableOpacity> (Sign in link)
Add: accessibilityLabel="Sign in" testID="landing-signin-link"

File: screens/onboarding/OnboardingV2Screen.tsx
Component: <TouchableOpacity> (each goal tile: Skinmax/Fitmax/Hairmax/Heightmax/Bonemax)
Add: accessibilityLabel="<tile title>" testID="onboarding-goal-<key>"

File: screens/onboarding/OnboardingV2Screen.tsx
Component: <TouchableOpacity> (motivation, chronotype, meal, anchor tiles)
Add: accessibilityLabel="<option label>" testID="onboarding-opt-<key>"

File: screens/onboarding/OnboardingV2Screen.tsx
Component: <TouchableOpacity> (step CTA)
Add: accessibilityLabel="Continue" (and "Build my day" on final step) testID="onboarding-cta"

File: navigation/TabNavigator.tsx
Component: each Tab.Screen (Home, Explore, Chat/Coach) options
Add: tabBarAccessibilityLabel="Home" | "Explore" | "Coach"

File: navigation/TabNavigator.tsx
Component: ScanCenter custom center button (TouchableOpacity)
Add: accessibilityLabel="Scan" testID="tab-scan-btn"

File: screens/scan/FaceScanScreen.tsx
Component: <TouchableOpacity> (shutter)
Add: accessibilityLabel="Capture" testID="scan-shutter-btn"

File: screens/scan/FaceScanScreen.tsx
Component: <TouchableOpacity> (Retake / Next angle / Analyze / Allow camera / library upload)
Add: accessibilityLabel="Retake" | "Next angle" | "Analyze" | "Allow camera" | "Use photo library"
     testID="scan-retake|scan-next|scan-analyze|scan-allow-camera|scan-upload"

File: screens/scan/FaceScanResultsScreen.tsx
Component: <TouchableOpacity> (primary CTA + in-overlay unlock button)
Add: accessibilityLabel="Unlock full results" testID="scan-unlock-cta"

File: screens/profile/SettingsScreen.tsx
Component: <TouchableOpacity> (Delete-account row, modal Cancel, modal Delete)
Add: accessibilityLabel="Delete account" | "Cancel" | "Confirm delete"
     testID="settings-delete-row|delete-cancel|delete-confirm"

File: screens/chat/MaxChatScreen.tsx
Component: MorphSend (send button)
Status: DONE — accessibilityLabel toggles "Send"/"Voice"/… ; verify tap fires onPress
```

**Note for the executing agent:** when you add `accessibilityLabel` to a
`TouchableOpacity` that wraps a nested `<Text>`, the label OVERRIDES the merged
child text for Maestro matching — so match the label you set, not the visible
copy, if they differ.

---

## 6. Simctl setup

Use the committed script: **`mobile/maestro/setup_simulator.sh`**.

```bash
# logged-in state (default):
./mobile/maestro/setup_simulator.sh

# logged-out cold start (clears keychain → lands on Login):
CLEAR_AUTH=1 ./mobile/maestro/setup_simulator.sh

# target a specific simulator:
./mobile/maestro/setup_simulator.sh <UDID>
```

It: resolves the booted sim, boots/opens Simulator.app, sets
`EXDevMenuIsOnboardingFinished=YES` (kills the Expo dev modal), optionally resets
the keychain, and checks Metro(:8081)+backend(:8000). It deliberately does **not**
try to flip feature flags — they are compile-time constants in this build.

**State matrix the tests need (seed via backend fixtures / faux-signup dev endpoints):**

| Test group | auth | is_paid | onboarding.completed | scan exists |
|------------|------|---------|----------------------|-------------|
| smoke / login render | logged-out | — | — | — |
| login success | seeded account | any | any | — |
| onboarding flow | authed | false | **false** | — |
| home / tabs / chat / scan-entry | authed | true *(or onboarding-complete)* | true | — |
| paywall_scan_locked_free / unlock | authed | **false** | any | **yes** |
| paywall_onboarding_bypass | authed | **false** | **true** | — |
| payment render | authed | false | any | — |

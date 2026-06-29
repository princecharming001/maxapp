# RALPH_SIM_FIXES.md — fix referral-screen + main-tour bugs on iOS sim (Ralph loop)

> Persistent fix spec for a Ralph loop. **Read this file in full at the start of every iteration.** Do the **first unchecked UNIT**, run its **VERIFY on the iOS simulator with Maestro**, record the result in `SIM_FIXES_LOG.md`, check the unit off with a dated one-line note in the **Iteration Log**, then `commit + push` (prefix `simfix:`) and continue. Do **not** skip ahead. A bug is only "fixed" when its Maestro flow passes **3 times consecutively on a freshly-restarted simulator** — green once is not enough for a flaky bug.

## GOAL

Two reproducible-on-device bugs, both verified fixed by driving the iOS simulator with Maestro:

1. **Referral screen never appears before Payment.** After turning the feature on (`referrals` / `referrals_enabled`) and adding `ReferralCodeScreen` between every paywall entry point and `PaymentScreen`, the referral step does not show — tapping "Unlock full results" goes straight to the paywall. Find the real root cause on a clean build and fix it so the referral screen reliably shows first, and `CASH99` grants free access (routes past Payment).
2. **Main app tour ("guided walkthrough") doesn't present sometimes.** On the post-pay Home entry the spotlight tour intermittently fails to appear in the iOS simulator. Make presentation **deterministic** (presents every cold launch when it should), without breaking the kill-switch or the post-pay-redirect race guards.

## CONSTRAINTS (hard rules, re-read every iteration)

- Branch **`sim-fixes`** (create in U0). **Never push to `main`.** **Never** start an EAS / TestFlight build — fix and verify against the **local dev build on the iOS simulator** only.
- After any code change: `cd mobile && npx tsc --noEmit` clean, and `cd backend && pytest -q` no worse than the documented baseline. Don't claim a fix without a **green Maestro run** that you actually executed.
- Don't weaken or delete the tour's safety guards (the `mainAppTour` kill-switch, `stillSafeToStart()`, the post-pay redirect bail). The tour must still NEVER trap touches on the post-pay Home.
- Small, incremental commits. Don't touch other loops' uncommitted WIP files. Don't refactor beyond the bug.
- These bugs may be **flaky** — "fixed" requires the VERIFY flow green **3× in a row on a restarted sim**, and for the tour, **≥10/10 cold launches** present it.

## ENVIRONMENT & OPERATIONS (the simulator + Maestro runbook)

The repo already drives the sim with Maestro CLI flows in `mobile/maestro/*.yaml` (appId `com.cannon.mobile`). Use the Maestro **MCP if one is connected in this run**; otherwise use the **CLI** below. Existing useful flows: `paywall_scan_unlock_cta.yaml` (the paywall path), `discovery_payment_screen.yaml`, `task_guide_step_images.yaml`, `discovery_home_tab.yaml`, `auth_login_success.yaml`, `connect_metro.yaml` / `discovery_metro_reconnect.yaml`, `see_launcher.yaml`.

- **Boot / restart sim:** `xcrun simctl list devices booted`; boot with `xcrun simctl boot "iPhone 15"` (or the configured device) then `open -a Simulator`. **Restart the sim if a flow hangs or the app is wedged:** `xcrun simctl shutdown booted` then re-boot; for a clean state `xcrun simctl erase <udid>` (this also resets `AsyncStorage` / the `main_app_tour_seen` flag — use for tour cold-launch tests).
- **Dev build / Metro:** ensure Metro is serving this tree (`npx expo start`) and the dev client is installed on the sim. A **full reload is required** after navigation-structure changes (new `Stack.Screen`, changed `initialRouteName`) — Fast Refresh does NOT remount the navigator. If the app shows stale routing, reinstall/relaunch the app or restart Metro with `-c`.
- **Run a flow:** `maestro test mobile/maestro/<flow>.yaml` (add `--debug-output` on failure; screenshots land in the run dir).
- **Maestro/Java driver instability (known gotcha):** if Maestro hangs, errors with a driver/ADB/iOS-driver fault, or won't connect, run `pkill -9 java` and retry the flow; if still stuck, restart the sim, then retry. Treat one hang as transient — only conclude "repro" after a clean retry.
- **Resetting tour-seen between runs:** `launchApp: { clearState: true }` in the flow, or `xcrun simctl erase`, resets the `main_app_tour_seen` AsyncStorage key so the tour is eligible again.

## VERIFIED CODE POINTERS

Referral: `mobile/screens/payment/ReferralCodeScreen.tsx` (the new screen; renders "Have a referral code?"), `mobile/navigation/RootNavigator.tsx` (`ReferralCode` registered in BOTH unpaid + paid stacks; entry routed via `initialRouteName` + the `navigate('ReferralCode')` callsites), paywall CTA in `mobile/screens/scan/FaceScanResultsScreen.tsx` (`onPrimaryCta` → `goPayment` → `navigate('ReferralCode')`), backend comp `backend/services/referral_service.py` (`ensure_default_codes`, `CASH99` in `DEFAULT_COMP_CODES`), seeded in `backend/main.py` lifespan. Flags: `mobile/constants/featureFlags.ts` `referrals:true`; `backend/config.py` `referrals_enabled` default True.

Tour: `mobile/features/mainTour/useMainAppTour.ts` — `tryStart()` defers via `InteractionManager.runAfterInteractions`, then `anchorRef.measureInWindow(...)` and **bails (no retry) when `width/height` is 0** (the prime suspect for "sometimes"). Gates: `useFlag('mainAppTour')`, `isPaid`, `isFocused`, `onboarding.post_subscription_onboarding`, `onboarding.main_app_tour_completed`, `redirectPending`, and the `main_app_tour_seen` AsyncStorage key. Steps/anchor: `mobile/features/mainTour/mainTourSteps.tsx`, `AttachStep` + `TOUR_STEP` (see `HomeScreen.tsx`).

---

## UNITS (do the first unchecked one each iteration)

### [ ] U0 — Branch + sim/Maestro baseline
Create branch `sim-fixes`. Boot the sim, install/launch the dev build, and confirm Maestro can drive it (run `see_launcher.yaml` or `auth_login_success.yaml` to green; apply the `pkill -9 java` / restart runbook if needed). Create `SIM_FIXES_LOG.md` (what device/OS, build, baseline `pytest`/`tsc` status).
**VERIFY:** a trivial Maestro flow passes; log written; committed.

### [ ] U1 — Reproduce the referral bug on a clean build
On a **freshly reloaded** app (logged-in non-paid user with a completed scan), run a flow that taps the unlock CTA and asserts the **referral** screen, NOT the paywall, appears first: after `tapOn accessibilityId "Unlock full results"`, `assertVisible: "Have a referral code?"`. Use the existing `paywall_scan_unlock_cta.yaml` as the base. Record: does the referral screen show on a clean build? Screenshot either way.
**VERIFY:** the reproduction flow runs; SIM_FIXES_LOG records repro=yes/no with screenshot. (If it shows on a clean build, the user's miss was a stale build — note that, still proceed to U2/U3 to make it bulletproof.)

### [ ] U2 — Fix the referral routing root cause
If the referral screen does NOT show: diagnose precisely — is `ReferralCode` registered in the **stack the user is actually in** (unpaid vs paid)? Is the CTA reaching `goPayment`→`navigate('ReferralCode')` or a different Payment path (`CommonActions.reset`, a `navigationRef` call, params-form `navigate('Payment', …)`)? Is `initialRouteName` correct? Grep ALL Payment navigations and route every paywall entry through `ReferralCode`. Add `testID="referral-code-screen"` (+ accessibility label) to `ReferralCodeScreen` for stable assertions. Fix the true cause; never fake it by hard-coding the route in the test.
**VERIFY:** `tsc` clean; the U1 reproduction flow now `assertVisible`s the referral screen.

### [ ] U3 — Verify referral + CASH99 end-to-end (3× consecutive)
Update `paywall_scan_unlock_cta.yaml` to the new flow (Unlock → referral screen → "Continue to checkout" → "Max Pro"). Add `referral_cash99_comp.yaml`: Unlock → referral screen → type `CASH99` (assert it renders **upper-case**) → Apply → Unlock → assert the user lands **in the app with premium** (paywall NOT shown). Ensure the backend seeded `CASH99` (restart backend so `ensure_default_codes` runs; or run `scripts/seed_referral_codes.py --code CASH99 --kind free_comp --tier premium`).
**VERIFY:** both flows pass **3 consecutive runs** on a restarted sim.

### [ ] U4 — Reproduce the tour flakiness
As a paid user on the post-pay Home, cold-launch with `clearState:true` (resets `main_app_tour_seen`) and assert the tour tooltip presents (assert a step's copy/`testID` is visible). Run this **≥8 times**, counting presents vs misses to quantify the miss rate. Confirm `mainAppTour` flag is ON (a default-OFF flag would mean it never shows — check `featureFlags.ts`).
**VERIFY:** SIM_FIXES_LOG records the present/miss count over ≥8 cold launches and the flag state.

### [ ] U5 — Diagnose the tour race
Instrument `useMainAppTour.tryStart()` (temporary `console.log` of each gate + the measured rect) and run several cold launches reading `xcrun simctl spawn booted log` or Metro logs. Identify which gate drops it on the miss runs — most likely `measureInWindow` returning a **zero rect** (anchor not laid out yet) with no retry, or the re-attempt effect not re-firing, or `redirectPending`/`isFocused` racing the post-pay redirect.
**VERIFY:** SIM_FIXES_LOG names the exact failing gate with log evidence.

### [ ] U6 — Make the tour present deterministically
Fix the identified race WITHOUT weakening the guards: e.g. replace the single zero-rect bail with a **bounded retry/poll** of `measureInWindow` (a few frames / short backoff until a non-zero rect or a timeout), and/or trigger `tryStart` from the anchor's `onLayout`, and/or ensure the re-attempt effect re-runs when the anchor first measures. Keep the kill-switch, `stillSafeToStart()`, and the "persist seen the instant we start" behavior intact. Remove the temporary logs.
**VERIFY:** `tsc` clean; the tour presents on cold launch.

### [ ] U7 — Verify the tour (≥10/10 cold launches)
Add `main_tour_presents.yaml` (paid user, `clearState:true`, assert the tour tooltip visible, dismiss, assert it does NOT re-present on the next launch — the seen-guard still works). Run the cold-launch present check **10 times**; require **10/10 present**, and confirm it never re-presents after being seen.
**VERIFY:** 10/10 present on first cold launch; 0/10 re-present after seen.

### [ ] U8 — Final green-bar + report
Run both bug flows on a freshly restarted sim **3× consecutive**. Update `SIM_FIXES_LOG.md` with root causes, fixes, and the final pass counts. `tsc` clean; `pytest` no worse than baseline.
**VERIFY:** all flows green 3×; report complete.

---

## COMPLETION CRITERIA (all must hold)

1. Every UNIT checked off with a dated Iteration Log line.
2. Referral screen reliably shows before Payment, and `CASH99` grants free access — proven by Maestro flows green **3× consecutive** on a restarted sim.
3. Main app tour presents **10/10** cold launches when eligible and **never** re-presents after seen — proven by Maestro.
4. No safety guard weakened; `tsc` clean; `pytest` no worse than baseline.
5. `SIM_FIXES_LOG.md` documents both root causes + fixes + final pass counts.

When all hold, emit verbatim:
> SIM FIXES COMPLETE — referral screen + main tour verified on the iOS simulator via Maestro (3x / 10x green), log at SIM_FIXES_LOG.md.

and stop.

---

## ITERATION LOG (append one line per completed unit; newest last)

- (none yet)

# SIM_FIXES_LOG.md — RALPH_SIM_FIXES.md run log

## Environment / baseline (U0)

- **Branch:** `sim-fixes` (from `dyn-onboarding`).
- **Simulator:** iPhone 17 Pro Max — iOS 26.0 — UDID `F8FC678C-40FF-4A75-8069-B086D1BDA267` (booted; a second sim "Register Tryout" is also booted — always target the iPhone 17 Pro Max UDID with `maestro --device`).
- **Maestro:** installed at `~/.maestro/bin/maestro`; **works** — `see_launcher.yaml` green (launch → screenshot COMPLETED).
- **Metro:** running (node listening on 8081).
- **App:** `com.cannon.mobile` installed on the booted sim.
- **`timeout` gotcha:** macOS has no `timeout` binary — use the harness Bash timeout, not a `timeout` prefix. On a Maestro/Java hang: `pkill -9 java`, then re-run; if still stuck, `xcrun simctl shutdown booted` + reboot.
- **tsc:** clean (maintained green all session). **pytest:** baseline not re-run this unit; respect the repo's documented pre-existing-failure baseline before claiming regressions.

## Findings

| Bug | Root cause | Fix | Verified |
|---|---|---|---|
| Referral screen not before Payment | (U1–U2) | | |
| Main tour intermittently absent | (U4–U6) | | |

## Iteration notes

- U0 — env confirmed, Maestro drives the app, branch + log created.
- U1 (in progress) — reproduction reconnaissance:
  - **Maestro syntax:** this build rejects `accessibilityId:` (repo's older flows use it). Use `id:` (maps to the iOS accessibility identifier / `accessibilityLabel`) or `text:`. The repo flows need a syntax pass.
  - **App state:** logged in as a **PAID** user on Home ("DAY 1/365", tab bar). Backend = **local** `127.0.0.1:8000` (`EXPO_PUBLIC_API_BASE_URL`), **up** (root/docs 200) with **referrals enabled** (`/api/referral/validate` → "Not authenticated", NOT 404).
  - **Repro lever found:** `components/DevDrawer.tsx` — a dev sheet with **guest / unpaid("Onboarding") / paid** pills (`fauxFreshSignup`/`fauxSkipSignup`). Launcher selector = `id: "Open dev drawer"` (a coordinate point-tap missed; use the label). Switching to "Onboarding" enters the unpaid funnel without a real account — works because the backend is local (faux-signup is 404 only on prod).
  - **Blockers to a clean repro:** (1) dev-client **re-downloads the JS bundle every launch** (slow; anchor waits on the "DAY" Home string, ~45-60s). (2) Unpaid users live in the linear funnel stack (no tab bar) — the only paywall path is Onboarding → **face scan** → FaceScanResults → "Unlock full results" → ReferralCode; the scan step must be driven via `camera_scan_entry.yaml`/`camera_capture_trigger.yaml`.
  - **Artifact:** authored `mobile/maestro/referral_before_payment.yaml` (correct `id:` syntax + DevDrawer entry; funnel traversal + the `assertVisible "Have a referral code?"` step is the next-iteration TODO).
- U1 (cont.) — selector mechanics fully cracked, but throughput is the wall:
  - `text: "Open dev drawer"` opens the DevDrawer reliably; the Guest/Onboarding/Paid pills are in an iOS Modal NOT queryable by text → must point-tap (Onboarding ≈ 50%,91%).
  - Cross-run flakiness: driving across separate `maestro test` invocations (no relaunch) leaves modal/nav state unpredictable — journeys must be ONE flow with launchApp at the top.
  - **Throughput blockers (env, not code):** per-launch JS bundle re-download 45-120s (sometimes times out); the unpaid paywall is reachable only via Onboarding→**face scan**→results→Unlock; tour test needs 10× cold launches (each a slow reload). Reaching the spec's 3×/10× green bar is many hours of slow, flaky runs.
  - Net: env validated, path + selectors known, `referral_before_payment.yaml` updated; no app-code defect found yet (the routing code is in place). Recommend a faster verification strategy (seeded unpaid+scanned test account / skip-scan debug hook / single-flow journeys) before grinding the full funnel 3×/10×.

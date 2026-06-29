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

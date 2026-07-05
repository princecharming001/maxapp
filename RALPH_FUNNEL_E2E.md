# RALPH_FUNNEL_E2E.md — account-after-scan funnel: end-to-end test + fix (Ralph loop)

> Persistent build spec for a Ralph loop. **Read in full each iteration.** Do the first
> unchecked UNIT, run its VERIFY, log it (Iteration Log), `commit + push` (prefix `funnel:`),
> continue. Steps that need a native rebuild are **HUMAN-or-build** — run the build yourself
> if you can; if it stalls, log it and ask. When every COMPLETION CRITERION passes, emit the
> completion promise and stop.

## GOAL
1. Prove the new **account-after-scan** funnel works end-to-end on the simulator and fix
   anything broken: **Get started → onboarding → scan → locked results → create account
   → referral → payment.**
2. Add the **returning-user "Sign in instead"** path on `CreateAccountScreen` (taps drop the
   anon session and go to Login), so a user who hit Get started by mistake can still sign in.

## ENVIRONMENT REALITY (read before U0 — these are why past sim runs stalled)
- **No Maestro MCP** — use the Maestro **CLI**: `~/.maestro/bin/maestro --device <UDID> test <flow.yaml>`
  with `- takeScreenshot: <path>`. Booted UDID: `xcrun simctl list devices booted`. This build
  rejects `accessibilityId:` → use `text:`; tour/modal content isn't queryable → use
  `tapOn: { point: "x%, y%" }` when text taps fail. **Downscale screenshots to ≤760px** (PIL
  thumbnail) before reading — the read API rejects >2000px.
- **The sim's `com.cannon.mobile` may be a DIFFERENT app** (a creator/clips project shares the
  bundle id). If a screenshot doesn't show maxapp's Landing ("Your looks, maxed."), **rebuild
  maxapp onto the sim**: `cd mobile && npx expo run:ios` (replaces the other app — that's fine
  for testing). This is the **build** step.
- **The sim has NO camera** — the face-scan capture can't complete. Add a **__DEV__-only**
  bypass to reach the post-scan steps (see U2). Do NOT re-add a visible shutter "skip" button
  (the owner removed that); make it dev-only (DevDrawer entry or `__DEV__` gate).
- **Backend must be up with the new routes.** Verify `curl -s -o /dev/null -w "%{http_code}"
  -X POST http://localhost:8000/api/auth/anon` → **200** (it's the detached `--reload` uvicorn).
  If 404/down, relaunch: `setsid nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
  --reload </dev/null >/tmp/maxapp_backend.log 2>&1 &`.
- Mobile JS + the already-built `CreateAccount` screen show on a **reload**; a rebuild is only
  needed to put maxapp back on the sim.

## CONSTRAINTS (every iteration)
- Commit each fix to `main` + push. `cd mobile && npx tsc --noEmit` clean (ignore the known
  pre-existing GlassButton/GlassCard errors). Touched backend tests green
  (`../.venv/bin/python -m pytest <file> -q`).
- **Selective `git add`** — never sweep in other sessions' uncommitted files (creator/google,
  LandingScreen hero, api.ts resync). Stage only the files you changed.
- Never claim a step works from code alone — only a **Maestro screenshot of that screen** counts.

## UNITS

### [ ] U0 — Put maxapp on the sim
Screenshot the booted sim. If it's not maxapp's Landing, `npx expo run:ios` to (re)install
maxapp, then relaunch to Landing. **VERIFY:** screenshot shows "Your looks, maxed." + Get started.

### [ ] U1 — Returning-user "Sign in instead" (the edge-case fix)
On `CreateAccountScreen`, add a quiet "Already have an account? **Sign in**" link. On tap:
`await logout()` (drops the anon session) then route to `Login`. Also, when `claimAccount`
fails with "email already registered", surface that link prominently. `tsc` clean.
**VERIFY (code + later screenshot in U7):** the link exists and logs out → Login.

### [ ] U2 — Dev-only scan bypass (so the camera-less sim can reach post-scan)
Add a `__DEV__`-only way to jump from the scan to **locked `FaceScanResults`** with mock scan
data (extend `DevDrawer`, e.g. a "Skip scan → locked results" entry, or a `__DEV__` gate — NOT
a visible shutter button). Keep it dev-only so it can never ship. `tsc` clean.
**VERIFY (screenshot):** in dev, you can reach locked FaceScanResults without a camera.

### [ ] U3 — Get started → onboarding
Maestro: relaunch to Landing, `tapOn: "Get started"`, screenshot. **VERIFY:** lands on the
first onboarding question (NOT an error toast). If it errors, diagnose (backend 404? token?
`/me` 500?) and fix, then re-verify.

### [ ] U4 — Onboarding → scan
Advance through onboarding (tap through, or DevDrawer "Reveal → scan" mock-data shortcut) to
the **FaceScan** screen. Screenshot. **VERIFY:** the scan/"Scan now" screen shows.

### [ ] U5 — Scan → locked results
Use the U2 dev bypass to reach **locked `FaceScanResults`**. Screenshot. **VERIFY:** locked
results render (potential shown, score/appeal withheld for the free anon user).

### [ ] U6 — Locked results → create account → referral
Tap the unlock/continue control. **VERIFY (screenshot each):** an unclaimed (anon) user routes
to **CreateAccount**; fill name/email/password, submit; it claims the account and routes to
**ReferralCode**; then ReferralCode → **Payment**. Fix any routing/claim breakage.

### [ ] U7 — Returning-user path
At CreateAccount, enter an **already-registered** email + submit. **VERIFY (screenshot):** the
"email already registered" error shows AND the "Sign in instead" link drops the anon session →
**Login**. Fix until it works.

### [ ] U8 — Final report
Assemble the screenshot trail (Get started → onboarding → scan → locked results → create
account → referral → payment, plus the returning-user path). `tsc` clean, tests green, all
committed. List anything that had to be fixed.

## COMPLETION CRITERIA
1. Every step Get started → onboarding → scan → locked results → create account → referral →
   payment is **screenshot-verified** on the sim (with the dev scan bypass for the camera step).
2. The returning-user "Sign in instead" path works (anon session dropped → Login).
3. All fixes committed + pushed to `main`; `tsc` clean; backend tests green; no other session's
   files swept in.

Completion promise (emit verbatim only when all hold):
> FUNNEL E2E COMPLETE - funnel verified on the sim and returning-user sign-in path works

## ITERATION LOG
- (none yet)

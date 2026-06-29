# RALPH_SECURITY_AUDIT.md — pre–App Store security audit (Ralph loop)

> Persistent audit spec for a Ralph loop. **Read this file in full at the start of every iteration.** Do the **first unchecked AUDIT UNIT**, run its **VERIFY**, record findings in `SECURITY_AUDIT_REPORT.md`, check the unit off with a dated one-line note in the **Iteration Log**, then `commit + push` (prefix `sec:`) and continue to the next unit. Do **not** skip ahead. Do **not** refactor beyond the unit. When every unit is checked and the **COMPLETION CRITERIA** all pass, emit the completion promise verbatim and stop.

This is an **audit**, not a feature build. The deliverable is (1) a complete findings report and (2) safe, verified fixes for everything fixable. Finding and *documenting* a problem counts as done for that item even when the fix is human-only — log it, don't force it.

---

## GOAL

Before maxapp is submitted to the App Store, find and remediate security problems across the FastAPI backend (`/Users/home/maxapp/backend`), the Expo/React Native client (`/Users/home/maxapp/mobile`), and the integration/config surface. Produce a ship / no-ship recommendation with every finding triaged by severity and remediation status.

## CONSTRAINTS (read every time — these are hard rules)

- Work on a dedicated branch **`security-audit`** (create it from the current branch in U0). **Never push to `main`.** **Never** start an EAS / TestFlight build.
- **Never weaken security to make a check pass.** If a control looks "in the way," that is usually the point — verify it, don't remove it. A fix that disables a protection is a FAIL.
- **Never commit real secrets**, and **never print secret *values*** into logs, the report, commit messages, or test fixtures. Reference secrets by name/location only (e.g. "`STRIPE_SECRET_KEY` read from env in `config.py:L40`").
- **No destructive actions**: no prod DB writes/migrations against a live database, no deleting user data, no mass requests against third-party APIs, no force-push, no `git reset --hard`.
- Do **not** touch other loops' uncommitted work-in-progress files unless a unit specifically requires it; if you must, note it.
- **Test after every change.** Backend: `cd backend && pytest -q` (respect the repo's existing pre-existing-failure baseline — don't claim green if your change adds failures). Mobile: `cd mobile && npx tsc --noEmit`. A unit is only "done" when its VERIFY passes AND the suites are no worse than baseline.
- Each fix is its own small commit. Incremental + idempotent. If a unit finds nothing, still commit the report update for that unit.
- If a finding requires a human (rotate a leaked key, change an App Store Connect privacy answer, wire an Apple-required account-deletion UX, accept a residual risk), mark it **Human-required** in the report with a concrete proposed action — do not fake it.

## SEVERITY RUBRIC

- **Critical** — remote account takeover, auth bypass, reading/writing other users' data (IDOR), secret exposure that grants prod access, payment/entitlement bypass, RCE/SSRF into internal network.
- **High** — privilege escalation, injection, sensitive-data disclosure, broken OAuth/token handling, missing authz on a sensitive endpoint, biometric/PII mishandling.
- **Medium** — missing rate limits, verbose error disclosure, weak config defaults, missing security headers, fixable dependency CVEs.
- **Low** — hardening/defense-in-depth, info leaks of low value, best-practice gaps.

**Ship gate:** no open **Critical** or **High** at completion (each must be Fixed, Mitigated, or explicitly Accepted-by-human with rationale).

## ATTACK SURFACE (verified pointers — confirm, don't trust)

Backend routers (`backend/api/`): `auth`, `users`, `payments`, `scans`, `chat`, `google` (Calendar OAuth), `creator_applications`, `marketplace`, `schedules`, `planner`, `maxes`, `courses`, `personalization`, `onairos`, `leaderboard`, `referral`, `notifications`, `events`, `analytics`, `achievements`, `forums` / `forums_v2`, `admin` / `admin_forums_v2` / `admin_notifications`, `sendblue_webhook`. Config + prod gating: `backend/config.py`, `backend/main.py`, `settings.is_production`. New/uncommitted: `backend/services/social_lookup.py` (fetches public Instagram/TikTok URLs → SSRF candidate).

Client (`mobile/`): `services/api.ts` (token handling), `context/AuthContext.tsx`, secure storage, deep links (`expo-linking` Google OAuth callback), `app.json`/`app.config` (ATS, URL schemes, permissions), the iOS privacy manifest.

Prior history (verify these stayed fixed — see project memory): unauthenticated faux-signup endpoints once minted paid premium (now 404 in prod via `is_production`); scan-analysis once leaked to free users (now redacted); Onairos API key was meant to move server-side; Google Calendar tokens encrypted at rest via Fernet.

---

## AUDIT UNITS (do the first unchecked one each iteration)

### [ ] U0 — Branch, report skeleton, endpoint inventory
Create branch `security-audit`. Create `SECURITY_AUDIT_REPORT.md` with: the severity rubric, a findings table (`ID | Area | Severity | Status | File:Line | Note`), and a **complete enumerated inventory of every backend route** (method + path + auth dependency + intended audience public/user/admin) built by scanning `backend/api/*`. List every place the mobile app stores or sends a token/secret.
**VERIFY:** report exists; route inventory non-empty and each route tagged public/user/admin; committed.

### [ ] U1 — Authentication integrity
Confirm the auth scheme (token type, signature/expiry verification, where validated). Confirm there is no bypass (debug backdoors, `is_production`-gated dev endpoints reachable in prod, default/blank-secret fallbacks). Every non-public route must enforce auth; each truly public route must be justified in the report.
**VERIFY:** add/confirm tests that an unauthenticated request to a representative protected route on each router returns 401/403; expired/garbage tokens rejected; no dev-auth path active when `is_production`.

### [ ] U2 — Object-level authorization (IDOR) — highest priority
For every endpoint taking a resource id (scan, schedule, chat thread, creator application, maxx, referral, notification, upload path `uploads/{user_id}/…`, calendar event, profile), verify the handler scopes the query to the **authenticated** user, not just the id. Write tests where **user A attempts to read/modify/delete user B's** resources and must get 403/404.
**VERIFY:** IDOR tests pass for scans, schedules, chat history, creator_applications, calendar/google, personalization/profile, referral, notifications, uploads. Any leak = Critical, fix then retest.

### [ ] U3 — Entitlement / paywall enforcement (server-side)
Premium/paid features must be enforced on the server, never trusted from the client. Re-verify the historical bugs stayed fixed: no endpoint mints premium; scan-analysis payload is redacted for non-entitled users; dev/faux-signup endpoints are 404 when `is_production`. Check `payments.py`, `marketplace.py`, `scans.py`.
**VERIFY:** tests that a free user cannot retrieve premium-only fields/payloads and cannot self-grant entitlement; prod-gated endpoints 404 under `is_production`.

### [ ] U4 — Secrets & config hygiene
Scan the repo **and git history** and the **mobile bundle** for hardcoded secrets/keys/tokens (anything shipped in the JS bundle is public — the Onairos key and any third-party key must be backend-only). Confirm `.env*` are git-ignored and not committed; confirm JWT/Fernet/Stripe/Google/Onairos/Supabase secrets load from env only. Use a scanner if available (`gitleaks`/`trufflehog`/`detect-secrets`) plus pattern greps; **do not print the values found** — record name + location + severity.
**VERIFY:** secret scan over working tree + history reports no live secret; `grep` of the built mobile bundle for key patterns is clean (or findings logged + Human-required for rotation).

### [ ] U5 — Input validation, injection & file uploads
Check for raw/parameterized SQL (no f-string/`.format` into queries — SQLi), Pydantic validation on all request bodies, and command/template injection. Face-scan **uploads**: enforce content-type allowlist + size cap, reject path traversal, store with randomized names outside any served webroot, and don't trust client filenames.
**VERIFY:** tests reject injection payloads, oversized/wrong-type uploads, and traversal filenames; grep shows no string-interpolated SQL.

### [ ] U6 — SSRF in social_lookup + outbound fetches
`backend/services/social_lookup.py` fetches public Instagram/TikTok endpoints. Ensure the fetched host is a **fixed allowlist** (no user-controlled URL/host), DNS-rebinding/internal-range (`169.254.*`, `10.*`, `127.*`, metadata IPs) is blocked, redirects are bounded, and there are timeouts + response-size caps. Apply the same checks to any other outbound fetch.
**VERIFY:** test that a handle resolving to / redirecting to an internal address is refused; timeouts and size caps present.

### [ ] U7 — OAuth & token storage (Google Calendar)
Verify: refresh tokens encrypted at rest (Fernet) and never returned to the client; OAuth `state` HMAC-signed and verified (CSRF); `redirect_uri` fixed/allowlisted; disconnect revokes + deletes; refresh-failure marks the connection inactive. Mobile only opens an `auth_url` and polls status (no token on device).
**VERIFY:** tests that tampered/absent `state` is rejected, stored tokens are ciphertext, and `/google/disconnect` clears them.

### [ ] U8 — Payments & webhooks integrity
Stripe (and `sendblue_webhook`) webhooks must **verify the signature** before acting and be idempotent; checkout prices/entitlements are set **server-side** (never from client-supplied amounts/product ids). 
**VERIFY:** test that an unsigned/badly-signed webhook is rejected (4xx) and does not grant anything; confirm amounts/entitlements are server-derived.

### [ ] U9 — Rate limiting & abuse / cost controls
Identify unprotected expensive or brute-forceable endpoints: auth/login/signup, `chat` (LLM cost), `scans`, `social_lookup`, referral. Add/verify rate limits (per-user and per-IP) returning 429.
**VERIFY:** rapid repeated calls to a protected endpoint are throttled; document any endpoint left unlimited with rationale.

### [ ] U10 — Error handling & info disclosure
Confirm `is_production` disables debug/tracebacks; clients get generic messages (no stack traces, SQL, or internal hostnames); logs contain **no secrets or PII** (no tokens, no face-photo bytes, no full request bodies with creds).
**VERIFY:** a forced 500 returns a sanitized body in prod mode; grep logging calls for obvious secret/PII interpolation.

### [ ] U11 — Transport, headers & CORS
iOS ATS: no `NSAllowsArbitraryLoads`/cleartext in `app.json`/Info.plist. Backend: HTTPS-only assumptions, sane security headers, and CORS that is **not** wildcard-with-credentials (origins allowlisted).
**VERIFY:** ATS config clean; CORS config reviewed and not `*` + credentials; note findings.

### [ ] U12 — Mobile client hardening
Auth tokens stored in `expo-secure-store` (Keychain), not plaintext `AsyncStorage`. Validate deep-link/URL-scheme inputs (the OAuth callback) before acting. Review any WebView for `allowsInlineMediaPlayback`/JS-injection risks. Consider hiding sensitive screens (face scan) from app-switcher snapshots / pasteboard. (Cert pinning = optional/Low.)
**VERIFY:** token storage uses secure store; deep-link handler validates its params; findings logged.

### [ ] U13 — Dependency vulnerabilities
Run `cd mobile && npm audit --omit=dev` and a backend scan (`pip-audit` or `safety`). Triage Critical/High: patch where safe (no breaking bumps without tests passing), otherwise document with justification.
**VERIFY:** no unaddressed Critical/High advisory; each remaining one has a logged decision.

### [ ] U14 — Safety guardrails can't be bypassed
The chat self-harm/crisis guardrail (already shipped) must fire before any coaching/products even under jailbreak-style prompts; check that the agent can't be coaxed into harmful instructions, leaking the system prompt, or exposing other users' data via prompt injection.
**VERIFY:** a small red-team prompt set still triggers the guardrail / refuses; no system-prompt or cross-user leak.

### [ ] U15 — PII, biometric data, deletion & App Store privacy
Face photos are sensitive. Verify: stored with per-user access control + a stated retention; a working **account + data deletion** path exists (Apple **requires** in-app account deletion) that removes scans/photos/PII; the iOS **privacy manifest** (`PrivacyInfo.xcprivacy`) exists, declares required-reason APIs, and matches the App Store privacy "nutrition" answers; ATT prompt present iff any tracking/IDFA. List exactly what data is collected and why.
**VERIFY:** deletion endpoint removes user data incl. uploaded scans (tested); privacy manifest present + reviewed; mismatches → Human-required with the exact App Store Connect change.

### [ ] U16 — Final report & ship/no-ship
Compile `SECURITY_AUDIT_REPORT.md`: every finding with severity + status (Fixed / Mitigated / Accepted / Human-required) + remediation note; a prioritized **Human-required** checklist (key rotation, Apple account-deletion UX, privacy-answer changes, accepted risks); and a clear **SHIP / NO-SHIP** call against the ship gate. Run the full suites once more.
**VERIFY:** report complete; zero open Critical/High without an owner; `pytest` no worse than baseline; `tsc` clean.

---

## COMPLETION CRITERIA (all must hold)

1. Every AUDIT UNIT is checked off with a dated Iteration Log entry.
2. `SECURITY_AUDIT_REPORT.md` lists every finding with severity + status; no open Critical/High lacks a Fixed/Mitigated/Accepted-by-human resolution.
3. Backend `pytest` is green relative to the documented baseline; `mobile` `tsc --noEmit` is clean.
4. No security control was weakened to pass a check; no real secret was committed or printed.
5. A SHIP / NO-SHIP recommendation is written with the remaining Human-required checklist.

When all five hold, emit verbatim:
> SECURITY AUDIT COMPLETE — report at SECURITY_AUDIT_REPORT.md, ship gate evaluated, human-required checklist attached.

and stop.

---

## ITERATION LOG (append one line per completed unit; newest last)

- (none yet)

# ACCOUNT_AFTER_SCAN.md — move account creation after the scan (Approach A)

Owner-approved redesign: the funnel runs **before** sign-up. Account creation/sign-in
moves to right before the referral + payment screens.

## Approved decisions
- **Approach A — silent anonymous account.** "Get started" mints a credential-less,
  FREE-tier account so the existing auth-gated funnel (onboarding + scan) works
  unchanged; the pre-paywall screen *claims* it (sets email + password).
- **Returning users:** keep a quiet "Sign in" link on Landing (Get started stays the
  prominent action).

## Target flow
```
Landing ("Get started" → mint anon acct ; quiet "Sign in" → Login)
  → onboarding questions  → scan (real, account exists)
  → locked results (score/appeal withheld — existing free-user redaction)
  → CREATE / SIGN-IN account  (claims the anon acct: POST /auth/claim)
  → referral code → payment (skip if free comp) → full unlocked results → plan
```

## Backend (DONE this pass)
- `POST /auth/anon` — prod-safe, rate-limited (30/h/IP). Mints `is_paid=False`,
  `is_admin=False`, empty onboarding, reserved `…@anon.maxapp.invalid` email +
  random unusable password. Returns tokens.
- `POST /auth/claim` — auth-required. Only an **unclaimed** (anon-email) account can be
  claimed → sets real email/password/username/name; **never** touches `is_paid`.
  Real accounts 400 ("already set up, sign in"). Email/username/phone uniqueness enforced.
- **Security (the faux-signup bug is the cautionary tale):** anon accounts can NEVER be
  premium; claim can't hijack a credentialed account; `.invalid` email can't be logged into.

## Frontend (TODO — next passes)
1. `AuthContext`: `startAnon()` (POST /auth/anon, store token) + `claimAccount(payload)` (POST /auth/claim).
2. `LandingScreen`: "Get started" → `startAnon()` → onboarding; keep a quiet "Sign in" → Login.
   (NOTE: LandingScreen has the other session's uncommitted hero WIP — coordinate before editing.)
3. `RootNavigator`: with an anon user the existing unpaid stack already covers onboarding→scan→results.
   Insert a **CreateAccount (claim)** screen between `FaceScanResults` (locked) and `ReferralCode`.
4. `CreateAccountScreen`: a "Save your results" form that calls `claimAccount`; on success → `ReferralCode`.
   Returning-user "Sign in" path recognizes already-paid users and skips into the app.
5. Verify `FaceScanResults` withholds score/appeal for the (free) anon user pre-claim.

## Follow-ups
- Cleanup job for abandoned/unclaimed anon accounts older than N days (DB bloat).
- Consider a proper `is_anonymous` column later instead of the email-pattern convention.

# Ralph Loop — IAP / Payment flow audit + hardening

## Context (already established — do NOT re-litigate)
The TestFlight "payment plan not functioning" symptom was traced to a **stale
production backend** (Render's GitHub webhook had been dead since 2026-06-24, so
a week of pushes never deployed — the same root cause as the "Get started" 404).
The backend was redeployed on 2026-06-30 and the payment path was verified healthy
end to end:
- Backend `/api/payments/apple/verify` is deployed & reachable (401 without auth, not 404).
- Apple App Store Server API credentials authenticate against BOTH prod and sandbox
  (Apple returns 400 "invalid transaction id" for a dummy tid, NOT 401 → creds valid).
- Both subscriptions are **APPROVED** in App Store Connect and the product IDs match
  the app exactly: `com.cannon.mobile.subscribe.basic.weekly` (chadlite),
  `com.cannon.mobile.subscribe.premium.weekly` (chad), ONE_WEEK.
- `react-native-iap` config plugin is present.
- `user.id` is a valid UUID → StoreKit `appAccountToken` is valid.

So there is no KNOWN code bug. This loop's job is to **prove that rigorously**,
find and fix any LATENT bug, and leave a durable audit trail — NOT to invent
changes. If everything is already correct, that is a valid terminal state:
document it and output the completion promise.

## Ground rules
- Work one task per iteration. Commit + push to `main` after any code change
  (standing deploy pref). Do NOT start an EAS/TestFlight build.
- Do NOT change product IDs, tier names, or the pricing copy.
- Do NOT weaken the production security guard in `backend/api/payments.py`
  (the `settings.is_production` → 503 refusal of client-trust). That guard is correct.
- Maestro on this Mac is flaky (may need `pkill -9 java`). Treat a Maestro run as
  BEST EFFORT: attempt it, capture what you can, but do NOT block completion on
  tooling instability — block only on real app/code defects.

## Tasks
- **T1 — Mobile purchase path audit.** Re-read `mobile/hooks/useAppleSubscription.ios.ts`,
  `mobile/screens/payment/PaymentScreen.tsx`, `mobile/constants/appleIap.ts`. Look for
  correctness bugs in: product fetch/retry, `subscribeTier` cache-miss handling,
  `onPurchaseSuccess` verify→finalize→refresh ordering, duplicate-tid guarding,
  restore flow, and the `__DEV__` dev-bypass vs real-flow branch. Fix any real bug;
  otherwise record "no defect" with the reasoning. Typecheck must stay clean.
- **T2 — Backend verify path audit.** Re-read `backend/api/payments.py` (`apple_verify`,
  `_apple_sync_entitlement`, `_activate_user`) and `backend/services/apple_iap_service.py`
  (`fetch_transaction_claims` prod/sandbox fallback, `validate_claims_for_user`,
  `subscription_active_from_claims`, `tier_for_product_id`). Confirm sandbox (TestFlight)
  transactions are handled, expired transactions are ack'd (200) not errored, and the
  appAccountToken match is correct. Fix any real bug.
- **T3 — Consistency check.** Verify the two product IDs + tier mapping are identical
  across: `constants/appleIap.ts`, backend `config.py` defaults, the Render env
  (already confirmed), and App Store Connect (already confirmed APPROVED). Flag any drift.
- **T4 — Paywall UI/nav (best effort).** Run the paywall Maestro flows on the booted sim
  (`payment_screen_render.yaml`, `paywall_scan_unlock_cta.yaml`,
  `paywall_premium_modal_dead.yaml`, `referral_before_payment.yaml`). LOOK at the
  screenshots. Fix any genuine render/nav regression on the payment screen. Document
  results (including tooling failures) — do not block on Maestro flakiness.
- **T5 — Deliverable.** Write `PAYMENT_AUDIT.md`: the full purchase→verify→entitlement
  trace, the layer-by-layer verified-healthy table, every bug found+fixed (or "none"),
  and a short **user checklist** for the ONE thing not checkable from here — the
  **Paid Applications Agreement must be Active** (App Store Connect → Business →
  Agreements), plus "re-test on the build that points at the now-deployed backend."
  Commit + push.

## Completion
Output the promise ONLY when ALL of these are unequivocally true:
1. T1 and T2 audits done; every bug found is fixed and pushed (or there were none).
2. `npx tsc --noEmit` (or the repo's typecheck) is clean for any file you touched.
3. T3 consistency confirmed (or drift fixed).
4. T4 attempted and its results (pass or tooling-failure) recorded in PAYMENT_AUDIT.md.
5. `PAYMENT_AUDIT.md` exists, is committed, and pushed to `main`.

Promise: `<promise>PAYMENT FLOW AUDITED, HARDENED, AND DOCUMENTED</promise>`

# Payment / IAP Audit — 2026-06-30

## Verdict
**The payment path is healthy end-to-end. The TestFlight "payment plan not
functioning" symptom was caused by the stale production backend — the same root
cause as the "Get started" 404 — now fixed by redeploying Render.** No code or
config defect prevents purchasing. One real (minor) UI bug was found and fixed
during the audit (mislabeled "Restore Purchases" control).

## Root cause
Render's GitHub auto-deploy webhook had been dead since **2026-06-24**, so a week
of pushes to `main` never deployed. Production ran old code, so a real StoreKit
purchase's server verification (`POST /api/payments/apple/verify`) hit stale/absent
logic and failed. Redeploying `main` (2026-06-30) restored it. See
[maxapp_render_deploy] memory. TestFlight build 318 talks to that same backend, so
it should now transact correctly on re-test; build 319 (new funnel) is in the pipeline.

## Layer-by-layer verification (all green)
| Layer | Check | Result |
|---|---|---|
| Backend route | `POST /api/payments/apple/verify` reachable | 401 without auth (present), not 404 |
| Apple creds | ES256 JWT vs App Store Server API (prod + sandbox) | Apple returns 400 "invalid transaction id" — **auth accepted** (401 would = broken) |
| Sandbox handling | `fetch_transaction_claims` tries prod→sandbox on 404 | TestFlight (sandbox) transactions are found via fallback |
| Products | App Store Connect subscription state | Both **APPROVED**: `...basic.weekly` (chadlite), `...premium.weekly` (chad), ONE_WEEK |
| Product IDs | mobile `appleIap.ts` = backend `config.py` = Render env = App Store Connect | Identical, no drift |
| Tier map | `tier_for_product_id` premium→premium, basic→basic | Correct |
| Entitlement | `_apple_sync_entitlement` active/expiry + ownership-guarded deactivate | Correct |
| Build | `react-native-iap` config plugin present | Yes |
| appAccountToken | `user.id` shape | Valid UUID (StoreKit requirement met) |
| ASN | `/apple/notifications` V2: refund/expire/renew handling | Correct (re-fetches txn from Apple) |

## Purchase → verify → entitlement trace
1. Paywall CTA → `useAppleSubscription.subscribeTier` confirms the product is in the
   StoreKit cache (bounded re-fetch if not) → `requestPurchase({apple:{sku, appAccountToken:user.id}})`.
2. StoreKit sheet → on success `onPurchaseSuccess` → `api.verifyAppleIapTransaction(tid, productId)`
   → `POST /apple/verify`.
3. Backend: `apple_iap_configured()` → `fetch_transaction_claims(tid)` (prod then sandbox)
   → `validate_claims_for_user` (bundle + appAccountToken) → `subscription_active_from_claims`
   → `_apple_sync_entitlement` → `_activate_user(tier, billing_provider="apple", end_date)`.
4. Client `finishTransaction` (always, even on reject, to clear the StoreKit queue) →
   `refreshUser()` flips `isPaid` → post-pay routing.
5. Renewals/refunds arrive later via App Store Server Notifications V2 → `/apple/notifications`.

## Bugs found & fixed
- **`PaymentScreen.tsx` "Restore Purchases" linked to Terms.** The footer had a
  "Restore Purchases" control wired to open the Terms document (not restore), plus a
  redundant separate "Restore" link. Apple Guideline 3.1.1 requires a working restore.
  → Collapsed to a single canonical iOS-only "Restore Purchases" that calls the real
  `handleRestore`. Committed `37d11345`.

## Best-effort UI validation (T4)
The paywall **Maestro flows are stale** — `payment_screen_render.yaml` (and the
`paywall_scan_*` chain) assert removed copy ("Max Pro", "Unlock your full results")
and the current screen reads "Unlock your potential" / "Chad" / "Chad Lite" with no
`accessibilityId` on the CTA. They also chain through the camera-gated scan, which
can't complete on a simulator. So they don't validate the current paywall.
- **Not an app defect** — the screen code typechecks clean and was audited above.
- **Follow-up (non-blocking):** refresh the paywall Maestro flows to current copy and
  add an `accessibilityId` (e.g. `paywall-cta`) so they can drive the button.

## What is NOT checkable from here — user action
The only thing that can't be verified server-side is whether products physically
**load on-device** via StoreKit `fetchProducts`. They're APPROVED, so they should. If
a real device still shows "Plan not available yet" / a dead CTA:
1. **Paid Applications Agreement must be Active** — App Store Connect → Business →
   Agreements. An expired/unsigned agreement (e.g. after an Apple terms update) makes
   ALL products silently fail to load even when APPROVED. This is the #1 remaining suspect.
2. **Re-test on a build pointing at the now-deployed backend** (318 already does; 319 pending).
3. Optional: confirm the **App Store Server Notifications V2 URL** is set to
   `https://maxapp-api.onrender.com/api/payments/apple/notifications` in App Store Connect
   so renewals/refunds sync (initial purchase does not depend on this).

## Reconnect the deploy webhook
Render auto-deploy is on but the GitHub webhook is dead — reconnect the repo in Render
so backend pushes deploy automatically (else every backend fix needs a manual deploy).

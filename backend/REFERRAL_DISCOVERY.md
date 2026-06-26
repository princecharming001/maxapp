# REFERRAL_DISCOVERY.md — Phase 0 map of the real entitlement + payment + paywall flow

Read-only discovery for the referral/promo system (RALPH_REFERRAL.md). No behavior changed in this phase.

## 1. Where entitlement is granted / changed (server-authoritative)
- **`api/payments.py:55` `_activate_user(user_id, subscription_id, db, subscription_tier=, billing_provider=, subscription_end_date=)`** — the ONE shared grant. Sets `user.is_paid=True`, `subscription_status="active"`, `subscription_tier` (basic|premium), `billing_provider`, optional `subscription_end_date`; first-time activation seeds `onboarding.post_subscription_onboarding=True` + `sendblue_connect_completed=False`; unlocks every `Scan` (`scan.is_unlocked=True`). **Idempotent.** ← the free-comp path will reuse this.
- **`api/payments.py:111` `_deactivate_user`** — clears `is_paid`, `subscription_status="canceled"`, `subscription_id/tier/billing_provider=None`.
- **`api/payments.py:794` `POST payments/test-activate`** — DEV-ONLY grant; gated `if app_env not in ('development','dev') and not debug: 403`. The reference for production discipline on a grant endpoint.
- **`api/auth.py:391` `is_paid=True`** — inside the prod-gated faux-signup-skip (mints a paid demo user; `api/auth.py:266 if settings.is_production: 404`).
- **`api/users.py:504-505`** — account-deletion / downgrade clears `is_paid`, `subscription_tier`.

## 2. Subscribe / checkout endpoints (the two rails)
- **Stripe / web rail:** `api/payments.py` `POST payments/billing-preview` (`:172`, SetupIntent secrets), `POST payments/subscribe` (`:~700`, creates the subscription, sets tier), webhook handler (`_activate_user` on `invoice.paid`/`customer.subscription.*`). Service: **`services/stripe_service.py`** (`create_setup_intent`, `retrieve_subscription_object`, `tier_from_subscription`). ← Stripe discount (coupon/promotion_code/price_id) plugs in here.
- **Apple IAP rail:** `api/payments.py` `POST payments/apple/verify` → `_apple_sync_entitlement` (`:127`) → `_activate_user(..., billing_provider="apple", subscription_end_date=exp)`. Service: **`services/apple_iap_service.py`** (`tier_for_product_id:109`, `subscription_active_from_claims`, `expires_datetime_from_claims`). ← iOS discount = **Apple Offer Code** redeemed via StoreKit, NOT a backend price.

## 3. Paywall gates on the client
- **`mobile/context/AuthContext.tsx`**: `is_paid` (`:34`) on the User; derived `isPaid` (`:310 = user?.is_paid`), `isPremium` (`:311 = is_admin || (is_paid && tier==='premium')`). The root navigator is keyed on `isPaid` (flipping it remounts into the paid app).
- **`mobile/screens/payment/PaymentScreen.tsx`** — the paywall. ← the "Have a referral code?" field goes here; on free-comp success, refresh auth → the `isPaid` flip routes past it.
- **`mobile/screens/scan/FaceScanResultsScreen.tsx`** — `locked`/`is_unlocked` gate (`:548 BentoHero locked`); unlocked when scans flip `is_unlocked` (done by `_activate_user`).
- **`mobile/constants/featureFlags.ts`** — client flags; `referrals` (UX) gate lands here.

## 4. Production gating discipline (must be honored by new grant endpoints)
- **`config.py settings.is_production`** + `settings.app_env` / `settings.debug`. faux-signup → 404 in prod (`api/auth.py:266`); test-activate → 403 outside dev (`api/payments.py:809`). **New `/referral/redeem` grants entitlement, so it must NOT be a free-grant backdoor: the grant is driven by a real DB code row (validated active/limits/expiry), never a debug bypass, and is server-authoritative.**

## 5. Infra the referral system reuses
- **Rate limiting:** `middleware/rate_limit.py` `rate_limit(*, limit, window_s, scope)` FastAPI dependency (used across `api/auth.py`, `api/chat.py`). ← `/referral/validate` + `/referral/redeem` get it.
- **Auth:** `middleware/auth_middleware.py get_current_user` → dict with `id`, `is_paid`, `subscription_tier`, `billing_provider`, …
- **Models / tables:** `models/sqlalchemy_models.py` (`class User`, `__tablename__="app_users"`). Tables auto-created in `db/sqlalchemy.py init_db` via `Base.metadata.create_all(sorted_tables)` → new models are created automatically; additive `app_users` columns also get an idempotent SQL migration (`scripts/*.py` pattern, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- **Router registration:** `main.py:180+ app.include_router(<r>, prefix="/api")`. ← `referral_router` registers the same way.

## Compliance conclusion (encodes RALPH_REFERRAL §Compliance)
- **Free comp** → `_activate_user(..., subscription_status="comped", source marker)` server-side, route past paywall. Allowed on iOS (giving away access, not selling).
- **iOS discount** → Apple Offer Code only (StoreKit redemption); the backend stores the offer id, never a cheaper charge.
- **Web discount** → Stripe promotion_code/coupon/price_id in the existing Stripe flow.
- Entitlement stays server-authoritative; client only reflects the refreshed user.

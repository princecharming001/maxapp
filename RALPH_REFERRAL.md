# RALPH_REFERRAL.md — referral / promo code system (discounts + free comps)

## Mission
Add a referral-code system to maxapp. A code can:
- **Free comp** — fully unlock premium and **bypass the payment screen** (influencers, friends-and-
  family, beta, giveaways). Server grants entitlement; no charge.
- **Discount** — a cheaper price (a real discounted price id / offer is wired in LATER; build the seam
  now with placeholders + a flag).
- **Referral attribution** — track who referred whom, optionally reward the referrer.

Build it server-authoritative, additive, flag-gated default OFF, and **App Store compliant** (this is
the part that sinks naive implementations — read the compliance section before writing code).

---

## Research summary — how real apps do this (and the rules)
**Two payment rails exist in this app:** Apple IAP/StoreKit (iOS) and Stripe (web / setup-intent path).
Discounts and comps must be handled DIFFERENTLY per rail:

- **Free comps (100% off / giveaway):** grant entitlement **server-side** (set `is_paid` /
  `subscription_tier` with a `source='referral_comp'`), no purchase on either rail, and route the
  client **past the paywall**. This is allowed on iOS — you're *giving away* access, not *selling*
  digital goods outside IAP. This is how "comp accounts", influencer freebies, and beta access work.
- **Discounts on the iOS subscription:** you may NOT charge a cheaper price through your own backend
  and unlock IAP content — Apple requires IAP for auto-renewable subscriptions. Use Apple
  **Offer Codes** (App Store Connect → Subscriptions → Offer Codes) or **promotional offers** (signed),
  redeemed via StoreKit `presentCodeRedemptionSheet()` or a redemption URL. The discounted price is an
  Apple-configured offer tied to your product id — not a number your server invents.
- **Discounts on the Stripe rail (web / non-IAP):** use Stripe **Coupons + Promotion Codes**, or a
  discounted **price id** on the subscription/checkout. `stripe_service.py` is where this plugs in.
- **Referral programs** are usually two-sided: a shared campaign code (e.g. `ANISH20`, unlimited uses)
  OR a unique per-user code; referee gets a discount/trial, referrer gets a reward (free month /
  credit). Anti-abuse (one redemption per user, no self-referral, max uses, expiry, server-authoritative)
  is mandatory or it gets farmed.

The loop should confirm current specifics with a quick web check (Apple Offer Codes redemption API;
Stripe promotion_codes API), but the design above is the target.

---

## Phase 0 — Discovery (map the real payment + entitlement flow; do this first)
Produce `backend/REFERRAL_DISCOVERY.md` mapping, with file:line:
- Where entitlement is granted/changed: `is_paid`, `subscription_tier` (basic|premium),
  `subscription_status`, `is_scan_user` (`api/auth.py`, `api/payments.py`, `api/users.py`).
- The subscribe/checkout endpoints: `api/payments.py` (`POST payments/subscribe`,
  `POST payments/apple/verify`), and `services/stripe_service.py` + `services/apple_iap_service.py`.
- The paywall gates on the client: `PaymentScreen.tsx`, `context/AuthContext.tsx` (`is_paid` /
  `subscription_tier` / `is_scan_user`), `FaceScanResultsScreen` (`locked`/`is_unlocked`), and any
  `MaxxDetail` Chad-gate.
- The production gating used for paywall security (`settings.is_production` — the faux-signup endpoints
  that 404 in prod). New entitlement-granting endpoints MUST honor the same discipline.
Do NOT change behavior in Phase 0.

## Phase 1 — Data model + migration (additive)
New tables (SQLAlchemy + a migration/`scripts/sql`):
- **`referral_codes`**: `id`, `code` (unique, case-insensitive), `kind` (`free_comp` | `discount` |
  `referral`), `granted_tier` (basic|premium, for comps), `discount_kind` (`percent` | `fixed` |
  `price_id`), `discount_value` (nullable), platform targets: `stripe_promotion_code` /
  `stripe_coupon_id` / `stripe_price_id`, `apple_offer_code` / `apple_offer_id`, `max_redemptions`
  (null = unlimited), `per_user_limit` (default 1), `redemption_count` (atomic), `starts_at`,
  `expires_at`, `is_active`, `owner_user_id` (nullable — for influencer/referrer codes), `campaign`,
  `notes`, timestamps.
- **`referral_redemptions`**: `id`, `code_id`, `user_id`, `kind_at_redemption`, `result`
  (`comped` | `discount_applied` | `attributed`), `platform` (ios|web), `created_at`,
  unique `(code_id, user_id)` to enforce one-per-user.
- **`app_users`** additive: `referred_by_code_id` (nullable), `referral_source` (string), and a flag
  the entitlement layer can read (e.g. entitlement `source` already supports a reason string).
All nullable/defaulted so existing rows/migrations are safe.

## Phase 2 — Validate + redeem API (server-authoritative, atomic, abuse-proof)
- `POST /referral/validate {code}` → `{ valid, kind, free, discount: {kind, value, label}, message }`.
  Pure check, no side effects. Used by the client to show "code applied" before purchase. Rate-limit it.
- `POST /referral/redeem {code, platform}` → applies it. MUST be:
  - **Atomic** on `redemption_count` (row lock / `UPDATE ... WHERE redemption_count < max` ) so a code
    with `max_redemptions` can't be over-redeemed under concurrency.
  - **Idempotent + one-per-user** via the unique `(code_id, user_id)` redemption row.
  - **Validated**: active, within `starts_at`/`expires_at`, under max, under per-user limit, not
    self-referral (`owner_user_id != user_id`), not already entitled (don't comp someone already paid).
  - **Audited**: write a `referral_redemptions` row every time.
  - Honor `settings.is_production` discipline (no debug/free-grant backdoors live in prod).

## Phase 3 — Free-comp path (bypass the paywall)
When a `free_comp` (or 100% `discount`) code redeems: server grants entitlement directly
(`is_paid=True`, `subscription_tier=granted_tier`, `subscription_status='comped'` or similar,
`source='referral_comp'`, set `subscription_end_date` if the comp is time-boxed), writes the audit row,
returns the refreshed user. Client: on success, refresh auth and **route past `PaymentScreen`** straight
into the normal post-subscribe flow (the existing `post_subscription_onboarding` / scan-unlock path) —
no Stripe, no StoreKit. NEVER let the client self-grant entitlement; it only reflects server state.

## Phase 4 — Discount path (platform-aware; prices wired in LATER)
Build the SEAM now, behind flag `referralDiscounts` (default OFF until real ids exist):
- **iOS:** redeeming a discount code surfaces the matching Apple **Offer Code** — present
  `presentCodeRedemptionSheet()` (StoreKit) or open the redemption URL; the actual discounted price is
  Apple's offer tied to the product. Store the `apple_offer_code`/`apple_offer_id` on the code row.
- **Web/Stripe:** pass the `stripe_promotion_code`/`stripe_coupon_id` or swap to `stripe_price_id` in
  the existing `payments/subscribe` / `stripe_service.py` flow.
- Use clearly-marked PLACEHOLDER ids + a config/table the user fills in later; do not invent prices.
  When the flag is OFF or ids are unset, discount codes degrade to "code recognized, discount coming"
  (or are simply inactive) — never charge a wrong amount.

## Phase 5 — Mobile UX
- A **"Have a referral code?"** entry: a field on `PaymentScreen` (and optionally onboarding), with
  apply → `validate` → show the applied state (free unlock vs % off), then `redeem` on the right action.
- **Deep link / referral URL** (`maxapp://referral/<CODE>` + the existing universal-link setup) that
  pre-fills the code and routes to the paywall/onboarding.
- Clean states: invalid / expired / already-used / max-reached / self-referral / success. Cold-start
  safe; the field is hidden/no-op when the `referrals` flag is OFF.

## Phase 6 — Referral attribution + reward (optional but design it)
- On redeem, set `referred_by_code_id` / `referral_source`; if the code has an `owner_user_id`, record
  the attribution for the referrer.
- Reward hook (flag `referralRewards`, default OFF): when a referee converts/comps, grant the referrer
  a reward (e.g. extend `subscription_end_date` by a month, or a credit ledger entry). Keep it a clean,
  flag-gated seam; don't overbuild.

## Phase 7 — Admin, analytics, tests
- A way to create/seed codes (admin endpoint or `scripts/seed_referral_codes.py`) with type/value/limits.
- Counters: redemptions per code/campaign, comp vs discount split.
- Tests (`backend/tests/test_referral.py`): validate happy/expired/max/per-user/self-referral; redeem
  atomicity (concurrent redemptions can't exceed `max_redemptions`); free-comp grants exactly the right
  entitlement and is idempotent; discount path is inert when ids/flag are unset; production-gating holds.

## Compliance + security guardrails — DO NOT violate
1. **Apple:** never sell the iOS subscription cheaper via your own backend/Stripe and unlock IAP
   content. Discounts on iOS = Apple Offer Codes/promotional offers ONLY. Free comps = server
   entitlement (allowed). The loop must encode this split, not a single "cheaper charge" path.
2. **Server-authoritative entitlement:** the client NEVER grants `is_paid`/tier. It calls `redeem` and
   reflects the refreshed server user. No client-trusted "free" flag.
3. **Atomic + one-per-user + audited:** no over-redemption, no double-comp, every redemption logged.
4. **Production discipline:** honor `settings.is_production`; no free-grant backdoor reachable in prod.
   Don't regress the existing paywall-security gating.
5. **Additive + flag-gated:** `referrals` flag gates the whole feature (default OFF until you flip it);
   `referralDiscounts` / `referralRewards` gate the unfinished-price and reward seams (default OFF).
   With everything OFF, the app is byte-identical to today.
6. **No fabricated prices:** placeholders only until the user supplies real price/offer ids.

## Success criteria
- **RC1** `REFERRAL_DISCOVERY.md` maps the real entitlement + payment + paywall flow (file:line).
- **RC2** `referral_codes` + `referral_redemptions` tables + safe additive migration; existing migrations green.
- **RC3** `/referral/validate` + `/referral/redeem` exist, server-authoritative, atomic, one-per-user, audited, rate-limited, production-gated.
- **RC4** Free-comp redeem grants the correct entitlement and bypasses the payment screen end-to-end; client only reflects server state.
- **RC5** Discount seam is platform-split (Apple Offer Code path on iOS, Stripe promo/price on web), flag-gated OFF, inert + safe when ids unset (never charges wrong).
- **RC6** Mobile: a code field on the paywall (+ deep-link prefill) with all result states; hidden/no-op when the flag is OFF.
- **RC7** Referral attribution recorded; reward hook present behind `referralRewards` (OFF).
- **RC8** Admin/seed path + `test_referral.py` covering validate/redeem/atomicity/comp/discount-inert/production-gating, all green; everything-OFF path byte-identical to today.
- **RC9** Compliance encoded (no cheaper-IAP-via-backend), server-authoritative, no prod backdoor, `tsc`/pytest green.

## Discipline
- Additive, flag-gated, cold-start identical. Don't touch the working pay flow except to add the seam.
- Server-authoritative entitlement always. Commit per phase. Don't stop until RC1–RC9 pass.

# RALPH_TIER_FEATURES.md — Chad vs Chad Lite features + entitlements (Ralph loop)

> Persistent build spec for a Ralph loop. **Read in full each iteration.** Do the first
> unchecked UNIT, run its VERIFY, log it, `commit + push` (prefix `tiers:`), continue.
> When every COMPLETION CRITERION passes, emit the completion promise, **report the final
> config values to the owner**, and stop.

## GOAL
On the **"Unlock Your Potential" paywall** (`mobile/screens/payment/PaymentScreen.tsx`),
show the correct feature list per tier, and make sure the underlying **entitlements match**
(no new features — just copy + the two config rules below):

**Chad** (full tier):
- 3 maxxes
- Max Chat Pro
- daily face scans
- full course library

**Chad Lite**:
- 2 maxxes
- Max Chat Lite
- only one face scan

> "No functionality change required" — do NOT build new capabilities. Only: (a) update the
> showcased feature copy, and (b) make sure the **active-maxxes rule (3 / 2)** and the
> **face-scan permission (daily / one)** are configured to these numbers wherever they're
> enforced. Today's code may say different numbers (e.g. Chad Lite "1 active program",
> "weekly face scan") — reconcile them to the spec above.

## ENVIRONMENT REALITY
- **No Maestro MCP** — use the Maestro **CLI** to screenshot the paywall and confirm the
  feature copy (`~/.maestro/bin/maestro --device <UDID> test <flow>` + `takeScreenshot`;
  downscale to ≤760px before reading). Paywall feature copy is a JS change → shows on reload.
- Backend lives at `backend/`; mobile at `mobile/`. Run backend tests with the venv:
  `../.venv/bin/python -m pytest <file> -q`.

## CONSTRAINTS (every iteration)
- Commit each unit to `main` + push. `cd mobile && npx tsc --noEmit` clean; touched backend
  tests green. Selective `git add` — don't sweep in other sessions' uncommitted files.
- This is **config + copy only**. No new endpoints, no schema migrations, no UX flows.

## UNITS

### [ ] U0 — Map where the numbers live
Find: (a) the paywall's per-tier **feature lists** in `PaymentScreen.tsx`; (b) the
**active-maxxes limit** per tier (backend entitlement/limits config + any mobile mirror —
grep `active`, `max_programs`, `program_limit`, `maxxes`, `chadlite`, `subscription_tier`);
(c) the **face-scan cadence/limit** per tier (grep `face scan`, `daily`, `weekly`, `scan_limit`,
`scans_per`). Also note duplicate copy in `MaxxDetailScreen.tsx` / `ManageSubscriptionScreen.tsx`.
**VERIFY:** a list of file:line for each of the three (feature copy, maxxes limit, face-scan limit).

### [ ] U1 — Paywall feature copy
Set the paywall's Chad + Chad Lite feature lists to EXACTLY the spec above (3 maxxes / Max Chat
Pro / daily face scans / full course library — and 2 maxxes / Max Chat Lite / only one face scan).
**VERIFY:** Maestro screenshot of the paywall showing both tiers' new features.

### [ ] U2 — Active-maxxes rule (3 / 2)
Configure the max **active maxxes**: **Chad = 3, Chad Lite = 2**, wherever the limit is enforced
(backend entitlement + any mobile gating). Update stale copy (e.g. "1 active program" → 2).
**VERIFY:** a backend test/assert that Chad permits 3 active maxxes and Chad Lite permits 2
(and a 3rd/3rd is blocked for Lite). `pytest` green.

### [ ] U3 — Face-scan permission (daily / one)
Configure face-scan entitlement: **Chad = daily, Chad Lite = one** (a single scan, not weekly).
Update enforcement + any copy ("weekly face scan" → "one face scan" for Lite; keep "daily" for Chad).
**VERIFY:** a backend test/assert: Chad → daily scans allowed; Chad Lite → exactly one.
`pytest` green.

### [ ] U4 — Reconcile stray copy + final proof
Sweep `MaxxDetailScreen`, `ManageSubscriptionScreen`, and anywhere else that states the old
limits; align them to 3/2 maxxes + daily/one face scan + Max Chat Pro/Lite. Maestro screenshot
the paywall (both tiers).
**VERIFY:** no remaining copy contradicts the spec; screenshot attached.

## COMPLETION CRITERIA
1. Paywall shows exactly: Chad = 3 maxxes / Max Chat Pro / daily face scans / full course library;
   Chad Lite = 2 maxxes / Max Chat Lite / only one face scan (verified by Maestro screenshot).
2. Active-maxxes enforced at **3 (Chad) / 2 (Chad Lite)**; face scan at **daily (Chad) / one (Chad Lite)** — with passing tests.
3. No new functionality added; `tsc` clean; tests green; committed + pushed to `main`.
4. **Report to the owner**: the exact config values set + the file:lines changed.

Completion promise (emit verbatim only when all hold):
> TIER FEATURES COMPLETE — paywall copy updated, maxxes rule = 3 (Chad) / 2 (Chad Lite),
> face scan = daily (Chad) / one (Chad Lite), verified + tests green. [then list the values + files]

## ITERATION LOG
- (none yet)

# ONBOARDING_REDESIGN.md — agreed plan (ON HOLD)

> **Status: ON HOLD.** A separate loop (`ONBOARDING_PERF_SPEC`) is rewriting onboarding + PaymentScreen. Do NOT execute this until that loop is finished/stopped — then re-confirm against the new file state and implement. This captures the agreed direction so it isn't lost.

## Target flow (owner-confirmed)

```
trimmed questions
  → scan            (user takes photos of themselves)
  → locked results  (NO score/appeal — show POTENTIAL/upside only)
  → create / sign-in account   ("Save your results", not "Sign up")
  → referral code
  → payment         (skipped if a free comp code was entered)
  → face-scan RESULTS (the full, unlocked analysis)
  → here's your day  (the plan)
```

One photo capture. Locked results are the aha hook; the account lands as "save what you made"; paywall right after the aha; unlocked results + plan are the post-purchase reward.

## Changes

1. **Move account creation/sign-in to AFTER the locked results** (two screens before Payment: results → account → referral → payment). Defer the signup wall past the first aha (value-first; converts better).
2. **Trim the onboarding questions** to only what the FIRST schedule needs: **goals, wake, wind-down** (and possibly work hours). **Remove** commute, "sharpest"/chronotype, shower, meals from the upfront flow — collect them later via **in-chat per-maxx onboarding** (the non-fixed questions), only when a given maxx actually needs them to schedule.
3. **Locked results = potential, not the rating.** Show the upside framing + the user's #1 goal; **withhold the numeric score + appeal** behind the paywall. Echo their goal on the paywall ("Your Skinmax plan + analysis is ready").
4. **Per-step UX on the questions we keep:** clear step progress + a short "why we ask" line under each question; instrument **per-step drop-off** analytics to find the real leak.

## Watch-outs (my redesign notes)
- Keep enough load-bearing questions that "here's your day" is a real plan, not empty.
- Sequence so momentum rises: results → account → pay → unlocked results → plan (don't split the reveal awkwardly).
- Confirm the referral screen still sits between account and payment on EVERY path (the routing work already done) after the reorder.
- This reorder = RootNavigator + funnel screens (RevealV2, FaceScanResults, Payment, signup) — exactly the files the other loop edits, hence the hold.

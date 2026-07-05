# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just surface bacteria. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, or products suddenly stopping working. if any of those match, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. **repair phase** (2-4 weeks):
1. **cleanse gently** — no scrubs, no acids. just a gentle cleanser AM and PM.
2. **add ceramides + panthenol**, these rebuild the barrier. ceramides lock in moisture, panthenol soothes and speeds repair.
3. **moisturize heavily**, seal in hydration after cleansing.
4. **pause all actives**, no retinoids, AHA/BHA, vitamin c if it stings. once redness, stinging, and dryness are gone, your barrier is ready. then we layer in acne-specific actives (adapalene or azelaic acid) to hit the inflammation root. what does your skin feel like right now. any burning, dryness, or tight feeling after you wash.
- products: 2 item(s)
- status=200 latency=12.4s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1077

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine built around controlling inflammation and supporting your barrier. here's what works for acne-prone skin.
1. **cleanse daily**. use a gentle cleanser morning and night, not aggressive scrubbing. this removes oil and buildup so actives can actually reach skin.

2. **AM: azelaic acid**. azelaic is anti-inflammatory and targets acne at the root without being harsh. apply after cleanse on damp skin.
3. **PM: retinoid**. retinoids control turnover and reduce clogged pores, the main driver of breakouts. start low frequency (2–3x per week) if your barrier is compromised, ramp up as tolerance builds.

4. **layer in this order**: cleanser → toner (optional, on damp skin) → active (azelaic AM, retinoid PM) → treatment serum (centella or panthenol PM to calm) → hydrating serum → moisturizer → SPF (AM only).
5. **barrier repair matters**. acne isn't just bacteria, it's inflammation driven by a damaged barrier. focus on hydration and ceramides in your moisturizer, not just killing bacteria. the key: consistent, not aggressive. skip the extra exfoliants and actives while you're breaking out. let azelaic + retinoid + a solid barrier do the work.
- products: 2 item(s)
- status=200 latency=8.91s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1210
  - [PASS] latency_lt: 8.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


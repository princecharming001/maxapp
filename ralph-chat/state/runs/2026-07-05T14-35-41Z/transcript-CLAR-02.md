# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a bacteria problem. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you see any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. **repair phase** (2-3 weeks):
1. **ceramides** — lock in moisture and rebuild the barrier.
2. **panthenol (vitamin B5)** , hydrates and calms inflammation at the same time.
3. **pause exfoliating acids** (AHA/BHA), retinoids, vitamin c if any of them sting. once redness and irritation drop, inflammation is the next target. acne is driven by internal factors (gut imbalance, insulin spikes, stress, diet) and external ones (over-exfoliation, harsh products, UV). address both or it'll cycle back. what does your skin look like right now. any redness, stinging, or dryness.
- status=200 latency=20.41s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1016

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine:
1. **cleanse daily**, consistent but not aggressive washing.
2. **AM: azelaic acid**, applied after cleanse on dry skin.
3. **PM: retinoid**, applied after cleanse on dry skin.
4. **moisturize after each active**, then SPF in the AM. the order matters. cleanse first to strip buildup so actives actually reach skin. azelaic in the AM tackles inflammation directly; retinoid at night rebuilds collagen and turns over dead skin cells that trap bacteria. skip aggressive washing or multiple actives at once. acne is inflammation-driven, not just bacteria, so the goal is calming your barrier while the actives work. what cleanser are you using now, and do you have azelaic + retinoid on hand, or do you need product recs.
- products: 2 item(s)
- status=200 latency=9.16s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=815
  - [PASS] latency_lt: 9.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just surface bacteria. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you see any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. start with ceramides and panthenol to rebuild the barrier, pause any exfoliating acids or retinoids for now. once irritation drops and redness settles, you can layer in actives like adapalene. what does your skin feel like right now. tight, stinging, or relatively calm.
- status=200 latency=9.35s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=711

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne, you're oily/acne-prone. here's the structure:
1. **cleanse daily**. use a gentle cleanser, not stripping.

removes oil and buildup so actives actually work.
2. **AM: azelaic acid**.

apply after cleanse on damp skin. azelaic kills acne bacteria and calms inflammation without drying you out.

3. **PM: retinoid**. apply after cleanse.

retinoids speed cell turnover, unclog pores, and reduce acne over time. start low frequency (2–3x per week) if your barrier isn't bulletproof yet.

4. **layer in order**: cleanser → active (azelaic AM, retinoid PM) → treatment serum (centella or panthenol PM to soothe) → hydrating serum → moisturizer → SPF (AM only).
5. **consistent but not aggressive**.

don't over-wash or layer too many actives. acne is inflammation-driven, so barrier health matters as much as the actives themselves. start here for 4–6 weeks before adding anything else. what's your current cleanser.
- products: 2 item(s)
- status=200 latency=8.58s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=943
  - [PASS] latency_lt: 8.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne']
- needs_judge: ['uses_user_context', 'answers_the_question']


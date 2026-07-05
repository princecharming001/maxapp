# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. before you layer in actives like adapalene or benzoyl peroxide, you need to stabilize your barrier and kill the inflammatory cycle. here's the move:
1. **repair your barrier first.** use ceramides and panthenol to lock in moisture and reduce redness. this stops the acne → harsh treatment → more acne loop. pause any exfoliating acids, retinoids, or vitamin c if your skin is currently irritated or reactive.
2. **identify what's driving the inflammation.** acne comes from internal triggers (gut imbalance, insulin spikes from sugar/dairy, stress, seed oils) and external ones (over-exfoliation, harsh products, UV). figure out which one applies to you, because treating the breakout without addressing the root just cycles the problem.
3. **once your barrier is stable**, introduce a targeted active. adapalene is the standard first move for acne. but only after you've calmed inflammation. what does your current routine look like, and are you seeing redness, stinging, or dryness alongside the breakouts. that tells me how damaged your barrier is right now.
- products: 1 item(s)
- status=200 latency=9.88s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1123

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine: **AM**
1. **cleanse** — wash daily with a gentle cleanser
2. **azelaic acid**, apply after cleanse on damp skin
3. **moisturizer**, lock in hydration with ceramides + lipids
4. **SPF**, blocks UV and prevents post-acne marks from darkening **PM**
5. **cleanse**, remove oil, dirt, sunscreen buildup
6. **retinoid**, apply on dry skin (start low frequency, 2–3x/week if new)
7. **moisturizer**, repair barrier after the active key: don't layer azelaic + retinoid on the same night. acne is inflammation-driven, so the azelaic AM + retinoid PM combo targets both active breakouts and texture. keep washing consistent but not aggressive.
- products: 2 item(s)
- status=200 latency=7.65s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=731
  - [PASS] latency_lt: 7.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


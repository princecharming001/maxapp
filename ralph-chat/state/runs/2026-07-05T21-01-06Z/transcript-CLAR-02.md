# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a surface problem. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you see any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. **repair phase** (2-3 weeks):
1. **ceramides** — lock in moisture and rebuild the barrier. safe for all skin types
2. **panthenol (vitamin B5)**, hydrates and calms inflammation at the same time
3. **pause** exfoliating acids (AHA/BHA), retinoids, vitamin c if it stings once redness drops and skin stops reacting to basic products, acne is usually already improving because you've killed the inflammation cycle. then you can layer in adapalene or azelaic acid if needed. what does your skin feel like right now, tight after washing, or reactive to products?
- products: 1 item(s)
- status=200 latency=10.92s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1000

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine built around inflammation control and barrier repair, not just surface cleaning.
1. **AM routine** - **cleanser**: gentle, non-stripping (removes overnight oil without damaging barrier) - **azelaic acid**: anti-inflammatory, reduces redness and active acne - **hydrating serum**: hyaluronic acid or peptides to plump and support barrier - **moisturizer**: ceramides + lipids to lock in hydration and repair barrier - **SPF**: blocks UV damage and prevents post-acne pigmentation
2. **PM routine** - **cleanser**: same gentle cleanser as AM - **retinoid**: drives cell turnover and reduces acne over time; use PM only - **treatment serum**: centella or panthenol to calm skin after the retinoid - **hydrating serum**: same as AM - **moisturizer**: same as AM - **occlusive (optional)**: cicaplast or light petrolatum if your barrier feels compromised **key point**: don't start both azelaic and retinoid at full strength on day one. introduce azelaic first (AM only, 1–2 weeks), then add retinoid at low dose (PM, 2–3x per week). this prevents barrier overload and lets you isolate which product causes irritation if it happens.
- products: 2 item(s)
- status=200 latency=9.09s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1189
  - [PASS] latency_lt: 9.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


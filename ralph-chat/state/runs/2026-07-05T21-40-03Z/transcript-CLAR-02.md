# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** your acne is likely driven by inflammation, not just bacteria. before you add any actives, you need to repair your barrier and calm the inflammation cycle. **step 1: repair the barrier.** use a cleanser that doesn't strip (gentle, no sulfates), then apply a moisturizer with ceramides and panthenol. these lock in hydration and reduce irritation. pause any exfoliating acids, retinoids, or vitamin c if your skin is currently reactive (stinging, red, tight after washing). **step 2: reduce inflammation.** inflammation is the root cause of acne breakouts. it's driven by internal factors (gut imbalance, insulin spikes, stress, sugar/dairy) and external ones (over-exfoliation, harsh products, barrier damage, UV). once your barrier is stable and redness drops, then introduce actives like adapalene or azelaic acid. the mistake most people make is jumping straight to acne treatments while their skin is still inflamed and damaged. that makes it worse. repair first, treat second. what does your skin feel like right now. is it red, tight, stinging when you apply products, or just breaking out.
- products: 2 item(s)
- status=200 latency=11.07s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1096

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you mentioned acne breakouts, you're oily/acne-prone. here's your routine: **AM**
1. **cleanse** with a gentle, non-stripping cleanser
2. **azelaic acid** — this is your anti-inflammatory active for acne
3. **moisturizer**, ceramides + lipids to repair barrier
4. **SPF**, blocks UV and prevents post-acne marks from darkening **PM**
5. **cleanse**, remove oil and buildup so actives penetrate
6. **retinoid**, controls turnover and reduces acne over time
7. **moisturizer**, lock in hydration after the active key: don't wash aggressively or over-exfoliate. acne is inflammation-driven, not just bacteria, so barrier repair matters as much as the actives. start low on the retinoid (0.025% adapalene or lower) and build tolerance before adding anything else.
- products: 2 item(s)
- status=200 latency=8.59s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=765
  - [PASS] latency_lt: 8.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


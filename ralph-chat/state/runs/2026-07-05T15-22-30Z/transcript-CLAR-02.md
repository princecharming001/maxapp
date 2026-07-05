# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** your acne is likely downstream of inflammation or a damaged barrier, not just bacteria. most people jump straight to actives and make it worse. here's the move: **repair first, treat second.**
1. **pause exfoliating actives** (AHA/BHA, retinoids, vitamin c) for now. they're making inflammation worse if your skin is reactive.
2. **rebuild the barrier with ceramides + panthenol.** ceramides lock in moisture and strengthen the barrier; panthenol soothes irritation and speeds repair. use a moisturizer with both, AM and PM after cleansing.
3. **once irritation drops** (redness fades, skin feels less tight, breakouts slow), then introduce a low-dose retinoid or azelaic acid to address the acne itself. the reason actives fail for you: you're treating acne while inflamed. inflammation is the root. fix that first, actives work way better after. how long has your skin been reactive (stinging, tight, persistent redness)?
- products: 2 item(s)
- status=200 latency=14.14s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=923

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** you've got acne, so we're going with the oily/acne-prone template. here's the order:
1. **cleanser** — daily, consistent but not aggressive. removes oil and buildup so actives actually work.
2. **azelaic AM**, morning active. anti-inflammatory, targets acne without stripping.

3. **hydrating serum**, hyaluronic acid or beta-glucan after the azelaic. pulls water in, supports barrier.
4. **moisturizer**, ceramides + lipids lock it down.

5. **SPF**, non-negotiable. blocks UV and prevents post-acne marks from darkening.
6. **retinoid PM**, at night only. fixes texture and controls oil long-term.

7. **treatment serum PM**, centella or panthenol after retinoid. calms inflammation.
8. **moisturizer PM**, same ceramides + lipids. the key: azelaic AM, retinoid PM, never both on the same day. repair your barrier first (moisturizer + hydrating serum), then layer actives. acne is downstream of inflammation, so anti-inflammatory order matters more than product count.
- products: 2 item(s)
- status=200 latency=15.27s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=970
  - [PASS] latency_lt: 15.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne']
- needs_judge: ['uses_user_context', 'answers_the_question']


# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a surface problem. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, or skin feeling tight after washing. if you see any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. **repair phase** (2–3 weeks):
1. **cleanse gently** — no scrubs, no hot water, no over-washing
2. **add ceramides + panthenol**, these rebuild the barrier lipids and calm inflammation. CeraVe moisturizing cream or cetaphil are standard picks
3. **pause all actives**, no retinoids, BHA, AHA, vitamin c if it stings once redness drops and skin feels less reactive, you move to the acne protocol. what does your skin feel like right now, tight, burning, or relatively calm?
- products: 1 item(s)
- status=200 latency=10.61s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=918

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine: **AM**
1. **cleanse** — wash daily, not aggressive
2. **azelaic acid**, apply after cleanse on dry skin
3. **moisturizer**, lock in hydration after the active
4. **SPF**, non-negotiable, blocks UV and prevents post-acne marks **PM**
5. **cleanse**, same as AM
6. **retinoid**, apply after cleanse on dry skin
7. **moisturizer**, repair barrier after the active
8. **occlusive (optional)**, if skin feels tight or irritated, seal with cicaplast or light petrolatum the order matters. cleanser first so actives actually reach skin, then the active, then hydration and barrier repair. azelaic in the AM calms inflammation; retinoid at night drives texture and turnover. don't stack both actives on the same night. what cleanser and retinoid are you using now, or do you need product recs.
- products: 2 item(s)
- status=200 latency=7.9s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=882
  - [PASS] latency_lt: 7.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


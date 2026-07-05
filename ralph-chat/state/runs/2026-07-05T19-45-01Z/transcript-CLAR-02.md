# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. your barrier is probably taking hits from breakouts + whatever you're using to treat them, which loops back into more acne. here's the move: pause any actives (retinoids, BHA, vitamin c) for now. rebuild first with ceramides and panthenol to lock moisture and kill redness, then layer in targeted acne treatment once irritation drops. what's your current routine look like. are you using any actives or harsh products right now.
- status=200 latency=8.46s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=490

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, here's the move for oily/acne-prone skin. **AM routine:**
1. **cleanse** with a gentle cleanser, daily
2. **azelaic acid** after cleansing
3. **moisturizer** to lock in hydration
4. **SPF** to block UV (prevents post-acne marks from darkening) **PM routine:**
5. **cleanse** again, same gentle cleanser
6. **retinoid** (this is your main acne fighter—controls inflammation and turnover)
7. **moisturizer** to repair barrier while the retinoid works the key: azelaic AM, retinoid PM, consistent but not aggressive washing. acne is inflammation-driven, so these two actives target it at the root. don't layer multiple actives on the same night or you'll wreck your barrier and loop back into more breakouts. what's your current cleanser and do you have a retinoid already, or starting from scratch.
- products: 2 item(s)
- status=200 latency=7.52s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=849
  - [PASS] latency_lt: 7.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


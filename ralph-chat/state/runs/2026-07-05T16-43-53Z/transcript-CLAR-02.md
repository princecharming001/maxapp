# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation first, not a product problem. before you jump to actives, check if your barrier is intact. signs your barrier is shot: persistent redness, burning when you apply stuff, dryness even after moisturizing, flaky texture, or breakouts getting worse with each new product you try. if any of those ring true, pause exfoliating acids, retinoids, vitamin c, and over-washing. instead, rebuild with ceramides and panthenol for 2-3 weeks. once redness and irritation drop, acne usually follows. then you can layer in actives. the mistake most people make is treating texture or acne while still inflamed, which just cycles the breakouts worse. what does your skin feel like right now. tight after washing, stinging with products, or just active breakouts without the irritation signs.
- status=200 latency=13.54s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=808

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine: **AM**
1. **cleanse** — daily, consistent but not aggressive
2. **azelaic acid**, apply after cleanse
3. **moisturizer**, lock in hydration
4. **SPF**, non-negotiable; blocks UV and prevents post-acne marks from darkening **PM**
5. **cleanse**, remove oil, dirt, sunscreen buildup so actives reach skin
6. **retinoid**, apply on clean, dry skin
7. **moisturizer**, repair barrier after the active the order matters. cleanser first, then active, then moisturizer. azelaic AM, retinoid PM. don't stack actives on the same night. your barrier is the foundation; if it's already compromised (burning, persistent redness), dial back to just cleanser + moisturizer for a week, then reintroduce one active at a time. what's your current cleanser, and do you have azelaic or retinoid on hand already.
- products: 2 item(s)
- status=200 latency=7.79s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=889
  - [PASS] latency_lt: 7.8s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


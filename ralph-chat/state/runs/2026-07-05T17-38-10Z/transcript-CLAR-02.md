# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just surface bacteria. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you see any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. start with ceramides and panthenol to lock in moisture and calm inflammation. pause exfoliating acids, retinoids, and vitamin c until irritation drops. once the barrier is stable (usually 2-3 weeks), you can layer in acne actives without triggering more breakouts. what does your skin feel like right now. tight, stinging, or relatively calm.
- status=200 latency=9.63s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=783

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine: **AM**
1. **cleanse** with a gentle cleanser, daily
2. **azelaic acid** after cleanse
3. **moisturizer** to lock hydration
4. **SPF** (non-negotiable; UV drives post-acne marks darker) **PM**
5. **cleanse** again
6. **retinoid** (this is your main acne fighter; controls oil, kills bacteria, reduces inflammation)
7. **moisturizer** (retinoids are drying; barrier repair matters) key: don't be aggressive with washing. cleanse twice daily, not more. azelaic AM + retinoid PM is the standard acne stack. start low on retinoid dose and titrate up over 4–6 weeks so your barrier doesn't crater. if you feel stinging or burning, you went too fast or your barrier is already compromised. what retinoid strength are you thinking, or do you need a recommendation on that.
- products: 2 item(s)
- status=200 latency=8.5s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=861
  - [PASS] latency_lt: 8.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


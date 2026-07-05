# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation first. before you touch actives, you need to know if your barrier is intact. check yourself: do you get stinging when you apply products, persistent redness, dryness even after moisturizing, or flaky texture. if yes, your barrier is compromised and treating acne aggressively will backfire. the fix is repair first, then actives. that means ceramides and panthenol to lock moisture and calm inflammation, not jumping straight to adapalene or benzoyl peroxide. once redness and irritation drop, acne usually improves on its own because you've killed the inflammation cycle. then you can layer in a retinoid. what does your skin feel like right now. tight, stinging, or relatively calm.
- products: 1 item(s)
- status=200 latency=9.81s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=719

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine: **AM:**
1. **cleanse** with a gentle cleanser, daily
2. **azelaic acid** as your active
3. **moisturizer** to lock in hydration
4. **SPF** to block UV (prevents post-acne marks from darkening) **PM:**
5. **cleanse** again
6. **retinoid** as your active
7. **moisturizer**
8. **occlusive** (optional, only if you feel tight/dry after the retinoid) key: don't wash aggressively. acne is inflammation first, and over-washing damages your barrier, which makes breakouts worse. azelaic + retinoid handle the inflammation and texture; SPF stops pigmentation from setting in. stick with this for 6–8 weeks before adding anything else. what's your current barrier status. do you get stinging when you apply products, or persistent dryness.
- products: 2 item(s)
- status=200 latency=9.0s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=828
  - [PASS] latency_lt: 9.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


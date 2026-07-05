# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a surface problem. before you jump to actives, you need to know if your barrier is intact. if it's damaged, treating acne will backfire and make breakouts worse. **check your barrier first.** do you have persistent redness, burning when you apply products, dryness even after moisturizing, or flaky texture. if yes, pause any exfoliating acids or retinoids and rebuild first. **the repair sequence is: barrier → inflammation → actives.** start with ceramides and panthenol to lock in moisture and calm irritation, then once redness drops, layer in acne-fighting actives like adapalene or azelaic acid. what does your skin feel like right now. tight after washing, stinging with products, or relatively calm.
- products: 1 item(s)
- status=200 latency=12.9s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=759

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine built around inflammation control and barrier repair, not just spot-treating. here's what works for acne-prone skin.
1. **cleanse daily**. use a gentle cleanser, not aggressive washing. this removes oil and buildup so actives actually reach skin.

2. **AM: azelaic acid**. azelaic is anti-inflammatory and targets acne at the root. apply after cleanse on damp skin, then layer hydrating serum and SPF.
3. **PM: retinoid**. retinoids control turnover and reduce inflammation long-term. apply after cleanse, follow with treatment serum (centella or panthenol work well), then moisturizer.

4. **barrier repair matters**. after cleanse, use a hydrating serum (hyaluronic acid or peptides), then moisturizer with ceramides. if skin feels tight or irritated, add an occlusive like cicaplast PM. the order is: cleanse → active (azelaic AM, retinoid PM) → treatment serum → hydrating serum → moisturizer → SPF (AM only). don't skip the hydration layers. acne gets worse when your barrier is damaged, so repair comes first. what's your current skin type. oily, dry, or combo. that changes product picks.
- products: 2 item(s)
- status=200 latency=9.12s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1157
  - [PASS] latency_lt: 9.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


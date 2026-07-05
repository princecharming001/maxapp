# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just surface bacteria. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, or products suddenly stopping working. if any of those match, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. start with ceramides (the lipids your barrier needs) and panthenol (hydrates + calms inflammation). pause exfoliating acids, retinoids, and vitamin c until irritation drops. once your skin feels stable again, you can layer in acne actives without triggering more breakouts. what does your skin feel like right now. tight after washing, stinging with products, or pretty normal aside from the breakouts.
- status=200 latency=9.01s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=848

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** you've got acne-prone skin, so the routine is straightforward: cleanse daily, azelaic in the AM, retinoid at night. the order matters. here's the structure:
1. **cleanse** — removes oil and buildup so actives actually work
2. **azelaic AM**, anti-inflammatory, hits acne at the root
3. **retinoid PM**, fixes texture and prevents new breakouts
4. **moisturizer**, ceramides + lipids repair your barrier so it can handle the actives
5. **SPF AM**, blocks UV, prevents post-acne marks from darkening don't skip the moisturizer or SPF. acne-prone skin that's also dehydrated or sun-damaged gets worse, not better. start with the azelaic and retinoid, keep everything else consistent for 6–8 weeks before adding anything else.
- products: 2 item(s)
- status=200 latency=8.05s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=722
  - [PASS] latency_lt: 8.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


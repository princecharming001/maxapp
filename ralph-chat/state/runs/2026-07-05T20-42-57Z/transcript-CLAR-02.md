# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a surface problem. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you see any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. **repair phase** (2–3 weeks):
1. **ceramides** — lock in moisture, strengthen the barrier. safe for all skin types
2. **panthenol (vitamin B5)** , hydrates and reduces redness, speeds barrier repair
3. **pause** exfoliating acids (AHA/BHA), retinoids, vitamin c if it stings once redness and irritation drop, acne actives (like adapalene) will actually work instead of making things worse. what does your skin feel like right now. tight, burning, or pretty normal aside from the breakouts.
- status=200 latency=11.37s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=931

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the structure:
1. **cleanse daily** — morning and night, consistent but not aggressive washing
2. **AM: azelaic acid**, after cleanse, before moisturizer
3. **PM: retinoid**, after cleanse, before moisturizer. this is the heavy lifter for acne and texture
4. **moisturize both times**, ceramides + lipids to repair barrier, especially important since acne-prone skin often has damage from breakouts or over-treating
5. **SPF every morning**, acne inflammation leaves marks (PIH); SPF prevents them from darkening the order matters: cleanse → active (azelaic AM, retinoid PM) → moisturizer → SPF (AM only). don't stack actives on the same night. what specific products do you already have, or do you need recs for each step.
- products: 2 item(s)
- status=200 latency=8.01s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=807
  - [PASS] latency_lt: 8.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a surface problem. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, or skin feeling tight after washing. if any of those are there, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat.
1. **repair the barrier** with ceramides and panthenol (both lock moisture, reduce inflammation, speed healing).

2. **reduce inflammation** by pausing exfoliating acids, retinoids, and over-washing while you repair.
3. **then introduce actives** (adapalene or azelaic acid) once redness and irritation drop. what does your skin feel like right now. tight, burning, or pretty normal aside from the breakouts.
- products: 1 item(s)
- status=200 latency=9.82s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=857

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** what are you trying to fix?
- choices: ['clearer skin', 'less acne', 'anti-aging', 'even texture', 'hydration', 'Something else'] (multi=True)
- status=200 latency=1.59s error=None
- checks:
  - [FAIL] choices_absent: choices=['clearer skin', 'less acne', 'anti-aging', 'even texture', 'hydration', 'Something else']
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: skipped (choices present, short clarifier OK)
  - [PASS] latency_lt: 1.6s (ceiling 45s)
  - [FAIL] includes_any: none of ['acne', 'breakout'] found
- needs_judge: ['uses_user_context', 'answers_the_question']


# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** also want to check: do you have a skincare routine set up yet, or are you running just the tret solo?
- status=200 latency=8.94s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=101

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** two weeks in, you're still in the adjustment phase. stick with every other night for now.

your skin needs time to build tolerance — tretinoin causes dryness, peeling, and irritation (the "retinization" phase), especially on combination skin with acne. jumping to nightly too fast tanks your barrier and makes acne worse before it gets better.

the standard ramp is:
1. **weeks 1–4**: every other night (where you are)
2. **weeks 4–8**: assess tolerance, then move to 3x/week if you're handling it
3. **weeks 8+**: gradually increase to nightly if your skin adapts

at 0.025% you have room to move up eventually, but rushing it defeats the purpose. how's your skin feeling right now — any major peeling or redness?
- status=200 latency=8.52s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=714

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** stop whatever you're doing to your skin right now—you've probably over-exfoliated or used something too strong. stick to a gentle cleanser, moisturizer, and sunscreen only until it calms down, then we can talk about building a real routine.
- products: 3 item(s)
- status=200 latency=12.95s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=240
  - [PASS] latency_lt: 12.9s (ceiling 45s)
  - [FAIL] includes_any: none of ['tretinoin', 'retinoid', 'purge', 'adjust'] found
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


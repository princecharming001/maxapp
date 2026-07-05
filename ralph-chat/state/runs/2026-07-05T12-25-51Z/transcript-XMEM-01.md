# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're likely past the initial irritation wave but still ramping up tolerance. how's your skin responding so far—any redness, peeling, sensitivity, or looking smoother already?

the main move right now is keeping the barrier locked down and not overloading it. if you're not already, you need:

1. **cleanser**: gentle, non-stripping. lukewarm water, no actives or physical exfoliation while you adjust.
2. **moisturizer**: heavy hitter. apply to damp skin right after cleansing to trap hydration, then wait 15–20 min before tret.
3. **sunscreen**: spf 30+ every single morning, no negotiation. tret makes skin photosensitive.

a few hard rules: start low frequency (2–3x per week if you haven't already), increase slowly over weeks, and never mix tret with other actives (niacinamide, aha/bha, vitamin c) until your skin's rock solid. if you're getting raw, red, or flaking hard, dial back to once weekly until it settles.

what does your current routine look like, and how's the skin feeling?
- products: 2 item(s)
- status=200 latency=11.13s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1008

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in and still building tolerance.

the standard ramp is: 2–3x per week for the first 4–6 weeks, then gradually move to every other night around week 6–8, then nightly around week 10–12 if your skin can handle it. jumping straight to every night this early risks unnecessary irritation, barrier damage, and you'll quit because it sucks.

stick with every other night for the next 2–3 weeks. if your skin's stable (no raw patches, manageable dryness, no excessive peeling), bump to 4x per week. keep climbing slowly from there.

the goal is getting to nightly eventually, but rushing it wastes the tret—your skin's too irritated to actually use it well. patience here pays off faster than pushing hard.
- status=200 latency=8.84s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=748

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** grab the cerave moisturizing cream (tub) for now — it's heavy enough to seal the barrier fast. the pm lotion works too if you want something lighter for mornings.
- products: 3 item(s)
- status=200 latency=12.15s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=162
  - [PASS] latency_lt: 12.1s (ceiling 45s)
  - [FAIL] includes_any: none of ['tretinoin', 'retinoid', 'purge', 'adjust'] found
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


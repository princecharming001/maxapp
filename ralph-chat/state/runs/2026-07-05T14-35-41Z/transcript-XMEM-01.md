# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** solid. how's your skin responding so far? any redness, peeling, irritation, or is it pretty calm?

also—are you using it every night, or did you start with lower frequency to build tolerance?
- status=200 latency=8.12s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=191

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start with every other night for at least 4-6 weeks, then move to nightly once your skin adapts.

tretinoin at 0.025% is mild, but two weeks in you're still in the adjustment phase. going nightly too fast = unnecessary irritation, redness, and peeling that'll make you want to quit. every other night lets your barrier strengthen while you get the benefits.

once you're 6-8 weeks in and your skin feels solid (minimal irritation, no excessive dryness), bump to every night. you can always go back down if it flares up.

also make sure you're:

1. **moisturizing after** — wait 20 min after applying tret, then lock it in with a good moisturizer
2. **spf 30+ every morning** — tret makes you sun-sensitive, no exceptions
3. **keeping it simple** — skip actives (niacinamide, aha/bha, vitamin c) for the first month to let your skin settle
- products: 2 item(s)
- status=200 latency=7.45s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=838

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your skin barrier is compromised. stop all active ingredients immediately — no tretinoin, no acids, no vitamin c, nothing. you're two weeks into tretinoin, which is likely the culprit.

here's what to do right now:

1. **cleanser**: use only a gentle, fragrance-free cleanser (cerave hydrating, vanicream, or similar). lukewarm water, no hot showers.

2. **moisturizer**: apply a heavy moisturizer while skin is still damp. this locks in hydration and starts repairing the barrier. use it morning and night.

3. **sunscreen**: spf 30+ every morning, non-negotiable. uv exposure will deepen redness and slow healing.

4. **pause tretinoin**: give your skin 1–2 weeks off completely. then restart at 0.025% once per week, not every night. your barrier needs time.

5. **anti-inflammatory diet**: cut sugar, seed oils, and processed foods for the next week. add protein and hydration. inflammation inside speeds up inflammation outside.

the peeling and redness should calm in 3–5 days if you nail the moisturizer. if it gets worse (burning, severe stinging, or rash spreading), see a dermatologist.

what moisturizer are you using now?
- products: 3 item(s)
- status=200 latency=10.28s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1133
  - [PASS] latency_lt: 10.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


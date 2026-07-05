# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're still in the adjustment phase. how's your skin responding so far — any redness, peeling, sensitivity, or is it holding up okay?
- status=200 latency=8.32s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=148

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% and only two weeks in, every other night is the safer play. you're still building tolerance, and tretinoin can be aggressive even at the lowest dose.

here's the logic: if your skin feels stable (minimal irritation, no excessive peeling or redness), you can push toward nightly around week 4–6. but jumping straight to every night this early risks compromising your barrier, which tanks your skin texture goals and makes the whole thing backfire.

stick with every other night for another 2–3 weeks, then reassess. if you're not getting the peeling/irritation response, bump to nightly. if you're already red or flaking, stay where you are.

also make sure you're using a good moisturizer right after (while skin is still slightly damp) and spf 30+ every morning, no skips. tretinoin + sun = hyperpigmentation risk, especially with your texture concern.
- products: 1 item(s)
- status=200 latency=7.96s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=863

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** that's your barrier breaking down. peeling + redness together means you're either over-exfoliating, using something too strong, or both. since you started tretinoin 0.025% two weeks ago, that's almost certainly the culprit.

here's what to do right now:

1. **stop all actives** — drop the tret for 3–5 days. no acids, no vitamin c, nothing. let your skin recover.

2. **wash once daily, lukewarm water only** — use your gentlest cleanser (or just water), pat dry gently, don't rub.

3. **moisturize heavily** — apply a thick moisturizer while skin is still damp. lock in hydration. do this twice daily if peeling is bad.

4. **no physical exfoliation** — no scrubs, washcloths, or anything rough.

5. **spf 30+ during the day** — barrier damage makes skin photosensitive. sun exposure will make redness worse and slower to heal.

after 3–5 days, reintroduce tretinoin but at **half frequency** — start with once or twice a week instead of nightly. give your barrier 2–3 weeks to stabilize before ramping back up. the goal is to use tret without triggering this cycle again.

what's your current moisturizer?
- products: 1 item(s)
- status=200 latency=9.67s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1108
  - [PASS] latency_lt: 9.7s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


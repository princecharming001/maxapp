# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in is still the adjustment phase. how's your skin holding up — any peeling, redness, or dryness yet? and are you on a routine that supports the tretinoin, or flying solo with it?
- status=200 latency=7.84s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=188

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% and only two weeks in, every other night is the safer call right now. your skin's still getting used to it.

the standard ramp is: start low frequency (2-3x/week), build tolerance over 4-6 weeks, then move to nightly if your barrier handles it. since you're already at every other night territory, stick there for another 2-3 weeks minimum before going nightly. watch for excessive peeling, irritation, or compromised barrier (tight, stinging, raw-looking). if those show up, dial it back to 2x/week.

once you're solid on every other night with zero irritation for a few weeks, nightly is the move — that's when tretinoin really works for texture. but rushing it tanks your barrier and you'll spend months recovering.

are you using a good moisturizer after the tret, or buffering it with moisturizer first?
- products: 1 item(s)
- status=200 latency=8.81s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=818

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your skin's barrier is compromised. peeling + redness together means irritation, not just dryness, so you need to stop everything aggressive immediately.

here's what to do right now:

1. **strip your routine back to basics** — cleanser, moisturizer, spf. nothing else. no actives (retinoids, acids, vitamin c), no exfoliation, no new products for at least a week.

2. **use a gentle cleanser** — lukewarm water, minimal friction. pat dry, don't rub.

3. **moisturize heavily** — apply to damp skin to lock in water. something with ceramides or centella asiatica helps repair the barrier faster.

4. **spf 30+ every morning** — uv exposure makes inflammation worse. non-negotiable.

5. **dial back your routine timing** — if you're cleansing twice daily, drop to once daily (evening only) until it settles. your skin needs recovery time.

the peeling usually stops within 3-5 days once you stop irritating it. redness takes longer, 1-2 weeks depending on what caused it. if it's still bad after a week or spreads, see a derm.

what triggered it? did you recently add a product, increase exfoliation frequency, or switch something?
- products: 1 item(s)
- status=200 latency=9.73s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1130
  - [PASS] latency_lt: 9.7s (ceiling 45s)
  - [PASS] includes_any: matched: ['retinoid']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


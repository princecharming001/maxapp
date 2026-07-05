# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** how's your skin handling it so far? typical early signs are dryness, peeling, mild redness. two weeks in you're probably hitting the adjustment phase.

what's your routine looking like right now — are you buffering it (mixing with moisturizer first), how many nights per week, and what else are you using?
- products: 1 item(s)
- status=200 latency=6.51s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=305

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start with every other night for the first 4–6 weeks, then move to nightly once your skin adapts.

at 0.025% you're on the lowest dose, so you have room to ramp up. jumping straight to every night risks unnecessary irritation — peeling, sensitivity, compromised barrier. every other night lets your skin build tolerance without overdoing it.

after 4–6 weeks of every other night, if you're not seeing excess irritation (raw patches, stinging), shift to nightly. most people tolerate that well and see better results.

also make sure you're buffering: apply a light moisturizer first, wait 20 min, then the tret. keeps the irritation down and doesn't tank efficacy. and spf 30+ every single morning, no skips — tret makes you photosensitive.
- products: 1 item(s)
- status=200 latency=6.66s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=741

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your barrier is compromised. stop everything except cleanser and moisturizer for 3-5 days, then rebuild slowly.

here's what to do right now:

1. **stop actives** — pause tretinoin, acids, vitamin c, retinoids, anything strong. you're two weeks in, so this pause won't kill progress and your skin needs to recover.

2. **cleanse gently** — use a mild cleanser (no scrubbing, no hot water). once a day if you're very irritated, twice if you can handle it without stinging.

3. **moisturize heavily** — apply to damp skin immediately after cleansing. a good moisturizer with ceramides or centella will calm redness and lock hydration in.

4. **skip sunscreen for now if it stings** — if spf burns, wait until the barrier settles. once redness drops, reintroduce it.

5. **after 3-5 days** — if the peeling and redness have calmed, reintroduce tretinoin at the lowest frequency (once or twice a week instead of nightly). if it flares again, extend the pause another week.

peeling + redness from tretinoin early on is normal but means your skin can't handle nightly dosing yet. most people need to titrate slower. you're not failing, you're just adjusting the dose down.

what moisturizer are you using right now?
- products: 1 item(s)
- status=200 latency=9.57s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1210
  - [PASS] latency_lt: 9.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'retinoid', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


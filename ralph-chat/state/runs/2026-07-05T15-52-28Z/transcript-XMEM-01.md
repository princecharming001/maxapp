# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're probably still in the adjustment phase. how's your skin reacting — any redness, peeling, or sensitivity spikes? and are you using it every night or starting slower?

the reason i ask: tretinoin is a heavy hitter for acne, but the first month is usually rough. if you're flaking or irritated, dialing back frequency (e.g., every other night or 2x/week) often works better than pushing through. once your skin adapts (usually 4-6 weeks), you can ramp up.

also, are you on any other actives right now (niacinamide, azelaic acid, vitamin c)? because tretinoin doesn't play well with everything, and oily acne-prone skin needs a solid barrier while adjusting.
- products: 2 item(s)
- status=200 latency=10.99s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=676

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start every other night for the next 2-4 weeks, then move to nightly once your skin stops peeling and feels stable.

you're only two weeks in, so your moisture barrier is still adjusting. pushing to every night right now will likely wreck your skin with excessive dryness, irritation, and potentially a flare. every other night lets you build tolerance without the backlash.

watch for these signs you're ready to go nightly: peeling has mostly stopped, no raw patches, and your skin feels comfortable (not tight or angry). once you hit that, bump it up. most people get there by week 4-6.

in the meantime, keep your routine minimal: gentle cleanser, moisturizer (something heavier than usual), and spf 30+ every morning. skip other actives for now.
- products: 1 item(s)
- status=200 latency=6.67s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=750

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your barrier is compromised. stop everything except a gentle cleanser, moisturizer, and spf for the next 3-5 days. this means no actives (tretinoin, acids, vitamin c, niacinamide) until the peeling and redness calm down.

since you're two weeks into tretinoin 0.025%, this is likely retinization — your skin is adjusting and the barrier got irritated. it's normal but needs a pause.

here's the reset:

1. **cleanser**: use a gentle, creamy cleanser (no sulfates, no fragrance). wash once in the morning, once at night.
2. **moisturizer**: apply while skin is still damp. lock in hydration to repair the barrier.
3. **spf 30+**: every morning, no exceptions. uv exposure makes redness worse.

skip tretinoin for 3-5 days, then restart at the same dose (0.025%) but only 2-3x per week instead of nightly. go slower. once the peeling stops, you can increase frequency again.

if it's still red and peeling after a week, or if it burns, stop tretinoin entirely and let the barrier fully recover before restarting.

what cleanser and moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=10.6s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1066
  - [PASS] latency_lt: 10.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


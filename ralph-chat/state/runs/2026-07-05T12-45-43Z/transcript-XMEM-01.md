# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in and you're already past the worst of the adjustment phase. how's your skin responding — any redness, flaking, or sensitivity right now, or are you settling in okay?

also, what's your current routine around it (cleanser, moisturizer, sunscreen)? tretinoin at 0.025% is mild, but the support routine matters a lot for keeping your barrier intact and actually seeing results without unnecessary irritation.
- products: 1 item(s)
- status=200 latency=8.0s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=417

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start every other night for at least another 2–4 weeks, then move to nightly once your skin stops showing active irritation (flaking, persistent redness, tightness).

you're only two weeks in. jumping to every night now risks compromising your barrier and making the adjustment phase way worse than it needs to be. the tretinoin will still work at every-other-night dosing, and you'll tolerate it better, which means you'll actually stick with it.

once you hit nightly without issue, you can stay there or eventually work up to it twice daily if you want faster results (though that's overkill for most people).
- status=200 latency=6.83s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=612

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling + redness usually means your barrier is compromised. stop everything except the basics right now.

here's what to do:

1. **cleanser only**: wash with just water or a gentle cleanser (no actives, no exfoliants). morning and night.

2. **moisturize heavily**: lock in hydration immediately after cleansing while skin is still damp. this is non-negotiable for barrier repair.

3. **sunscreen**: spf 30+ every morning. uv exposure makes redness worse and slows healing.

4. **skip actives**: no retinoids, acids, vitamin c, niacinamide, or anything else for 1–2 weeks minimum. let the barrier recover first.

5. **identify the trigger**: did you recently start a new product, increase exfoliation frequency, use a strong active, or get sun exposure? figure out what caused it so you don't repeat it.

once the peeling stops and redness calms (usually 5–10 days), you can slowly reintroduce one active at a time.

what triggered this, do you know? and are you currently using any actives or treatments?
- products: 2 item(s)
- status=200 latency=8.61s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1006
  - [PASS] latency_lt: 8.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['retinoid']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


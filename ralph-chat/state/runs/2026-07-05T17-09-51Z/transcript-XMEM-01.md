# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** how's your skin responding so far? any irritation, peeling, redness, or is it pretty calm?

also—are you using it every night, or did you start slow (like 2-3x per week)?
- status=200 latency=7.85s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=170

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start every other night for at least 4-6 weeks, then move to nightly once your skin adapts.

at 0.025% you're on the gentlest dose, but tretinoin still needs a ramp-up period. jumping to every night risks unnecessary irritation, barrier damage, and you'll bail on it faster. every other night lets your skin build tolerance without the frustration.

once you hit week 4-6 and peeling/redness is minimal, shift to nightly. you can always go back down if you flare up.
- status=200 latency=6.8s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=466

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** sounds like your barrier is damaged. stop everything except cleanser, moisturizer, and spf for the next 3–5 days. this usually happens after starting tretinoin or over-exfoliating.

since you're two weeks into tretinoin 0.025%, your skin is likely adjusting. peeling and redness are normal, but if it's uncomfortable or burning, dial back frequency.

here's what to do right now:

1. **cleanser** — gentle, no actives. lukewarm water, pat dry (don't rub).
2. **moisturizer** — apply to damp skin immediately. something thick and simple.
3. **spf 30+** — every morning, non-negotiable. uv makes irritation worse.
4. **skip tretinoin for 2–3 nights** — let the barrier recover. when you restart, drop to 1–2× per week instead of nightly.

avoid: other actives (vitamin c, niacinamide, azelaic acid), physical exfoliation, hot water, fragrance.

what moisturizer are you using right now?
- products: 3 item(s)
- status=200 latency=9.09s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=884
  - [PASS] latency_lt: 9.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


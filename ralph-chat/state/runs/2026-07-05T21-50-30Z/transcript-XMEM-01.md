# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** you're two weeks in, so you're still in the irritation/adjustment phase. here's what matters right now: **keep the dose low and frequency slow.** at 0.025% you're already below the standard start (0.05%), which is smart for tolerance. don't jump frequency yet. apply 2–3× per week on dry skin, wait 20 min after cleansing, pea-sized amount. your barrier is still rebuilding. **support the barrier hard.** ceramides + panthenol after tretinoin, then a heavier moisturizer. skip any exfoliating acids (BHA/AHA) for the next 2–4 weeks. azelaic acid 10–20% is fine to layer underneath tretinoin if you're not flaking yet, but hold off if you're red or tight. **SPF every day, no exceptions.** tretinoin makes skin photosensitive. UV will undo the work and darken any existing pigment. what's your skin doing right now—flaking, redness, tight, or holding up okay?
- products: 2 item(s)
- status=200 latency=8.69s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=858

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in and at 0.025%, so frequency matters more than dose at this stage. every other night lets your skin adapt without hammering the barrier. once you're 6–8 weeks in with no persistent redness or flaking, you can try 4–5× per week. if you jump to nightly now, you'll likely hit a wall—excessive dryness, irritation, sensitivity—and then you'll have to back off anyway. slow and steady wins. stick with every other night for at least another 4 weeks, then reassess.
- status=200 latency=6.1s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=511

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your tretinoin is still adjusting. at 2 weeks in, peeling and redness are normal, but they mean your barrier is under stress. here's how to dial it back:

1. **cut frequency to 2x/week** for the next 2 weeks. this lets your skin adapt without the irritation spiral. you can climb back up once peeling stops.

2. **skip everything else actives** — no vitamin c, niacinamide, azelaic acid, or other treatments right now. tretinoin is enough.

3. **cleanse gently** — use a non-foaming cleanser (something creamy, not stripping). wash once daily at night before tret, skip the morning wash if your face isn't visibly dirty.

4. **moisturize heavily** — apply while skin is still damp. use a thick cream or occlusive (something with ceramides or petrolatum). this is non-negotiable when peeling.

5. **spf 30+ every morning** — tretinoin makes you sun-sensitive. missing this tanks your progress and worsens redness.

if redness and peeling don't improve in 2 weeks at 2x/week, drop to once weekly. the goal is finding the frequency your barrier can handle, not pushing through irritation. once you're stable for 4 weeks, you can gradually increase again.

what cleanser and moisturizer are you using right now?
- products: 3 item(s)
- status=200 latency=8.73s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1207
  - [PASS] latency_lt: 8.7s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


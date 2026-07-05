# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** solid move, that's the right starting dose. stick with it for at least 8-12 weeks before you judge results—skin turnover takes time and you'll probably get some peeling/irritation first, but that's normal.
- status=200 latency=11.26s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=205

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for the first month, then you can move to nightly once your skin adjusts. you're only two weeks in, so you're still in the adjustment window—going every night too fast will wreck your barrier and make the dryness worse.

since you've got dry skin already, make sure you're:

1. **waiting 20 minutes** after cleansing before applying tret (damp skin increases irritation)
2. **using a pea-sized amount** on the whole face
3. **moisturizing after**, ideally with something that locks in hydration

what moisturizer are you using right now?
- products: 1 item(s)
- status=200 latency=6.91s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=555

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** you're likely dealing with a compromised barrier from the tretinoin. at 0.025% two weeks in, peeling and redness are normal, but you need to dial back the irritation before it gets worse.

here's the move:

1. **cut tretinoin frequency**: drop to 2–3× per week instead of nightly. this gives your skin time to adapt without stopping progress.

2. **strip your routine**: cleanser (gentle, no actives), moisturizer, spf. nothing else. no vitamin c, niacinamide, acids, or other treatments right now. your barrier is talking.

3. **moisturize heavily**: apply to damp skin immediately after cleansing to trap water. use something occlusive at night (like a heavier cream or even a thin layer of vaseline on top) to seal it.

4. **sunscreen daily**: tretinoin makes skin photosensitive. spf 30+ every single morning, no exceptions.

5. **wait it out**: barrier repair takes 1–2 weeks once you back off. the peeling should ease, then you can slowly reintroduce tretinoin frequency.

the redness will fade as the barrier heals. if it gets worse, burns, or doesn't improve in 10 days, pause tretinoin entirely for a week and just focus on barrier repair.

what moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=9.3s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1191
  - [PASS] latency_lt: 9.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


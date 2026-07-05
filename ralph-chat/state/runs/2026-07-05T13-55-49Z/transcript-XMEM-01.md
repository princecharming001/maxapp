# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're likely still in the adjustment phase. tretinoin works on texture over time, but the first month is usually rough — expect some dryness and peeling as your skin retinizes (adapts to the retinoid). that's actually a sign it's working, not that something's wrong.

what's your current routine around it. are you using a moisturizer after, buffering it, or going straight application.
- products: 1 item(s)
- status=200 latency=11.11s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=401

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. at 0.025% you could technically do nightly, but two weeks in you're still building tolerance. every other night lets your skin adapt without overloading it, keeps irritation down, and you'll still see results — tretinoin's cumulative, not dependent on daily use.

once you're 6–8 weeks in and your skin feels solid (no excessive peeling, barrier's stable), you can bump to nightly if you want faster progress. but there's no rush. consistent every-other-night beats sporadic nightly.

what's your current moisturizer setup. tretinoin needs a solid hydration layer to work without wrecking your barrier.
- products: 1 item(s)
- status=200 latency=7.4s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=629

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** you're likely dealing with a compromised barrier. peeling + redness together usually means either over-exfoliation (from tretinoin, acids, or both) or an inflammatory response.

since you started tretinoin 0.025% two weeks ago, that's the most likely culprit. your skin is adjusting and the barrier is irritated.

here's what to do right now:

1. **pause exfoliation** — stop any acids, vitamin c, retinoids other than the tret, physical scrubs. nothing else for 1-2 weeks.

2. **simplify to barrier repair** — cleanser, moisturizer, sunscreen only. that's it. no actives.

3. **dial back tretinoin frequency** — if you're doing it nightly, drop to every other night or even 2x/week until redness settles. you can ramp back up once skin stabilizes.

4. **moisturize aggressively** — apply to damp skin right after cleansing to lock in water. a heavier moisturizer at night helps.

5. **spf every morning** — sun exposure makes redness and peeling worse and slows barrier healing.

the peeling should ease in 3-5 days once you back off. redness may take 1-2 weeks. tretinoin is strong; slow titration beats pushing through irritation.

what's your current routine look like (cleanser, moisturizer, sunscreen)? and are you applying the tret to damp or dry skin?
- products: 1 item(s)
- status=200 latency=8.82s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1259
  - [PASS] latency_lt: 8.8s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'retinoid', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


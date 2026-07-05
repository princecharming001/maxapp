# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in at 0.025% is still the intro phase. you're likely experiencing some dryness and mild irritation, which is normal. stick with it but don't rush the dose. here's what matters right now:
1. **keep the frequency low for another 2–4 weeks.** apply 0.025% every 3–4 days (not nightly yet). let your barrier adapt.
2. **apply on completely dry skin, pea-sized amount.** wait 20 minutes after cleansing so there's zero water on your face. water increases penetration and irritation.

3. **layer a heavy moisturizer after.** ceramides + panthenol to rebuild barrier while tretinoin is working.
4. **SPF every day, non-negotiable.** tretinoin makes you photosensitive.

UV will undo the work and darken any existing pigmentation.
5. **skip any other actives** (acids, vitamin c, azelaic) for the first 1–2 weeks while your skin adjusts. what's your skin type and are you seeing redness or peeling yet.
- products: 2 item(s)
- status=200 latency=10.23s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=904

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now.

0.025% is the gentlest dose, but two weeks in your skin is still adjusting. jumping to nightly will spike irritation and redness without giving you faster results—it just burns through your barrier faster.

go every other night for the next 2–3 weeks. once you're at 4–6 weeks total and your skin feels stable (minimal peeling, no raw spots), move to nightly. you'll get better results by building tolerance than by forcing it.
- status=200 latency=6.48s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=455

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling and redness together usually means your barrier is compromised, most likely from the tretinoin you started two weeks ago. that's normal early on, but you need to dial it back.

here's what to do right now:

1. **cut tretinoin frequency** — drop to 1–2× per week instead of every night. let your skin settle for a week or two before ramping back up.

2. **simplify your routine** — cleanser, moisturizer, spf. nothing else. no actives, no exfoliants, no vitamin c or niacinamide yet. just barrier repair.

3. **moisturize heavily** — apply to damp skin right after cleansing to lock in water. a heavier cream at night helps too.

4. **spf every morning** — uv exposure makes redness and peeling worse. non-negotiable.

5. **skip hot water** — use lukewarm, keeps the barrier from getting angrier.

the peeling should calm down within 3–5 days once you space out the tret. if it stays angry or spreads, pause tret entirely for a week and just repair. you're not failing, this is just the adjustment phase. most people push through and make it worse.

what cleanser and moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=8.67s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1111
  - [PASS] latency_lt: 8.7s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


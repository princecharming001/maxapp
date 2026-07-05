# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're still in the adjustment phase. tretinoin at 0.025% is a lower starting dose, so you've got room to titrate up. key moves right now:
1. **keep it on dry skin, pea-sized.** apply to completely dry face (wait 20 min post-cleanse), use a pea-sized amount. this reduces irritation and improves penetration.
2. **barrier support is non-negotiable.** use ceramides + panthenol after tret to rebuild. skip exfoliating acids (BHA/AHA) for the first 1–2 weeks.

3. **SPF every day.** tretinoin makes skin photosensitive. UV exposure will undo your progress and darken any existing pigmentation.

4. **expect 4–8 weeks before real texture/pigment change.** you're still in the irritation window. by week 4–6 you'll see turnover kick in. what's your skin type and are you seeing any flaking or redness yet.
- products: 1 item(s)
- status=200 latency=10.94s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=815

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start every other night for the first 4–6 weeks, then move to nightly if toleration is good.

at 0.025% you could probably handle nightly sooner, but every-other-night lets your skin adapt without unnecessary irritation. once you're past week 6 with minimal redness/flaking, shift to nightly. if you're already seeing heavy peeling or persistent redness, stay eon longer.

what does your skin look like right now — any flaking or irritation.
- status=200 latency=7.57s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=441

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** sounds like your barrier's compromised. that happens fast on tretinoin, especially early on. here's what to do right now:

1. **strip the routine back** — stop everything except a gentle cleanser, a heavy moisturizer, and spf during the day. no actives, no exfoliation, no vitamin c, nothing. let the skin recover.

2. **moisturize heavily at night** — apply moisturizer to damp skin right after cleansing to lock in water. something occlusive (a bit of oil or a richer cream) on top helps.

3. **dial back the tretinoin** — you're two weeks in at 0.025%, which is already low, but if peeling and redness are intense, skip a night or two. you can go back to it once the barrier settles. slow and steady wins here.

4. **avoid heat and irritants** — no hot showers, no fragrance, no acids or vitamin c. even "gentle" exfoliants will make this worse.

the peeling should calm down in 3-5 days once you back off. redness takes a bit longer, but it'll fade. the goal is barrier repair first, results second. tretinoin works best when your skin isn't angry.

what moisturizer are you using right now?
- products: 1 item(s)
- status=200 latency=10.07s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1095
  - [PASS] latency_lt: 10.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** you're two weeks in, so you're still in the irritation/adjustment window. here's what matters right now: **keep the dose low and frequency slow.** the protocol starts at 0.025% (which is what you're on) and gradually increases—don't rush it. your skin is still learning to tolerate it. **barrier support is non-negotiable.** ceramides + panthenol every night after tret, and skip any exfoliating acids (BHA/AHA) for the first 1–2 weeks. if you're getting red, tight, or flaky, that's normal, but it means dial back frequency (maybe every other night instead of nightly) until it settles. **SPF every day, no exceptions.** UV will undo everything tret is doing and darken any existing pigmentation. non-negotiable. what's your skin doing right now,flaking, redness, or holding up okay?
- products: 1 item(s)
- status=200 latency=11.7s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=784

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start every other night for the first 4–6 weeks. you're only two weeks in, so your skin hasn't fully adapted yet. going nightly this early almost always triggers excessive peeling, redness, and irritation that makes people bail on tret entirely.

once you hit week 4–6 and your skin is handling it without major flaking or sensitivity, move to nightly. then after 8–12 weeks at nightly 0.025%, you can ask your derm about bumping to 0.05%.

the slow ramp works better than jumping in hard. stick with every other night.
- status=200 latency=6.43s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=519

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** grab the cerave pm moisturizer or the tub version if your skin is really dry. both have ceramides and niacinamide, which calm redness and repair the barrier.

once you're stable (3–5 days), azelaic acid is solid for lingering redness and helps prevent it from coming back.
- products: 4 item(s)
- status=200 latency=11.46s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=272
  - [PASS] latency_lt: 11.5s (ceiling 45s)
  - [FAIL] includes_any: none of ['tretinoin', 'retinoid', 'purge', 'adjust'] found
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


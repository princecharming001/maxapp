# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** good move. tretinoin is the real driver here, so let's make sure you're using it right so it actually works and doesn't wreck your barrier. **start low and go slow.** apply 0.05% on completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3x per week for the first 2–3 weeks. your skin will purge and get irritated if you jump in too fast. once you're tolerating it, gradually increase frequency toward nightly use over 4–6 weeks. **the non-negotiables:** apply only to dry skin, never mix with actives the same night (no BHA, AHA, vitamin c, azelaic on tretinoin nights), and use a solid moisturizer + SPF 30+ daily. tretinoin thins the stratum corneum temporarily, so barrier support is not optional. if you get peeling, redness, or stinging, drop back to 1–2x per week and rebuild from there. what's your current AM/PM routine look like. do you have a moisturizer and sunscreen locked in.
- products: 2 item(s)
- status=200 latency=9.98s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=905

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin, so yes, it's safe to continue. since your derm prescribed it, you're past the "should i start" question. the key is you're on the right molecule. tretinoin is the gold standard for acne and collagen, so stick with what your derm set up. don't layer other retinoids on top of it. make sure you're applying it on completely dry skin (wait 20 min after cleansing), pea-sized amount, and start low frequency if you haven't already. if you're getting irritation or peeling, that's normal early on, but dial back frequency rather than stopping. what's your current routine look like. are you using it nightly or a few times a week.
- status=200 latency=10.2s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=654
  - [PASS] latency_lt: 10.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']


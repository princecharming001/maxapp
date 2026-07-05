# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** congrats on getting on tretinoin. that's the right move for acne. here's how to run it without torching your skin. **start low, go slow.** begin at 0.05% tretinoin, pea-sized amount on completely dry skin. wait 20 minutes after cleansing before applying, so your skin is bone dry. this cuts irritation hard. gradually increase frequency over 4-6 weeks (start 2-3x per week, then move to 4-5x, then daily if tolerated). **barrier support is non-negotiable.** tretinoin thins the skin barrier short-term. use a heavy moisturizer after it sets (CeraVe moisturizing cream or cetaphil rich hydrating cream). skip other actives (BHA, AHA, vitamin c) for the first 4-6 weeks. once you're stable, you can layer azelaic acid on tretinoin nights if you have post-acne marks, but not before. **sun protection every single day.** tretinoin makes you photosensitive. SPF 30+ minimum, reapply if you're outside. no exceptions. expect 2-4 weeks of mild flaking and redness. that's normal. if you get severe burning, peeling, or persistent irritation after week 3, dial back frequency or drop to 0.025% for a bit. acne usually clears in 8-12 weeks once you're at a stable dose. what's your current skin type (oily, dry, combo) and do you have any post-acne marks or just active breakouts.
- products: 3 item(s)
- status=200 latency=10.62s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1272

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the key is you're not adding a second retinoid on top of it. if you mean layering tretinoin with other actives: hold off on mixing it with azelaic, BHA, or vitamin c in the same routine until your skin adapts. tretinoin alone is enough to drive collagen and clear acne. once you're a few weeks in and your barrier is stable, you can add a calming layer like centella before moisturizer if you get irritation. what's your current PM routine looking like. are you cleansing before the tretinoin.
- products: 2 item(s)
- status=200 latency=8.47s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=576
  - [PASS] latency_lt: 8.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


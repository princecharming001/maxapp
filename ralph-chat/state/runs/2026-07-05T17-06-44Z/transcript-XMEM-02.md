# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** good move. tretinoin is the heavy hitter for acne, it'll clear it and rebuild texture at the same time. here's how to run it: start 0.05% on completely dry skin, pea-sized amount, and go slow on frequency—your derm probably told you this, but most people jump in too fast and wreck their barrier. apply it 2-3x per week for the first 2-3 weeks, then gradually bump up as your skin tolerates it. the goal is controlled irritation, not nuclear damage. key things: apply to bone-dry skin (wait 20 min after cleansing), never mix it with other actives the same night, and use a solid moisturizer after. tretinoin works by creating micro-injury that forces your skin to rebuild collagen and turn over faster, so you'll see texture smooth out and acne fade as inflammation drops. expect some peeling and mild redness for the first 4-6 weeks. that's normal. if you get severe irritation, dial back frequency, don't quit. and sunscreen every single day,tretinoin makes you photosensitive. what strength did your derm prescribe, and how often are they having you start?
- products: 1 item(s)
- status=200 latency=9.9s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1060

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin from your derm, so yes, it's safe to continue. since you're 17 and on an active acne protocol, retinoids are the right move. the key is you're not adding a second retinoid. stick with what your dermatologist prescribed. if you meant layering other actives around it, that depends on what else you're using and how your skin is responding. what's your current AM/PM routine look like.
- products: 1 item(s)
- status=200 latency=6.88s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=411
  - [PASS] latency_lt: 6.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


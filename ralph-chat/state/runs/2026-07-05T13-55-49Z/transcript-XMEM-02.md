# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the inflammation cycle. here's how to run it without torching your skin:
1. **start low, go slow.** begin at 0.05%, pea-sized amount, apply to completely dry skin (wait 20 min after cleansing). increase frequency gradually—don't jump to nightly in week
2. 2. **barrier first.** tretinoin thins the skin barrier at first. use a solid moisturizer after it dries (CeraVe or cetaphil work). skip other actives (BHA, AHA, vitamin c) for the first 4–6 weeks while your skin adapts.

3. **SPF non-negotiable.** tretinoin makes you photosensitive. daily SPF 30+ is not optional.
4. **expect a purge.** acne often gets worse before it clears (usually weeks 2–4). that's normal. don't bail. what's your current routine look like. do you have a cleanser and moisturizer locked in.
- products: 1 item(s)
- status=200 latency=8.92s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=901

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin, so yes, it's safe to continue. since your derm prescribed it, you're past the "should i start" question. the key is you're on the right molecule. tretinoin goes PM only, on clean dry skin, pea-sized amount. start low frequency (2-3x/week if you haven't already) and increase gradually as your skin tolerates it. watch for irritation signs (persistent redness, burning, peeling beyond normal). if that happens, dial back frequency or dose and let your barrier stabilize before pushing again. otherwise you're good to keep going.
- status=200 latency=6.41s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=556
  - [PASS] latency_lt: 6.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']


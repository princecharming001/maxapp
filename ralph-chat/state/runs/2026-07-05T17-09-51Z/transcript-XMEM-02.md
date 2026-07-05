# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** cool, tretinoin is the heavy hitter for acne. here's how to run it without torching your skin. **start low and go slow.** apply 0.05% tretinoin to completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3x per week for the first 2–4 weeks. your skin will purge and flake. that's normal. gradually increase frequency as tolerance builds. **timing matters.** never layer it with other actives (BHA, AHA, vitamin c, azelaic acid) on the same night. space them out or use them on off-nights. tretinoin does the work; other stuff just irritates. **support your barrier.** use a simple moisturizer after tretinoin dries down (CeraVe, cetaphil, or similar). SPF 30+ every morning, no exceptions. tretinoin makes you photosensitive and acne scars are permanent. **expect a timeline.** purging peaks around week 2–3, then clears. real improvement (texture, fewer active lesions) shows around week 6–8. don't bail early. what's your current AM/PM routine look like. need to know what else you're using so we don't stack irritants.
- products: 2 item(s)
- status=200 latency=10.19s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1035

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the key is you're not adding a second retinoid on top of it. if your skin tolerates the tretinoin well (no excessive peeling, irritation, or barrier damage), you're good. if you're experiencing redness, sensitivity, or flaking, dial back frequency or concentration before layering anything else. what's your current tretinoin schedule (how many nights per week) and how's your skin responding so far.
- products: 1 item(s)
- status=200 latency=10.19s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=483
  - [PASS] latency_lt: 10.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne, not just texture. here's how to run it without torching your skin. **start low, go slow.** apply 0.05% on completely dry skin, pea-sized amount, 2–3x per week for the first 2 weeks. your skin needs to adapt. once you're not red or peeling, bump frequency by one night per week until you hit daily or 5x/week, depending on tolerance. **application matters.** wait 20 minutes after cleansing so your skin is fully dry. moisture traps tretinoin and cranks irritation. apply to face, neck, and chest if acne is there. avoid eyes and mouth. **expect a purge.** first 4–6 weeks you'll likely get worse before better. that's normal. tretinoin accelerates cell turnover, so congestion comes to the surface faster. don't bail. **protect the barrier.** use a gentle moisturizer after tretinoin (wait 5 min), and SPF 30+ every morning without fail. pigmentation is downstream of inflammation, so sun exposure will undo your progress and darken any post-acne marks. **skip other actives.** no BHA, AHA, vitamin c, or azelaic on tretinoin nights. once you're stable (week 6+), you can layer azelaic in the morning if you have hyperpigmentation, but not at the start. what's your current routine look like. any other actives or products you're using.
- products: 2 item(s)
- status=200 latency=10.85s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1285

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the key is you're not adding a second retinoid on top of it. if your skin tolerates the tretinoin well (no excessive peeling, redness, or barrier damage), you're good. if you're experiencing irritation, dial back frequency or dose before layering anything else. what's your current tretinoin schedule (how many nights per week, what %)?
- products: 1 item(s)
- status=200 latency=6.15s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=419
  - [PASS] latency_lt: 6.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


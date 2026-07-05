# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the inflammation cycle. here's how to run it without torching your skin:
1. **start low, go slow.** begin at 0.05% on completely dry skin, pea-sized amount. apply 2-3x per week for the first 2 weeks, then gradually increase frequency as your skin adapts. most people can hit daily by week 4-6, but don't rush it.
2. **dry skin first.** wait 20 minutes after cleansing before applying. wet skin increases penetration and irritation risk.

3. **never layer actives on tretinoin nights.** no BHA, AHA, vitamin c, or azelaic acid the same evening. tretinoin does the work; other stuff just adds friction.
4. **expect a purge.** first 2-4 weeks your acne might get worse before it clears. that's normal. don't bail.

5. **SPF every morning, no exceptions.** tretinoin makes skin photosensitive. UV exposure kills your progress and causes pigmentation issues. what strength did your derm prescribe, and how often did they tell you to use it initially.
- products: 2 item(s)
- status=200 latency=9.82s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1077

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the key is you're not adding a second retinoid on top of it. if your skin tolerates the tretinoin well (no excessive peeling, redness, or irritation), you're good. if you're experiencing barrier damage or persistent irritation, dial back frequency first before layering anything else. what's your current tretinoin schedule (how many nights per week) and how's your skin responding so far.
- products: 1 item(s)
- status=200 latency=6.61s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=472
  - [PASS] latency_lt: 6.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


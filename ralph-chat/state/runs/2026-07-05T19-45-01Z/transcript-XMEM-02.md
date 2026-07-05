# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the inflammatory cascade that feeds breakouts. here's how to run it without torching your skin:
1. **start low, go slow.** 0.05% on completely dry skin, pea-sized amount, 2–3× per week for the first 2–3 weeks. let your barrier adapt before you ramp frequency.
2. **always apply to dry skin.** wait 20 mins after cleansing. wet skin increases penetration and irritation risk.

3. **sandwich method if you're sensitive.** cleanser → lightweight moisturizer → tretinoin → another layer of moisturizer. slows absorption, cuts irritation, keeps efficacy solid.
4. **avoid stacking actives.** no BHA, AHA, vitamin c, or azelaic on tretinoin nights. those are for off-nights only.

5. **SPF every morning, no exceptions.** tretinoin makes skin photosensitive. UV exposure tanks results and causes pigmentation issues. expect 4–8 weeks before you see real texture and acne improvement. initial dryness and mild flaking is normal. if you get severe redness or peeling after 2 weeks, dial back frequency, don't quit. what's your current skin type and are you dealing with active acne, scarring, or both.
- products: 2 item(s)
- status=200 latency=10.52s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1225

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the key is you're not adding a second retinoid on top of it. if your skin tolerates the tretinoin well (no excessive peeling, redness, or irritation), you're good to keep going as prescribed. if you're experiencing irritation, dial back frequency or dose before adding anything else. what's your current tretinoin schedule looking like. how often are you using it and what's the concentration.
- products: 1 item(s)
- status=200 latency=7.59s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=476
  - [PASS] latency_lt: 7.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


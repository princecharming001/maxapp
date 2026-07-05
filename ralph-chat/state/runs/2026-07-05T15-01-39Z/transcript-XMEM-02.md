# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne, not just texture—it kills inflammation at the source by normalizing cell turnover and reducing sebum. here's how to run it without torching your skin:
1. **start low, go slow.** apply 0.05% on completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3× per week for the first 2 weeks. your skin will purge,that's normal, means it's working. don't panic and jump off.
2. **dry skin first.** this matters. wet skin increases penetration and irritation. pat dry, wait, then apply.

3. **gradually increase frequency** as your skin adapts. most people land on 4–5× per week after 4–6 weeks.
4. **never mix with other actives the same night.** no BHA, AHA, vitamin c, or azelaic on tretinoin nights. space them out (e.g., tret mon/wed/fri, BHA tue/thu).

5. **SPF every single day.** tretinoin makes you photosensitive. UV exposure will tank your results and cause the exact pigmentation issues you're trying to fix. expect 6–8 weeks before acne noticeably clears. the first 2–3 weeks will feel rough (dryness, flaking, possible purge). that's the protocol working. what's your current AM/PM routine look like. need to know if you're using anything that'll conflict.
- products: 2 item(s)
- status=200 latency=10.84s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1224

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin from your derm, so yes, it's safe to keep using it as prescribed. the key is you're not adding a second retinoid on top. if you meant adding something else to your routine alongside tretinoin, that depends on your skin type and current state. since you're on tretinoin for acne, you're in the "oily/acne-prone" category, which means retinoid PM is the core move. pair it with a gentle cleanser AM and PM, and keep other actives minimal while your skin adapts to tretinoin. what's your skin doing right now on tretinoin. any irritation, dryness, or flaking.
- products: 1 item(s)
- status=200 latency=7.5s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=584
  - [PASS] latency_lt: 7.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']


# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real driver here, so the protocol matters more than anything else. **application**: start 0.05% on completely dry skin, pea-sized amount, gradually increase frequency as your skin tolerates it. apply to clean, fully dry face before moisturizer. most people jump frequency too fast and wreck their barrier, so go slow. **what it does**: stimulates fibroblasts, increases cell turnover, improves texture and pigmentation. acne clears because you're shedding congested cells faster and rebuilding collagen underneath. **avoid stacking**: don't use strong exfoliants (BHA, AHA, vitamin c) on tretinoin nights. if you're dermastamping, keep it to 0.25mm, 2× per week, never the same night as tretinoin. over-exfoliation tanks your barrier and makes tretinoin irritation way worse. expect some dryness and peeling the first 4-6 weeks. that's normal. if you're getting raw irritation or burning, dial back frequency and make sure you're using a solid moisturizer after it dries. what's your current routine look like. are you on anything else for acne or just tretinoin.
- products: 1 item(s)
- status=200 latency=9.77s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1092

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin from your derm, so yes, it's safe to keep using it. the question is whether you're layering anything else with it that could cause irritation. since you're on tretinoin, avoid stacking other actives (BHA, AHA, vitamin c) in the same routine until your skin fully adapts. retinoid overuse and over-layering are common irritation triggers. apply tretinoin on dry skin, pea-sized amount, and let your barrier stabilize first. what's your current PM routine look like. are you using anything else with the tretinoin right now.
- products: 1 item(s)
- status=200 latency=6.42s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=550
  - [PASS] latency_lt: 6.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']


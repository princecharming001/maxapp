# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid. tretinoin is the heavy hitter for acne. here's how to run it without torching your skin. **start low, go slow.** begin at 0.05% on dry skin, pea-sized amount. apply to completely dry face (wait 20 min after cleansing), then gradually increase frequency as your skin adapts. most people start 2–3x per week, then move to daily over 4–8 weeks. **timing matters.** never layer actives on tretinoin nights. skip BHA, AHA, vitamin c, azelaic acid on the same evening. your barrier is already working hard. on off-nights, you can use those to address specific issues (azelaic for post-acne marks, BHA for congestion), but not concurrently. **support the barrier.** tretinoin creates controlled micro-injury to stimulate collagen and cell turnover. that's the point, but it means you need a solid moisturizer and SPF 30+ daily. barrier damage = more inflammation = worse acne rebound. **expect a purge.** first 2–4 weeks you might see more breakouts as dead skin and congestion surface. that's normal. don't panic and don't jump to other treatments. stick with it. what's your current skin type and are you already on any other actives (BHA, vitamin c, azelaic)?
- products: 2 item(s)
- status=200 latency=9.58s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1162

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin, so yes, it's safe to continue. you're past the "should i add it" stage. the key is your current skin state. since you just started tretinoin, don't layer other actives (BHA, AHA, vitamin c) on top right now. let your skin adapt to the retinoid first, usually 4-6 weeks, before stacking anything else. if your skin is clear and stable after that window, you can add azelaic acid 2-3x/week in the AM to support acne control. but don't rush it. tretinoin alone handles most of the heavy lifting for acne and texture.
- products: 2 item(s)
- status=200 latency=6.53s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=542
  - [PASS] latency_lt: 6.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


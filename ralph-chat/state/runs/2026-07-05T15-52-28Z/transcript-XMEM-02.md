# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real driver here—it'll increase cell turnover and hit both the acne and any texture/scarring that comes after. here's how to run it without torching your skin:
1. **start low and go slow.** apply 0.05% on completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3× per week for the first 2–3 weeks. your skin needs time to adapt. irritation kills compliance.
2. **always apply to dry skin.** water on your face when you apply tretinoin increases penetration and irritation. cleanse, wait, then apply.

3. **gradually increase frequency.** once your skin tolerates it, move to 4–5× per week, then daily over 4–6 weeks. don't rush this.
4. **never stack with other actives the same night.** no BHA, AHA, vitamin c, or azelaic acid on tretinoin nights. your barrier can't handle it.

5. **moisturize after.** wait 5–10 min, then apply a solid moisturizer (CeraVe PM, cetaphil, or similar). tretinoin dries you out.
6. **SPF every morning, no exceptions.** tretinoin makes you photosensitive.

UV exposure will worsen any post-acne marks and undo your progress. expect some dryness and mild peeling in weeks 1–3. that's normal. if you get raw irritation or severe redness, dial back frequency. acne usually starts clearing around week 4–6. what's your current AM/PM routine look like. want me to slot tretinoin in properly.
- products: 2 item(s)
- status=200 latency=10.67s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1362

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your derm, so yes, it's safe to keep using it. the question is whether you're layering anything else that'll cause irritation. since you're on tretinoin, avoid stacking other actives (BHA, AHA, vitamin c) in the same routine until your skin fully adapts. tretinoin does the heavy lifting. retinoid overuse and over-layering are common mistakes that wreck the barrier, especially early on. what's your current PM routine look like. are you using anything else with it.
- products: 1 item(s)
- status=200 latency=7.02s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=499
  - [PASS] latency_lt: 7.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']


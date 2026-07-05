# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the core driver for acne because it increases cell turnover, unclogs pores, and kills the inflammation cycle at the source. here's how to run it without torching your skin:
1. **start 0.05%, dry skin only.** apply a pea-sized amount to completely dry skin (wait 20 min after cleansing). this minimizes irritation.
2. **ramp frequency slowly.** begin 2–3× per week, then move to every other night, then nightly over 4–6 weeks. your skin will tell you when it's ready.

3. **never layer actives on tretinoin nights.** skip BHA, AHA, vitamin c, azelaic acid on the same evening. tretinoin does the work; stacking causes barrier damage and peeling that looks worse before it gets better.
4. **SPF is non-negotiable.** tretinoin increases sun sensitivity. daily SPF 30+ or you'll undo the acne fix with PIH (post-inflammatory hyperpigmentation). expect 4–8 weeks before you see real clearing. the first 2–3 weeks will likely get worse (retinization phase). that's normal. stick with it. what's your current AM/PM routine look like. need to know if you're using anything that'll conflict.
- products: 2 item(s)
- status=200 latency=9.29s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1107

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the question is how you're layering it. tretinoin is the gold standard for collagen activation and acne. since you're on it, make sure you're applying it on completely dry skin with a pea-sized amount, and don't layer other actives (like azelaic or BHA) on the same night until your skin adapts. if your skin shows signs of irritation (persistent redness, sensitivity, barrier damage), dial back frequency and let it stabilize before adding anything else. what does your current PM routine look like. are you using anything else with the tretinoin right now.
- products: 1 item(s)
- status=200 latency=7.86s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=641
  - [PASS] latency_lt: 7.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']


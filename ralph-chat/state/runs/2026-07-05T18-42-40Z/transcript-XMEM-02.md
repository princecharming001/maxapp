# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the inflammatory cascade that feeds breakouts. here's how to run it without torching your skin:
1. **start low, go slow.** begin at 0.05% on completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3x per week. gradually increase frequency over 4–6 weeks as your skin adapts.
2. **always apply to dry skin.** moisture traps tretinoin and increases irritation. let your face fully dry before application.

3. **sandwich method if you're irritated early.** cleanser → light moisturizer → tretinoin → another layer of moisturizer. reduces irritation without killing efficacy.
4. **skip other actives on tretinoin nights.** no BHA, AHA, vitamin c, or azelaic acid the same evening. tretinoin does the work; stacking causes barrier damage.

5. **SPF every morning, no exceptions.** tretinoin increases photosensitivity. UV exposure will undo your progress and cause hyperpigmentation. expect 6–8 weeks before you see real improvement. you'll likely purge (more breakouts) in weeks 2–4 as dead skin and clogged pores surface. that's normal, not a sign it's failing. what's your current skin type and any sensitivities i should know about.
- products: 2 item(s)
- status=200 latency=9.55s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1278

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the key is you're not adding a second retinoid on top of it. if your skin tolerates the tretinoin well (no excessive peeling, irritation, or barrier damage), you're good. if you're dealing with active irritation or redness right now, dial back frequency or concentration until your skin stabilizes, then build back up. what's your current tretinoin schedule (how many nights per week, what %)?
- products: 1 item(s)
- status=200 latency=10.85s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=476
  - [PASS] latency_lt: 10.8s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


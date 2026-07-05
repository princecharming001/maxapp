# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the inflammatory cascade that feeds breakouts. here's how to run it without torching your skin:
1. **start low, go slow.** begin at 0.05%, pea-sized amount, apply to completely dry skin (wait 20 min after cleansing). your derm probably said this, but it matters. gradually increase frequency over weeks, not days.
2. **never skip the barrier.** tretinoin thins the skin temporarily. use a solid moisturizer after it dries (CeraVe or cetaphil work). this keeps irritation down and actually speeds results because your skin isn't in defense mode.

3. **SPF every single day.** tretinoin makes you photosensitive. UV exposure tanks your results and ages you faster. non-negotiable.

4. **avoid stacking actives.** no BHA, AHA, or vitamin c on tretinoin nights. wait at least 3 days between them if you use them at all. over-exfoliation kills the barrier and kills progress.
5. **expect a purge.** first 2–4 weeks, acne might get worse as dead skin and clogged pores surface. this is normal. stick with it. what's your current routine look like. are you using anything else for acne right now.
- products: 1 item(s)
- status=200 latency=10.08s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1221

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin from your derm, so yes, it's safe to keep using it as prescribed. the key is you're not adding a second retinoid on top. if your skin tolerates the tretinoin well (no excessive peeling, redness, or irritation), you're good. if you're still in the adjustment phase (first 4-8 weeks), hold off layering other actives like azelaic or vitamin c until your barrier settles. what's your current tretinoin frequency and how's your skin responding so far.
- products: 2 item(s)
- status=200 latency=6.35s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=475
  - [PASS] latency_lt: 6.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


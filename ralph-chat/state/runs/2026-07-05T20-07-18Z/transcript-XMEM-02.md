# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the core driver here, so nail the application and titration or you'll either stall or irritate yourself into stopping. **start with 0.05%, pea-sized amount on completely dry skin**. apply it 2–3x per week for the first 2 weeks, then gradually bump frequency as your skin tolerates it. the "dry skin" part matters: apply to damp skin and it penetrates too deep, causes unnecessary irritation. expect some peeling and mild redness in weeks 1–3. that's the retinoid doing its job, not a sign to stop. if you get raw or burning, dial back to once weekly for a week, then resume the climb. avoid mixing tretinoin with other actives (BHA, AHA, vitamin c, azelaic) on the same night. if you're using any of those, use them on off-nights or in the AM while tretinoin is PM-only. what's your current acne situation like. active breakouts, scarring, or mostly texture.
- products: 2 item(s)
- status=200 latency=9.55s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=883

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin from your derm, so yes, it's safe to keep using it as prescribed. the key is you're not adding a second retinoid on top. if your skin tolerates the tretinoin well (no excessive peeling, irritation, or barrier damage), you're good. if you're experiencing redness, sensitivity, or flaking, dial back frequency or dose before layering anything else on top. what's your current tretinoin schedule and how's your skin responding so far.
- products: 1 item(s)
- status=200 latency=6.71s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=459
  - [PASS] latency_lt: 6.7s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


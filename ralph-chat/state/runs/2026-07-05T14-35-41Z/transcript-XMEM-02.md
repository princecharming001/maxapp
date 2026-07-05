# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid. tretinoin is the heavy hitter for acne. here's how to run it without torching your skin. **start low, go slow.** begin at 0.05% on dry skin, pea-sized amount. apply 2-3x per week for the first 2 weeks, then gradually bump frequency as your skin adapts. most people can hit daily after 4-6 weeks, but don't rush it. **application order matters.** cleanse, wait for skin to fully dry (this is non-negotiable—tretinoin on damp skin causes irritation), then apply. follow with a plain moisturizer. no actives the same night (no BHA, AHA, vitamin c, azelaic). tretinoin does the work; everything else gets in the way. **expect a purge.** first 2-4 weeks your acne might get worse before it clears. that's normal. stick with it. **barrier support is mandatory.** use a gentle cleanser, a solid moisturizer (CeraVe, cetaphil), and SPF 30+ daily. tretinoin makes skin photosensitive and thins the barrier temporarily. sun exposure will undo your progress and cause pigmentation. what's your current routine look like. are you on anything else for acne, or is tretinoin solo.
- products: 2 item(s)
- status=200 latency=11.21s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1073

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin, so yeah, it's safe to keep going. the key is you're past the "should i add it" phase. since your derm put you on it, stick with the protocol: pea-sized amount on dry skin, start low frequency and increase gradually as your skin adapts. tretinoin is the gold standard for collagen production and texture, so you're in the right place. only thing to watch: if you have any signs of rosacea (persistent redness, flushing, reactive bumps), dial back frequency and let your barrier stabilize before pushing the dose. but if your skin is handling it fine, keep the routine consistent.
- status=200 latency=6.48s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=607
  - [PASS] latency_lt: 6.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


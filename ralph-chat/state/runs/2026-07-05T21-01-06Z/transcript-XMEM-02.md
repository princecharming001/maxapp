# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** cool, tretinoin is the heavy hitter for acne. here's how to run it without torching your skin. **start low and go slow.** apply 0.05% tretinoin to completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3x per week for the first 2–4 weeks. your skin will purge and flake. that's normal. gradually increase frequency as tolerance builds. **timing matters.** never layer it with other actives (BHA, AHA, vitamin c, azelaic acid) on the same night. space them out or pick one per evening. tretinoin does the work; everything else is support. **barrier support is non-negotiable.** use a gentle cleanser, then a solid moisturizer (CeraVe, cetaphil) after tretinoin dries down. your skin will be more permeable and reactive for the first month. **sun protection every single day.** tretinoin makes you photosensitive. SPF 30+ minimum, reapply if you're outside. skip this and you'll get hyperpigmentation instead of clear skin. what's your current acne like—active pustules, cystic, or mostly post-inflammatory marks?
- products: 2 item(s)
- status=200 latency=9.47s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1027

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to keep using it as prescribed. the question is whether you're adding another retinoid on top, which i'd skip—one retinoid is the standard, stacking them just increases irritation risk without extra benefit. if your derm put you on it for acne, stick with that protocol. apply it PM on dry skin, pea-sized amount, and don't layer other actives (like azelaic or acids) on the same night until your skin adapts. what's your current routine look like,are you already using it, or just starting?
- products: 2 item(s)
- status=200 latency=8.48s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=561
  - [PASS] latency_lt: 8.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', 'tretinoin']
- needs_judge: ['uses_user_context']


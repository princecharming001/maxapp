# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the inflammation cycle that keeps acne going. here's how to run it without torching your skin:
1. **start low and go slow.** begin at 0.05%, pea-sized amount, apply to completely dry skin (wait 20 min after cleansing). increase frequency gradually over weeks, not days. your skin needs time to adapt.
2. **never stack retinoids with other actives on the same night.** no BHA, AHA, vitamin c, or dermastamping the same evening. tretinoin does the heavy lifting; other stuff just irritates.

3. **barrier support is non-negotiable.** tretinoin thins the skin initially. use a solid moisturizer after it dries down. skip any harsh cleansers or over-exfoliation while you're adjusting.
4. **SPF every single day.** tretinoin makes skin photosensitive.

UV exposure will undo your progress and darken any post-acne marks. expect 4–8 weeks before you see real texture and clarity changes. acne usually clears faster, but be patient with the adjustment phase. what's your current routine look like.
- products: 1 item(s)
- status=200 latency=9.6s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1123

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** depends on your skin type. if you're oily or acne-prone, retinoids fit right in. if you have rosacea or chronic inflammation, hold off until the redness and reactivity calm down first, then introduce it slowly. what's your skin like right now. any persistent redness, sensitivity, or active breakouts.
- status=200 latency=6.52s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=301
  - [PASS] latency_lt: 6.5s (ceiling 45s)
  - [FAIL] includes_any: none of ['already', "you're on", 'you are on', 'tretinoin'] found
- needs_judge: ['uses_user_context']


# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. before you jump to actives, check if your barrier is intact. **signs your barrier is compromised**: persistent redness, stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if any of those sound like you, pause exfoliating acids, retinoids, and vitamin c. instead, repair first with ceramides and panthenol, then introduce actives once irritation drops. if your barrier is fine and you're just breaking out, the inflammation is likely driven by internal triggers: gut imbalance, insulin spikes (which spike IGF-1 and oil production), stress, or dietary stuff like sugar, seed oils, or dairy. external causes are over-exfoliation, harsh products, or UV exposure. what does your skin feel like right now. is it red, tight, or stinging when you use products. or is the barrier okay and you're just getting active breakouts.
- status=200 latency=10.04s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=943

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you've got an oily/acne-prone routine ahead. the core is azelaic AM and retinoid PM. barrier integrity matters first though—if you're still stinging or red from products, dial back actives until that settles. here's the structure:
1. **cleanser (AM + PM)**, removes oil and buildup so actives actually work. daily, consistent but not aggressive washing.
2. **azelaic acid (AM)**, anti-inflammatory and targets acne directly. apply after cleanse on damp skin.

3. **treatment serum (AM)**, centella or panthenol to support skin after the active.
4. **hydrating serum (AM)**, hyaluronic acid or peptides to pull water in.

5. **moisturizer (AM + PM)**, ceramides + lipids lock in hydration and repair barrier.
6. **SPF (AM only)**, blocks UV and prevents post-acne marks from darkening.

7. **retinoid (PM only)**, collagen stimulation and cell turnover. start low frequency (2–3x/week) if your barrier is still compromised, ramp up as tolerance builds. the order matters: cleanse → azelaic → treatment → hydrating serum → moisturizer → SPF (AM). PM is the same minus SPF, plus retinoid at the end. what's your current cleanser and do you know if your barrier is intact right now, or are you still getting stinging/redness.
- products: 2 item(s)
- status=200 latency=8.81s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1274
  - [PASS] latency_lt: 8.8s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


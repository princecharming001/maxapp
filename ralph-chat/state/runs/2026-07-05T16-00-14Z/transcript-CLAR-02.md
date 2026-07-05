# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. before you jump to actives, check if your barrier is intact. **signs your barrier is compromised**: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if any of those sound like you, pause exfoliating acids and retinoids for now. **repair first**: use ceramides (the lipids your skin naturally has) + panthenol (hydrator + anti-inflammatory). this calms inflammation and stops the acne → harsh treatment → more acne cycle. once redness and irritation drop, then introduce actives like adapalene or azelaic acid. what does your skin feel like right now. tight, burning, or pretty normal aside from the breakouts.
- products: 1 item(s)
- status=200 latency=8.82s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=764

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the routine:
1. **cleanse daily**, morning and night. use a gentle cleanser, not stripping.
2. **AM: azelaic acid**. azelaic kills the inflammation loop that drives acne and post-acne marks at the same time.

3. **PM: retinoid**. retinoid normalizes cell turnover so pores don't clog in the first place. start low (adapalene 0.1%) and go slow if your barrier is still raw.
4. **layer in order**: cleanser → active (azelaic AM, retinoid PM) → treatment serum (centella or panthenol PM to calm) → hydrating serum → moisturizer → SPF (AM only).

5. **don't over-wash**. consistent but not aggressive. twice daily is enough; more strips your barrier and triggers more oil. the key: acne is inflammation-driven, not just bacteria. azelaic + retinoid + a solid barrier repair (hydrating serum + moisturizer) will flatten breakouts faster than spot treatments ever will.
- products: 2 item(s)
- status=200 latency=8.6s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=947
  - [PASS] latency_lt: 8.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation first, not a product problem. before you jump to actives, check if your barrier is already compromised. signs your barrier is shot: persistent redness, stinging when you apply anything, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you see those, treating acne with acids or retinoids will make it worse. the fix: repair first, then treat. use ceramides and panthenol to lock the barrier back in, pause exfoliating acids and retinoids for now. once redness drops and products stop stinging, you can layer in actives that actually work. what does your skin feel like right now. tight, irritated, or relatively calm under the breakouts.
- status=200 latency=8.15s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=706

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne is your main concern, you're oily/acne-prone. here's the structure:
1. **AM: cleanse, azelaic, hydrate, SPF.** cleanser removes buildup so actives work. azelaic cuts inflammation and prevents breakouts. hydrating serum + moisturizer keeps your barrier intact (critical when you're using actives). SPF blocks UV, which drives post-acne marks darker.

2. **PM: cleanse, retinoid, hydrate, moisturizer.** retinoid at night fixes texture and turnover. follow the absorption ladder: cleanser → active → treatment serum (centella or panthenol) → hydrating serum → moisturizer.
3. **skip aggressive washing.** one cleanse AM, one PM. over-washing damages your barrier and makes acne worse, not better. the order matters because each layer needs to absorb before the next one hits. don't stack azelaic and retinoid on the same night. barrier health is half the battle here, so don't skip the hydration steps even though you're oily. what's your current cleanser, and are you already using any actives.
- products: 2 item(s)
- status=200 latency=8.18s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1013
  - [PASS] latency_lt: 8.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


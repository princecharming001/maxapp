# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. before you layer in actives like adapalene or benzoyl peroxide, you need to repair your barrier and kill the inflammatory cycle first. here's the move:
1. **repair the barrier** — use a ceramide + panthenol moisturizer (CeraVe PM or similar). ceramides lock in moisture and strengthen the barrier; panthenol soothes irritation and speeds repair. pause any exfoliating acids, retinoids, or vitamin c while you do this, even if you think they're helping. they're likely making inflammation worse.
2. **address internal inflammation**, acne is driven by gut imbalance, insulin spikes (which trigger oil production via IGF-1), stress, and dietary triggers like sugar, seed oils, and dairy. you can't out-skincare a bad diet or high stress.
3. **then introduce actives**, once redness and irritation drop (usually 2-4 weeks), add adapalene or azelaic acid to actually treat the acne. most people skip step 1 and wonder why nothing works. repair first, treat second. what's your current routine look like, and are you seeing persistent redness or stinging when you apply products.
- products: 2 item(s)
- status=200 latency=10.24s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1136

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine that kills inflammation first, then layers in actives. here's the move: **AM:**
1. **cleanse** with a gentle cleanser, daily
2. **azelaic acid** — this is your anti-inflammatory workhorse for acne
3. **moisturizer** with ceramides to repair barrier
4. **SPF**, non-negotiable; UV exposure drives post-acne marks darker **PM:**
5. **cleanse** again, same gentle cleanser
6. **retinoid**, controls turnover and reduces acne over time
7. **moisturizer** with ceramides
8. **occlusive** (optional), cicaplast or light petrolatum if your skin feels tight the order matters: cleanser → active → moisturizer → SPF/occlusive. don't skip the moisturizer even though you're acne-prone; barrier repair stops the inflammatory cycle that feeds breakouts. start with azelaic AM + retinoid PM for 4–6 weeks before adding anything else. if you're still breaking out after that, we can dial in the retinoid strength or add a second active.
- products: 2 item(s)
- status=200 latency=7.91s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=984
  - [PASS] latency_lt: 7.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


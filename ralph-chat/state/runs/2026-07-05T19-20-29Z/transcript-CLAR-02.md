# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. before you layer in actives like adapalene or benzoyl peroxide, you need to stabilize your barrier and kill the inflammatory cycle first. here's the move:
1. **repair the barrier** — use a ceramide + panthenol moisturizer (CeraVe PM or similar). ceramides lock moisture in and strengthen the barrier; panthenol soothes irritation and speeds repair. do this AM and PM for 1–2 weeks before adding anything else.
2. **pause exfoliating actives**, if you're using BHA, AHA, vitamin c, or retinoids right now, pause them. over-exfoliation damages the barrier and kicks off the acne → harsh treatment → more acne cycle.
3. **once barrier feels stable** (no burning, stinging, or flaking), introduce adapalene 0.1% at night, 2–3x per week to start. adapalene is the gold standard for acne without the irritation of tretinoin. the reason most people's acne doesn't improve is they're treating while inflamed and damaged. repair first, then treat. what's your current routine look like.
- products: 1 item(s)
- status=200 latency=10.5s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1039

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine that kills inflammation first, then layers in actives. here's the structure: **AM:**
1. **cleanse** with a gentle cleanser, daily
2. **azelaic acid** — this is your anti-inflammatory workhorse for acne
3. **moisturizer** with ceramides to repair barrier
4. **SPF**, non-negotiable; UV exposure drives post-acne marks darker **PM:**
5. **cleanse** again, same gentle cleanser
6. **retinoid**, controls turnover and reduces acne over time
7. **moisturizer** + optional occlusive (cicaplast) if your skin feels tight key: don't stack azelaic + retinoid on the same night. azelaic goes AM, retinoid goes PM. both are actives and layering them will wreck your barrier when you're already dealing with breakouts. start with this for 6–8 weeks before adding anything else. acne is inflammation-driven, so the routine above addresses that first. once breakouts calm, you can dial in texture or pigmentation work.
- products: 2 item(s)
- status=200 latency=7.95s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=966
  - [PASS] latency_lt: 7.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


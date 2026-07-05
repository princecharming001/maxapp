# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. before you jump to actives, you need to know if your barrier is intact. if it's damaged, treating acne will backfire. **check your barrier first.** do you have persistent redness, burning when you apply products, dryness even after moisturizing, or flaky texture. if yes to any of those, pause exfoliating acids and retinoids and rebuild first with ceramides and panthenol. **if your barrier is fine**, acne is driven by internal inflammation (gut, insulin spikes, stress, dairy/sugar) or external irritation (over-washing, harsh products, UV). the sequence that works is repair → reduce inflammation → introduce actives. what does your skin feel like right now. tight after washing, stinging with basic products, or does it feel okay but just has active breakouts.
- status=200 latency=10.76s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=827

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine built around inflammation control and barrier repair. here's what works for acne-prone skin.
1. **AM cleanse** — wash daily with a gentle cleanser to remove overnight oil buildup without stripping.

2. **AM active, azelaic acid**, apply after cleanse on dry skin. azelaic is anti-inflammatory and targets acne without the irritation of stronger actives.
3. **AM treatment serum**, follow with vitamin c or a hydrating serum to support skin after the active.

4. **AM moisturizer + SPF**, lock in hydration with a barrier-repair moisturizer (ceramides + lipids), then SPF to block UV-driven inflammation and pigmentation.
5. **PM cleanse**, same gentle cleanser, remove the day's oil and sunscreen so actives penetrate.

6. **PM active, retinoid**, apply on dry skin. retinoids reduce inflammation, speed cell turnover, and prevent future breakouts. start low frequency (2–3x per week) if your barrier is compromised; ramp up as tolerance builds.
7. **PM treatment serum**, centella or panthenol after retinoid to calm and repair.

8. **PM moisturizer**, same barrier-repair formula as AM.
9. **PM occlusive (optional)**, if skin feels tight or irritated, seal with cicaplast or light petrolatum. **key rule: one active per routine.** don't mix azelaic + retinoid in the same step. azelaic is AM, retinoid is PM. this prevents over-irritation and lets you track what actually works. start here for 2–3 weeks, then reassess. if breakouts persist, the issue is likely internal (diet, stress, hormones) not just topical.
- products: 2 item(s)
- status=200 latency=11.81s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1578
  - [PASS] latency_lt: 11.8s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


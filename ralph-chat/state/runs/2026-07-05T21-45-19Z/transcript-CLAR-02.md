# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just bacteria. your barrier is probably taking hits from either harsh products, over-exfoliation, or internal triggers (stress, diet, sleep). here's the move: stop any actives (retinoids, BHA, vitamin c) for now and rebuild first. use a gentle cleanser, then layer ceramides + panthenol to lock the barrier back in. once redness and irritation drop (usually 2-3 weeks), you can reintroduce a low-dose retinoid or adapalene to actually address the acne. what's your current routine look like. are you using any actives right now, or is the breakout recent.
- products: 1 item(s)
- status=200 latency=10.22s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=602

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you need a routine built around **controlling inflammation and preventing barrier damage**—not just killing bacteria. for acne-prone skin, the template is straightforward:
1. **AM: cleanse + azelaic + moisturize + SPF** cleanse gently (no scrubbing), apply azelaic acid (calms inflammation and prevents post-acne marks), follow with a lightweight moisturizer, then SPF.
2. **PM: cleanse + retinoid + moisturize** cleanse, apply a retinoid (fixes texture and turnover, reduces acne recurrence), then moisturize to protect your barrier.

3. **key rule: one active per routine** don't stack azelaic + retinoid in the same step. azelaic goes AM, retinoid goes PM only. the order matters. cleanse first so actives actually reach skin, then active, then moisturizer to lock it in. what's your current cleanser and do you have a retinoid already, or do you need product recs.
- products: 2 item(s)
- status=200 latency=7.58s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=921
  - [PASS] latency_lt: 7.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']


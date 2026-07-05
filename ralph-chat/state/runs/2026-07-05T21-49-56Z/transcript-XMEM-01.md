# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're still in the irritation window. here's what matters right now: **keep the dose low and frequency slow.** at 0.025% you're already below the standard start (0.05%), so you have room to go up, but don't rush it. most people jump frequency too fast and wreck their barrier. stick with 2–3× per week for another 2–4 weeks minimum before increasing. **barrier is everything right now.** use ceramides + panthenol after tretinoin, skip any other actives (BHA, AHA, vitamin c) for at least another week or two. azelaic acid 10–20% is fine to layer in if you're not already irritated, but read your skin first. **SPF every day, no exceptions.** tretinoin makes you photosensitive. UV will undo the work and darken any existing pigmentation. what's your current routine look like (cleanser, moisturizer, SPF)? and are you seeing redness or peeling yet, or still pretty calm?
- products: 2 item(s)
- status=200 latency=8.89s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=886

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in at 0.025%, so you're still building tolerance. jumping to nightly this early is the #1 mistake people make—it tanks your barrier and you end up with raw, irritated skin that stalls progress.

stick with every other night (3–4× per week) for the next 4–6 weeks. once your skin stops peeling and feels solid, you can bump to 5× per week, then nightly around week 8–12. the slow ramp actually gets you better results faster because you're not fighting inflammation the whole time.

how's your skin responding so far—any flaking, redness, or dryness?
- status=200 latency=7.67s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=598

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your skin barrier is compromised. stop everything except a gentle cleanser and a basic moisturizer for the next 3–5 days. this sounds like over-exfoliation or irritation from tretinoin (you started 0.025% two weeks ago).

here's what to do now:

1. **cleanser**: use a non-foaming, creamy cleanser. wash once at night only, skip morning washing — just rinse with water.

2. **moisturizer**: apply while skin is still damp. lock in hydration to repair the barrier. this matters more than any active right now.

3. **pause tretinoin**: stop it completely for 5–7 days. your skin needs to recover before you add anything back.

4. **no exfoliation, no actives**: skip acids, vitamin c, niacinamide, everything. let the barrier heal.

5. **sunscreen during the day**: spf 30+ if you go outside, but only after the barrier stabilizes (2–3 days in).

once the redness and peeling calm down (usually 3–5 days), you can reintroduce tretinoin at a lower frequency — maybe once or twice a week instead of nightly. your skin will adapt faster if you give it breathing room now.

what cleanser and moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=9.05s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1122
  - [PASS] latency_lt: 9.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** nice, you're early enough to dial in the routine before irritation peaks. how's your skin responding so far—any redness, peeling, or sensitivity, or still pretty calm?
- status=200 latency=6.86s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=167

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for the first month minimum. you're two weeks in, so you're right in the sweet spot to establish a cadence before ramping up.

here's why: tretinoin builds tolerance over time, but jumping to nightly too fast tanks your barrier and you'll hit the irritation wall hard—redness, peeling, flaking, tight skin. every other night lets your skin adapt without overdoing it. once you hit week 4-6 and your skin's handling it clean, you can move to 3x/week, then eventually nightly if you want.

since you have combination skin with texture concerns, the goal is to let tretinoin smooth that out without nuking your moisture barrier. barrier damage makes texture worse short-term.

**the routine that matters:**
1. **cleanser**: gentle, no actives (skip acids, vitamin c, anything else exfoliating)
2. **wait 10-15 min**: skin needs to be completely dry before tretinoin
3. **tretinoin**: pea-sized amount, press gently into skin (don't rub)
4. **moisturizer**: lock it in immediately after, something hydrating

skip sunscreen on tretinoin nights if you're staying indoors; use it every morning regardless. and no other actives—no niacinamide, no azelaic acid, nothing that'll pile on irritation.

are you using a moisturizer and cleanser already, or do you need recs?
- products: 3 item(s)
- status=200 latency=8.49s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1279

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your skin barrier is compromised. stop everything except cleanser, moisturizer, and spf for the next 3–5 days. this gives the barrier a chance to repair.

here's what to do right now:

1. **cleanser**: use a gentle, fragrance-free one (cerave hydrating cleanser works). lukewarm water, no scrubbing.
2. **moisturizer**: apply to damp skin immediately after washing. something occlusive like cerave moisturizing cream or vanicream.
3. **spf 30+**: every morning, even indoors. uv exposure worsens redness and delays healing.

skip tretinoin, exfoliants, actives, and vitamin c until the peeling and redness calm down. you started tretinoin two weeks ago, so this is likely retinization or mild irritation. pause it for now.

if the peeling and redness don't improve in 5–7 days, or if you develop burning, swelling, or a rash, see a derm. but most of the time, barrier repair alone fixes this.

what does the redness feel like — hot/burning, or just discolored?
- products: 3 item(s)
- status=200 latency=8.01s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=960
  - [PASS] latency_lt: 8.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


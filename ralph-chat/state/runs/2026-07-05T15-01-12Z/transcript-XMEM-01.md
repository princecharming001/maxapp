# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in and you're probably still in the adjustment phase. how's your skin holding up — flaking, redness, irritation, or mostly okay so far?

also, what was your baseline acne like before you started, and are you running any other actives (niacinamide, azelaic acid, vitamin c) right now?
- products: 2 item(s)
- status=200 latency=6.48s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=293

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% and only two weeks in, every other night is the safer call. you're still building tolerance, and jumping to nightly too fast is how people crater their barrier and bail on tretinoin.

stick with every other night for at least 4–6 more weeks. once your skin stops flaking and the redness settles, you can bump to nightly if you want. the dose is already low, so you're not losing efficacy by spacing it out — you're just giving your skin time to adapt without unnecessary irritation.

one thing: make sure you're using a solid moisturizer after it dries (wait 20 min post-tret, then apply). dry skin + tretinoin is a rough combo.
- products: 1 item(s)
- status=200 latency=6.31s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=638

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** you're likely over-treating or your barrier is compromised. since you just started tretinoin two weeks ago, that's almost certainly the culprit.

here's what to do right now:

1. **dial back tretinoin** — skip it for 3–5 days, let your skin settle. when you restart, go every other night instead of nightly, or drop to 0.025% if you're already on that dose.

2. **strip your routine** — cleanser, moisturizer, sunscreen only. nothing else. no actives, no exfoliants, no vitamin c, no niacinamide right now.

3. **moisturize heavily** — apply to damp skin (within 60 seconds of cleansing) to lock in water. your skin is dry to begin with, so this matters more for you.

4. **spf 30+ every morning** — tretinoin makes you photosensitive. sun exposure will worsen redness and slow healing.

the peeling and redness should calm in 5–7 days. once it does, reintroduce tretinoin slowly: start 2–3× per week, increase by one night every 1–2 weeks. your skin will adapt, but you have to be patient with it.

what moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=8.62s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1041
  - [PASS] latency_lt: 8.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


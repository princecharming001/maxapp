# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** nice, you're in the adjustment window. how's your skin responding so far — any redness, flaking, irritation, or is it holding up okay?
- status=200 latency=7.42s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=134

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% and only two weeks in, every other night is the safer play. your skin's still acclimating, and going nightly this early usually triggers unnecessary irritation — redness, peeling, sensitivity that makes you want to bail on it.

stick with every other night for at least 4-6 more weeks, then reassess. if your skin's stable and not reactive, you can bump to nightly. the goal is consistency over months, not speed. one irritated quit beats a slow, steady climb.
- status=200 latency=7.27s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=470

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling and red usually means your barrier is damaged, most likely from the tretinoin you started two weeks ago. this is normal early on, but you need to dial it back now or it'll get worse.

here's what to do:

1. **drop tretinoin to 1–2× per week** for the next 2–3 weeks. you went too fast at daily use. your skin needs to adapt.

2. **strip your routine down** — cleanser, moisturizer, spf only. nothing else. no actives, no acids, no vitamin c, no niacinamide. let the barrier heal.

3. **moisturize heavily** — apply to damp skin right after cleansing, then seal it with a richer cream or occlusive (cerave moisturizing cream, cetaphil rich hydrating night cream, or even a thin layer of aquaphor on top).

4. **use gentle cleanser** — your skin is raw. avoid anything foaming or stripping. something like cerave hydrating cleanser.

5. **spf 30+ every morning** — non-negotiable. sun exposure will set back healing and deepen redness.

the peeling should calm down in 3–5 days once you lower frequency. if it's still angry after a week, pause tretinoin entirely for a few days and let it fully settle, then restart at 1× per week.

what's your current cleanser and moisturizer?
- products: 4 item(s)
- status=200 latency=10.0s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1184
  - [PASS] latency_lt: 10.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


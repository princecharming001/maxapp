# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** how's your skin responding so far? any redness, peeling, or irritation, or are you tolerating it pretty well?

knowing where you're at with the adjustment helps me dial in a support routine that'll keep you progressing without the classic tretinoin burnout.
- status=200 latency=6.75s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=257

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% two weeks in, every other night is the safer call right now.

you're still in the adjustment phase. going nightly this early tends to trigger unnecessary irritation, peeling, and barrier damage that'll slow your results and make you want to quit. the research is pretty clear: low-dose tret works just as well on a slower cadence, and you'll actually stick with it longer because you're not constantly uncomfortable.

once you hit 4–6 weeks and your skin's adapted (minimal irritation, no raw patches), you can bump to nightly if you want. but honestly, a lot of people get great results staying on every-other-night indefinitely.

what does your current routine look like around the tretinoin — cleanser, moisturizer, anything else?
- products: 1 item(s)
- status=200 latency=11.46s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=743

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** that's your barrier being compromised. peeling + redness together means you're either over-treating or reacting to something you're using. since you just started tretinoin two weeks ago, that's almost certainly the culprit.

here's the move:

1. **drop everything except cleanser, moisturizer, sunscreen.** no actives, no exfoliation, nothing. tretinoin is already doing the work; adding more irritates faster.

2. **scale back tretinoin frequency.** if you're using it nightly, cut to every other night or even 2–3x/week until the peeling stops. low and slow wins here, especially at 0.025%.

3. **repair the barrier.** use a heavy moisturizer after cleansing on damp skin. something with ceramides and centella asiatica helps calm inflammation. apply sunscreen every morning without fail.

4. **avoid heat, fragrance, physical scrubs, acids.** anything that stresses the skin right now will make it worse.

the peeling should ease in 3–5 days once you dial back frequency. redness takes longer, usually 1–2 weeks. if it gets worse or burns when you apply moisturizer, pause tretinoin entirely for 3–4 days and just repair.

what does your current routine look like right now (cleanser, moisturizer, sunscreen)?
- products: 1 item(s)
- status=200 latency=9.35s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1212
  - [PASS] latency_lt: 9.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


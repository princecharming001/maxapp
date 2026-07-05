# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** nice, you're in the adjustment window. how's your skin responding so far—any redness, peeling, or sensitivity, or are you cruising through it clean?
- status=200 latency=6.25s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=148

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in, so your skin's still acclimating. tretinoin works by building tolerance over time—jumping straight to nightly dosing when you're new to it will just trash your barrier and make you flake like crazy.

stick with every other night for at least 4–6 weeks, then reassess. if you're not getting irritation (minimal redness, no excessive peeling), you can bump to 5 nights a week. nightly comes later, once your skin's adapted—usually month 2–3 depending on how you respond.

what does your current routine look like around the tret (cleanser, moisturizer, sunscreen)?
- products: 1 item(s)
- status=200 latency=5.95s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=615

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** grab the **cerave hydrating cleanser** and **cerave pm moisturizing lotion** to start. both are gentle, ceramide-heavy, and won't trigger your oily skin. if your barrier is really wrecked, the **cerave moisturizing cream** in the tub is stronger.

once the redness and peeling calm down (1-2 weeks), we can add **azelaic acid** back in — it'll help with the acne and any lingering redness without being harsh.
- products: 4 item(s)
- status=200 latency=11.52s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=409
  - [PASS] latency_lt: 11.5s (ceiling 45s)
  - [FAIL] includes_any: none of ['tretinoin', 'retinoid', 'purge', 'adjust'] found
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


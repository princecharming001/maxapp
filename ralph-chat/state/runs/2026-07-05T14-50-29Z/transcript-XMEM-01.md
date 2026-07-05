# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're in the adjustment phase. how's your skin handling it so far — any irritation, peeling, redness, or is it pretty calm?

also, what's your current routine around it (cleanser, moisturizer, sunscreen timing)? tretinoin needs a solid support cast to work without trashing your barrier, especially early on.
- products: 1 item(s)
- status=200 latency=11.05s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=323

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. at 0.025% and only two weeks in, you're still building tolerance. jumping to nightly too fast is the #1 way to wreck your barrier and stall progress.

stay on every other night for at least 4-6 more weeks, then reassess. if your skin's handling it well (minimal irritation, no excessive peeling), you can move to nightly around week 8-10. rushing it just means more redness, flaking, and a damaged moisture barrier that'll set you back further.

how's the irritation level right now?
- status=200 latency=7.01s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=510

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your barrier is compromised. peeling + redness together means you're either over-treating (too much actives, too frequent exfoliation) or the products you're using are irritating. you said you started tretinoin 0.025% two weeks ago — that's likely the culprit.

here's the immediate fix:

1. **pause tretinoin** for 3–5 days. let your skin settle. you can restart it after, but slower.
2. **strip your routine down** to just cleanser, moisturizer, and spf. nothing else. no other actives, no exfoliants.
3. **use a gentle cleanser** — something creamy, not foaming. wash once daily (evening only if possible).
4. **moisturize heavily** twice daily. your barrier needs hydration and occlusion to repair.
5. **spf 30+ every morning**, no exceptions. uv exposure will make redness worse and slow healing.

the peeling should stop within 3–7 days once you drop the tretinoin and lock in moisture. once your skin feels normal again (no stinging, no tightness), reintroduce tretinoin very slowly — start with 1–2 times per week, not every night.

what cleanser and moisturizer are you using right now?
- products: 1 item(s)
- status=200 latency=9.54s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1095
  - [PASS] latency_lt: 9.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


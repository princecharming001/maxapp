# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** you're two weeks in, so you're still in the irritation/adjustment window. here's what matters right now: **keep the dose steady at 0.025% for at least 4–6 weeks before bumping up.** the protocol calls for 0.05% as the target, but you start lower and titrate up. your skin needs time to build tolerance without trashing your barrier. **apply on completely dry skin, pea-sized amount.** wait 20 minutes after cleansing so there's zero water on your face. water increases penetration and irritation. **don't add anything else right now.** no acids, no vitamin c, no dermastamping. just tretinoin + a simple moisturizer (ceramides + panthenol) + SPF every morning. your barrier is already stressed. **SPF is non-negotiable.** tretinoin makes you photosensitive. UV will undo the work and darken any existing pigmentation. expect some dryness, mild flaking, maybe slight redness for the next 2–4 weeks. that's normal. if you get severe burning or persistent raw patches, dial back to every other night for a week, then resume nightly. what's your current moisturizer and SPF setup?
- products: 1 item(s)
- status=200 latency=10.18s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1076

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for the next 2–4 weeks, then move to nightly once your skin adapts.

you're only two weeks in. going nightly from the jump is aggressive on 0.025% and tanks your barrier faster than it needs to. every other night lets you build tolerance without unnecessary irritation, peeling, or sensitivity. after a month, when dryness and redness are minimal, switch to nightly. that's the standard low-and-slow approach.

what does your skin feel like right now—any burning, flaking, or raw patches?
- status=200 latency=8.13s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=506

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling and redness usually means your barrier is compromised, most likely from the tretinoin you started two weeks ago. that's normal at this stage, but you need to dial it back.

here's what to do right now:

1. **cut tretinoin frequency** — drop to 1-2× per week instead of nightly. your skin needs time to adapt. you can ramp back up in 4-6 weeks once redness settles.

2. **simplify your routine** — cleanser, moisturizer, spf. nothing else. no actives, no exfoliation, no fragrance. your barrier is working hard to repair itself.

3. **moisturize heavily** — use a cream or occlusive at night to lock in hydration and reduce irritation. the peeling will slow down once your skin is genuinely hydrated.

4. **spf every morning** — tretinoin makes skin photosensitive. uv exposure will worsen redness and slow healing.

the peeling should calm in 3-5 days once you drop frequency. if it gets worse or you develop burning/stinging that doesn't fade, pause tretinoin entirely for a week and rebuild from there.

what cleanser and moisturizer are you using right now.
- products: 1 item(s)
- status=200 latency=9.54s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1068
  - [PASS] latency_lt: 9.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


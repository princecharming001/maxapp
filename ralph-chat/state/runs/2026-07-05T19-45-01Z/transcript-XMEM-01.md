# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** you're two weeks in, so you're still in the adjustment phase. at 0.025% you're below the standard starting dose, which is fine if your skin is sensitive, but know that the protocol calls for 0.05% as the baseline. here's what matters right now:
1. **keep it on dry skin, pea-sized only**. wet skin = faster penetration = more irritation. wait 20 min after cleansing.
2. **barrier support is non-negotiable**. ceramides + panthenol after tret, every night. if you're not doing this, start now. irritation kills progress.

3. **SPF every day, no exceptions**. UV will undo everything tret is doing. mineral SPF 30+ minimum, reapply if you're outside.

4. **sleep matters as much as the tret**. collagen repairs during deep sleep, inflammation resets. aim for 7-9 hours. poor sleep = slow healing. what's your skin type and are you seeing any irritation yet (redness, peeling, dryness)?
- products: 1 item(s)
- status=200 latency=12.6s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=883

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for the next 2-4 weeks, then move to every night once your skin adapts.

you're at 0.025%, which is low-dose, but two weeks in your barrier is still adjusting. if you jump to nightly now and your skin starts burning, flaking hard, or getting raw, you'll either have to backtrack or push through unnecessary damage. every other night lets you build tolerance without compromising the barrier.

watch for signs you're ready to increase: minimal peeling, no persistent redness after 12 hours, and your skin feels stable (not tight or irritated). once you hit that, go nightly. most people at 0.025% can handle nightly by week 4-6.

also: are you using a retinol or any other actives right now (vitamin c, niacinamide, acids)? if so, pause them while you're ramping up tret.
- products: 2 item(s)
- status=200 latency=8.56s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=788

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** you're dealing with a compromised barrier — likely from the tretinoin. at 0.025% for two weeks, your skin's still adjusting and peeling/redness is normal, but you need to dial back irritation right now.

here's what to do:

1. **cut tretinoin frequency** — drop to every 3rd night instead of nightly. let your barrier catch up. you can ramp back up once redness settles (usually 4–6 weeks in).

2. **simplify your routine** — cleanser, moisturizer, sunscreen only. nothing else. no actives, no exfoliants, no acids. your skin can't handle extra stress right now.

3. **moisturize heavily** — apply to damp skin right after cleansing to lock in water. this matters more than the product itself.

4. **spf every morning** — tretinoin makes you photosensitive. skip this and you'll get worse pigmentation and irritation.

the peeling and redness should ease within 1–2 weeks once you space out the tretinoin. if it gets worse or burns intensely, pause tretinoin for a few days and just repair the barrier, then restart slower.

what moisturizer are you using right now?
- products: 1 item(s)
- status=200 latency=8.26s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1066
  - [PASS] latency_lt: 8.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


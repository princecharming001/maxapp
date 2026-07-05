# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in is still the adjustment phase. how's your skin reacting so far—any redness, peeling, sensitivity, or flaking?
- status=200 latency=7.33s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=122

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% and only two weeks in, every other night is the safer play right now.

your skin's still building tolerance. jumping to nightly this early risks unnecessary irritation, peeling, and barrier damage. stick with every other night for at least 4-6 weeks, then reassess. if your skin's handling it well with minimal redness or peeling, you can move to nightly. if you're already seeing significant irritation, dial it back to twice a week.

key things while you're ramping:
1. **wait 20 minutes after cleansing** before applying (damp skin increases penetration and irritation)
2. **use a pea-sized amount**—tretinoin is potent, you don't need much
3. **moisturize after**, always. your skin's dry, so lock it in with a solid hydrating moisturizer
4. **sunscreen every morning**, no exceptions. tretinoin makes you more photosensitive

how's the peeling and redness looking right now?
- products: 1 item(s)
- status=200 latency=8.29s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=889

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling and red usually means your barrier is compromised. since you started tretinoin two weeks ago, that's almost certainly the culprit—retinoids are strong and your skin's still adjusting.

here's what to do right now:

1. **dial back tretinoin frequency.** you're probably using it nightly. drop to every other night or even 2–3x/week for the next 2–3 weeks. the peeling will calm down and you'll actually tolerate higher doses later. rushing this just extends the damage.

2. **simplify your routine.** cleanser, moisturizer, spf. nothing else. no actives, no exfoliants, no acids. your barrier needs to recover, not more stress.

3. **moisturize aggressively.** apply while skin is still damp after cleansing. a heavier cream at night helps. dry skin + tretinoin is a bad combo.

4. **spf every morning.** tretinoin makes you photosensitive. skip this and you'll get worse redness and pigmentation issues.

the redness should settle in 1–2 weeks once you lower the frequency. peeling usually takes 3–4 weeks to fully stop. you're not doing anything wrong, your skin just needs time.

what moisturizer are you using right now?
- products: 1 item(s)
- status=200 latency=10.22s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1131
  - [PASS] latency_lt: 10.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'retinoid', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


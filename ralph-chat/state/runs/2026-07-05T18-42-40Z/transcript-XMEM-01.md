# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in is early, so don't expect much yet. tretinoin takes 6-12 weeks to show real acne improvement, and the first month is usually irritation, dryness, peeling—that's normal and means it's working.

what's your routine looking like right now? are you buffering (mixing tret with moisturizer first), how often are you using it, and what's your cleanser + moisturizer situation? oily skin + tret is a specific game, and the details matter for staying consistent without bailing early.
- products: 1 item(s)
- status=200 latency=8.37s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=489

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** start every other night for at least the first 4-6 weeks. your skin needs time to build tolerance, and jumping straight to nightly at 0.025% will likely trash your barrier and make you want to quit.

the standard play: every other night for a month, then reassess. if you're handling it well (minimal irritation, skin's not angry), move to 3x/week, then eventually nightly. but honestly, a lot of people get great results on 3-4x/week and never need to go daily. oily skin can handle tret faster than dry skin, but that doesn't mean you should rush it.

what's your current schedule—are you already using it every night, or haven't started dosing yet?
- status=200 latency=6.69s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=651

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your skin barrier is compromised. the peeling and redness mean it's reacting to something—either a product, over-exfoliation, or an ingredient you're using too much of.

since you started tretinoin two weeks ago, that's the likely culprit. tretinoin causes irritation in the first 4–8 weeks as your skin adapts. here's what to do now:

1. **dial back the tret**. drop to every other night or every third night. you can rebuild frequency later once the irritation settles. 0.025% is already the lowest dose, so frequency is your lever.

2. **strip your routine to the basics**. cleanser (gentle, no actives), moisturizer, sunscreen. nothing else. no acids, no vitamin c, no other treatments. let your skin recover.

3. **moisturize heavily**. use a heavier cream at night—something with ceramides or centella asiatica to repair the barrier. apply to damp skin to lock in water.

4. **spf every morning, no exceptions**. tretinoin makes skin photosensitive. uv exposure will worsen redness and slow healing.

the peeling should ease within 3–5 days once you back off frequency. redness usually takes 1–2 weeks. don't panic and jump to new products—that's how you extend the damage.

what cleanser and moisturizer are you using right now.
- products: 1 item(s)
- status=200 latency=9.84s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1235
  - [PASS] latency_lt: 9.8s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']


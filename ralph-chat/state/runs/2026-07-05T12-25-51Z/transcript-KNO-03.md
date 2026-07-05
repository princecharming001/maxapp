# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you press your tongue flat against the roof of your mouth (back third), seal your lips, and keep your teeth in light contact. the idea is that sustained tongue-up posture + sealed lips + chin tucked shifts how your jaw and midface sit over time. does it work for adults. marginal. mewing alone won't reshape bone if your sutures are closed, which they are at 20. what it does do is reinforce posture habits that keep your jaw from sagging forward, which matters when you're sitting at a desk 8 hours a day. the real jaw gains come from masseter training (thickening the muscle) and dropping body fat below 15%, not from tongue position. the protocol is 3 resets a day: morning at wake (60s active hold, then passive), midday reset (30s conscious check), and night check 30min before bed. it's low friction if you stack it into your existing routine, but don't expect it to be the main lever on your jawline.
- status=200 latency=10.62s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=942
  - [PASS] latency_lt: 10.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


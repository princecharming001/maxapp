# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you press your tongue flat against the roof of your mouth (back third), seal your lips, and keep your teeth lightly touching. the idea is that sustained tongue-up posture shifts how your jaw sits and how your face reads overall. does it work for adults. marginal. mewing won't remodel bone if your growth plates are closed, which they are at 18. what it does do is train postural awareness and reduce forward head posture, which keeps your jawline from sagging into your neck. that's real but subtle. the actual jaw-changing moves are masseter training (thickens the muscle under your cheeks, visible in 8-12 weeks) and neck work (holds your head up so the angle stays sharp instead of soft). mewing is the backbone habit that keeps you from undoing those gains by slouching. the protocol is 3 daily resets: 60s active hold in the morning, a 30s conscious reset at midday, and a night check 30 min before bed. it's low friction if you stack it with your existing schedule.
- status=200 latency=11.33s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1007
  - [PASS] latency_lt: 11.3s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


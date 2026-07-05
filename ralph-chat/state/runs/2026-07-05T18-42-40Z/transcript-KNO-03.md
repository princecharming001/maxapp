# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you put your tongue on the roof of your mouth (back third), seal your lips, and keep your teeth in light contact. the idea is that sustained palatal pressure + proper head posture shifts how your face reads over time. does it work for adults. not really, candidly. your skull bones are fused. mewing won't reshape bone structure if you're past your growth plates. what it can do is reinforce good posture habits and reduce forward head posture, which keeps your jawline from collapsing into a soft look. that's real but marginal. the actual jaw-changing moves are masseter training (thickens the muscle under your jaw, visible in 8-12 weeks) and getting body fat low enough that your jawline reads sharp. those move the needle way more than mewing alone. if you want to run mewing anyway, the protocol is three resets a day: 60s active hold at wake, a 30s conscious reset at midday, and a night check 30min before bed. the rest of the day it's passive (tongue stays up while you work/eat/talk).
- status=200 latency=11.97s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1029
  - [PASS] latency_lt: 12.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


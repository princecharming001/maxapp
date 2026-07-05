# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you put your tongue on the back third of your palate, seal your lips, keep your teeth in light contact, and tuck your chin. the idea is that sustained palatal contact + proper head posture shifts how your jaw and midface sit over time. does it work for adults. not really. your skull bones are fused, so mewing won't reshape bone. what it can do is improve posture and reduce forward head tilt, which makes your jawline look sharper in the moment. but the structural change is minimal. the real jaw movers for you at 16 are masseter training (thickens the muscle under your jaw, visible in 8-12 weeks) and body fat below 15% (biggest single lever for jawline definition). mewing is the backbone habit—do it passively all day,but don't expect it to rebuild your face. the protocol is 3 resets a day: morning at wake (60s active hold), midday around 3pm (30s reset), and night 30min before bed.
- status=200 latency=11.19s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=927
  - [PASS] latency_lt: 11.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'palate', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


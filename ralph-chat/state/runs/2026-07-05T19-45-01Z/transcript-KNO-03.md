# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you put your tongue flat on the roof of your mouth (back third), seal your lips, and keep your teeth in light contact. the idea is that sustained tongue-on-palate posture trains the muscles and fascia around your jaw and face, which can shift how your jawline reads. does it work for adults. not really, not on its own. your bones are fused. what mewing can do is train postural habits that keep your jaw from sagging forward when you're slouched or looking at a screen. it's a baseline hygiene thing, not a game-changer. the real jaw changes come from masseter training (thickening the jaw muscle itself) and neck work (keeping your head up and back so the jawline stays sharp instead of soft). those produce visible change in 8-12 weeks. mewing is the foundation you maintain all day, but it's not the lever. if you're serious about jawline, focus on body fat <15%, then masseter + neck training. mewing is the posture glue that keeps it all from sliding backward.
- status=200 latency=9.54s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1001
  - [PASS] latency_lt: 9.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'palate', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


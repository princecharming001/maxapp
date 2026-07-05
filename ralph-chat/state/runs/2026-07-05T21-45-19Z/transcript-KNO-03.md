# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you press your tongue flat against the roof of your mouth (back third), seal your lips, and keep your teeth in light contact. the idea is that sustained tongue-up posture changes how your jaw and midface develop over time. does it work for adults. not really. bone structure is locked after your growth plates close, so mewing won't reshape your skeleton. what it can do is train postural habits that keep your head positioned better, which makes your jawline read sharper instead of soft. the real jaw gains come from masseter training (thickening the muscle) and dropping body fat below 15%, not from mewing alone. if you're an adult, mewing is a maintenance habit, not a transformation protocol. do it 3x daily (morning, midday reset, night) but don't expect structural change. pair it with chewing or gum work if you want visible jaw definition.
- status=200 latency=9.56s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=884
  - [PASS] latency_lt: 9.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


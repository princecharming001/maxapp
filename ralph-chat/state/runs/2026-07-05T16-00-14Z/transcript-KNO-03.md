# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you press your tongue flat against the roof of your mouth (back third), seal your lips, and keep your teeth lightly touching. the idea is that sustained tongue-up posture changes how your jaw and face develop over time. does it work for adults. not really. you can't remodel bone after your growth plates close, which happens in your late teens. what mewing can do is train postural awareness and keep your jaw from sagging forward due to bad posture, but that's a small effect compared to what masseter training or body fat loss will do. if you're 18, your plates are basically closed. mewing is worth doing as a posture habit (3 resets a day: morning, midday, night), but don't expect structural change. the real jaw gains come from thickening the masseter muscle and dropping body fat below 15%.
- status=200 latency=9.42s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=833
  - [PASS] latency_lt: 9.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


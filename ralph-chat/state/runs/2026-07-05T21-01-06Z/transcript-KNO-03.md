# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you put your tongue on the roof of your mouth (back third), seal your lips, and keep your teeth in light contact. the idea is that sustained palatal pressure + proper head posture shifts how your face reads over time. does it work for adults. honestly, no. not meaningfully. mewing produces marginal change in adults because your bone sutures are fused. what does work is the posture piece—keeping your head over your neck instead of forward, which makes your jawline look sharper immediately and prevents soft-tissue sag long-term. the real jaw gains come from masseter training (thickening the muscle under your jaw) and neck work, not tongue position. if you're serious about jaw aesthetics, lead with those, not mewing. mewing is the backbone of the protocol because it's low-friction and reinforces head posture all day, but it's not the driver.
- status=200 latency=10.03s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=885
  - [PASS] latency_lt: 10.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


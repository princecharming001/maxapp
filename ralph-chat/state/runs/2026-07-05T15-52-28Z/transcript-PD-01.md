# PD-01
## turn 0 ('what do you actually know about me so far?')
**user:** what do you actually know about me so far?
**assistant:** you're 23, male, 5'6.6", 185 lbs. dry skin, intermediate gym experience. you've got access to a full gym and you're hitting it 4 days a week, ideally at 8am. you wake at 7, sleep at 11pm.

you're going for recomp (body recomposition, not just weight loss). you care about bonemax and fitmax most. hair loss is active for you, which matters for the hairmax side.

you don't have a skincare routine yet, and your main appearance concerns are acne and dark circles.

that's the real stuff. the rest is defaults until you tell me otherwise.
- status=200 latency=10.84s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=536
  - [PASS] latency_lt: 10.8s (ceiling 45s)
- needs_judge: ['uses_user_context']


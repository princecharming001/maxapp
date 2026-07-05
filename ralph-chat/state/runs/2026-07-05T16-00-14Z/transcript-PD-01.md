# PD-01
## turn 0 ('what do you actually know about me so far?')
**user:** what do you actually know about me so far?
**assistant:** you're 35, female, 184cm tall, 87.9kg. you wake at 7am, sleep at 11pm. you've got dark circles under your eyes—that's your main skin concern, and your skin's dry. you're intermediate at training but just started with fitmax (beginner level there), you've got a barbell at home, and you're aiming for 5 days a week at 8am.

your real goals are bonemax and heightmax. you care most about face structure, then body, then height, hair, and skin—in that order. you also mentioned body fat and jawline as concerns.

you're in new york, moderate activity level, under 4 hours of screen time daily. no injuries or allergies flagged. you respond better to direct talk.

that's the actual ground truth. anything else i should know?
- status=200 latency=11.9s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=721
  - [PASS] latency_lt: 11.9s (ceiling 45s)
- needs_judge: ['uses_user_context']


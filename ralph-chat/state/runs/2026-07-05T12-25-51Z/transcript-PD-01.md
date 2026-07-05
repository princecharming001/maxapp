# PD-01
## turn 0 ('what do you actually know about me so far?')
**user:** what do you actually know about me so far?
**assistant:** you're 26, female, 159 cm, 90.8 kg. you wake at 7am, sleep at 11pm. you've got combination skin with texture concerns, no real skincare routine yet. you're dealing with active hair loss but haven't tried treatments. you want to build muscle and lose fat, never trained before, but you've got full gym access and want to work out 5 days a week at 8am. you're in new york, moderate activity level, not glued to screens.

your main goals are bonemax and skinmax, though you also care about hair, body, and height in that order.

that's what's locked in. anything else i should know, or want to start with one of your goals.
- status=200 latency=10.03s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=620
  - [PASS] latency_lt: 10.0s (ceiling 45s)
- needs_judge: ['uses_user_context']


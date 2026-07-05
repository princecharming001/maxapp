# PD-01
## turn 0 ('what do you actually know about me so far?')
**user:** what do you actually know about me so far?
**assistant:** you're 33, female, 5'5", 121 lbs. oily skin with acne as your main concern. intermediate gym experience, barbell in your home setup. you wake at 7, sleep at 11. you want to build muscle (fitmax goal), plus level up your hair and skin.

you've got a family history of hair loss but aren't losing hair now. you're on a basic skincare routine. moderate activity level, 6-8 hours of screen time daily. you prefer working out around 8am.

that's the solid stuff. everything else i'll pick up as we talk.
- status=200 latency=9.89s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=498
  - [PASS] latency_lt: 9.9s (ceiling 45s)
- needs_judge: ['uses_user_context']


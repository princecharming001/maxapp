# PD-01
## turn 0 ('what do you actually know about me so far?')
**user:** what do you actually know about me so far?
**assistant:** you're 22, female, 5'11", 213 lbs. you wake at 7am, sleep at 11pm, and prefer working out at 8am. you've got a barbell at home and are looking to gain muscle — that's your main fitness goal, though you're new to structured training (beginner level).

you're moderately active, spend 4-6 hours on screens daily, and have combination skin with no major skin concerns right now. you've got some starting hair loss in your family history, but you're not on any treatments yet.

your top priorities are body, then hair, height, skin, and face structure. you're also tracking dark circles as an appearance concern.

that's the baseline. anything you want to add or change about how i'm coaching you, just say so.
- status=200 latency=11.03s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=706
  - [PASS] latency_lt: 11.0s (ceiling 45s)
- needs_judge: ['uses_user_context']


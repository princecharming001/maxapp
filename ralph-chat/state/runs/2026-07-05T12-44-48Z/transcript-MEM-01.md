# MEM-01
## turn 0 ("quick heads up: i'm vegetarian and i work out at 6am before work")
**user:** quick heads up: i'm vegetarian and i work out at 6am before work
**assistant:** got it. vegetarian, 6am workouts. that's solid timing — you'll have fuel needs before that session and recovery after. i've got that locked in.

what are you working on right now — are you running fitmax, bonemax, or both? and do you have a schedule set up yet, or starting fresh?
- status=200 latency=8.12s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=280
  - [PASS] latency_lt: 8.1s (ceiling 45s)

## turn 1 ('what should i eat after my workout?')
**user:** what should i eat after my workout?
**assistant:** what's the main goal?
- choices: ['build muscle', 'lose fat', 'get stronger', 'general fitness', 'Something else'] (multi=False)
- status=200 latency=2.12s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: skipped (choices present, short clarifier OK)
  - [PASS] latency_lt: 2.1s (ceiling 45s)
  - [PASS] excludes: clean
- needs_judge: ['uses_user_context', 'answers_the_question']

## turn 2 ('and when should i eat it?')
**user:** and when should i eat it?
**assistant:** for a 6am workout, eat 30-45 min before:

1. **carbs + protein, light**: toast with almond butter, banana with greek yogurt, or oatmeal with berries. keeps digestion quick so you're not heavy during the session.
2. **timing**: 6am workout means eat around 5:15–5:30am. that's early, but it's the sweet spot — enough time to digest, enough fuel to lift hard.
3. **post-workout (within 1-2 hours)**: protein + carbs again — eggs with toast, protein smoothie with fruit, or cottage cheese with granola. speeds recovery.

if 5:15am feels brutal, you can do a smaller pre-workout snack (banana, handful of nuts) and eat the real meal after. what matters most is hitting protein and carbs in that post-workout window.

are you on fitmax yet, or do you need a schedule built?
- products: 1 item(s)
- status=200 latency=9.56s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=768
  - [PASS] latency_lt: 9.6s (ceiling 45s)
- needs_judge: ['uses_user_context']


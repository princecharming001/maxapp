# MEM-01
## turn 0 ("quick heads up: i'm vegetarian and i work out at 6am before work")
**user:** quick heads up: i'm vegetarian and i work out at 6am before work
**assistant:** got it. vegetarian + early 6am workouts. that's solid timing for fat loss and muscle work before the day hits.

couple quick things to lock in so i can build your routines right:

1. **pre-workout fuel** — do you eat something before 6am, or go fasted? and what's your go-to post-workout (eggs, protein shake, greek yogurt)?

2. **work schedule** — when do you start work and roughly how long are you there? helps me anchor your skincare/hair routine around your actual morning.

once i know those, i can sync your fitmax and bonemax schedules to your actual rhythm instead of guessing.
- products: 1 item(s)
- status=200 latency=9.92s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=586
  - [PASS] latency_lt: 9.9s (ceiling 45s)

## turn 1 ('what should i eat after my workout?')
**user:** what should i eat after my workout?
**assistant:** what's the main goal?
- choices: ['build muscle', 'lose fat', 'get stronger', 'general fitness', 'Something else'] (multi=False)
- status=200 latency=1.41s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: skipped (choices present, short clarifier OK)
  - [PASS] latency_lt: 1.4s (ceiling 45s)
  - [PASS] excludes: clean
- needs_judge: ['uses_user_context', 'answers_the_question']

## turn 2 ('and when should i eat it?')
**user:** and when should i eat it?
**assistant:** locked in. vegetarian, 6am workouts.

for pre-workout at 5:30–5:45am, you want something light and fast-digesting:
1. **banana + peanut butter** (easiest, ~15–20g carbs + protein)
2. **toast with almond butter**
3. **greek yogurt + granola**
4. **protein shake** (pea or whey)

post-workout (right after, ideally within 30–60 min): protein + carbs to refuel and spike insulin for muscle recovery.
5. **eggs + toast** (2–3 eggs, 1–2 slices)
6. **cottage cheese + fruit**
7. **protein shake + oats**
8. **tofu scramble + rice**

the carbs post-workout matter more than pre, since your muscles are primed to absorb them. aim for 20–30g protein and 30–40g carbs.

what does your actual post-workout window look like — are you eating at home right after, or grabbing something at work an hour later?
- products: 1 item(s)
- status=200 latency=10.75s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=794
  - [PASS] latency_lt: 10.8s (ceiling 45s)
- needs_judge: ['uses_user_context']


# MEM-01
## turn 0 ("quick heads up: i'm vegetarian and i work out at 6am before work")
**user:** quick heads up: i'm vegetarian and i work out at 6am before work
**assistant:** got it. 6am workouts, vegetarian. that's solid timing — you'll have a clean window before work and your body will be primed for the session.

since you're hitting the gym that early, you're probably eating something light beforehand or training fasted. either way, post-workout nutrition is where the win is — protein + carbs within an hour to lock in the muscle gain you're after.

what does your current breakfast/post-workout meal usually look like.
- products: 1 item(s)
- status=200 latency=9.75s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=452
  - [PASS] latency_lt: 9.7s (ceiling 45s)

## turn 1 ('what should i eat after my workout?')
**user:** what should i eat after my workout?
**assistant:** post-workout you want protein + carbs within an hour or two of finishing. since you're done at like 7am, aim to eat by 8am max. for protein, go with greek yogurt, cottage cheese, eggs, or a whey shake — all hit 25-35g per serving. pair it with carbs like oats, rice, fruit, or toast to refill glycogen and keep your muscles full. a solid post-workout meal: scrambled eggs + oatmeal + banana, or greek yogurt + granola + berries, or a whey shake with a rice cake. keeps you full before work and speeds recovery.
- products: 1 item(s)
- status=200 latency=9.48s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=510
  - [PASS] latency_lt: 9.5s (ceiling 45s)
  - [PASS] excludes: clean
- needs_judge: ['uses_user_context', 'answers_the_question']

## turn 2 ('and when should i eat it?')
**user:** and when should i eat it?
**assistant:** right, you're vegetarian — stick with eggs, greek yogurt, cottage cheese, or whey protein powder. all solid post-workout picks.

timing: eat within 60 minutes of finishing your 6am workout, so ideally by 7am. that window is when your muscles are most primed to absorb nutrients and rebuild. if you can't eat immediately after, don't stress — 1-2 hours is still fine, just don't let it slip past that.

a quick combo: whey shake + banana right after the gym (takes 2 min), then a fuller meal like eggs + oats + fruit when you get to work or home. that way you're not forcing down a huge meal at 6:30am when you're still catching your breath.
- products: 1 item(s)
- status=200 latency=6.17s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=640
  - [PASS] latency_lt: 6.2s (ceiling 45s)
- needs_judge: ['uses_user_context']


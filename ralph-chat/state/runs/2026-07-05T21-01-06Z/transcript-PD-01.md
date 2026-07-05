# PD-01
## turn 0 ('what do you actually know about me so far?')
**user:** what do you actually know about me so far?
**assistant:** here's what i've got:

**who you are:** 23, female, 156.1cm tall, 59.8kg

**your schedule:** wake at 7am, sleep at 11pm, prefer working out at 8am

**your goals:** hairmax and bonemax are top priority. also want to lose fat.

**fitness side:** beginner, no equipment, training 4 days a week

**skin & hair:** oily skin, no active concerns right now. hair's starting to thin (unsure if family history plays a role), not on any treatments yet.

**lifestyle:** moderate activity level, 4-6 hours of screen time daily, based in new york

**how i should talk to you:** direct, no fluff

that's the baseline. everything else i learn comes from what you tell me in our chats, and i remember it going forward. what's on your mind?
- status=200 latency=9.95s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=722
  - [PASS] latency_lt: 10.0s (ceiling 45s)
- needs_judge: ['uses_user_context']


# ONB-01
## turn 0 ('I want to start my FitMax schedule.')
**user:** I want to start my FitMax schedule.
**assistant:** let's get your fit schedule going. what're you chasing right now?
- choices: ['Drop fat, get leaner', 'Build muscle, add size', 'Lean out and build at the same time', "Hold what I've got", 'Get stronger and more athletic'] (multi=False)
- status=200 latency=3.0s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 3.0s (ceiling 45s)

## turn 1 ('build muscle')
**user:** build muscle
**assistant:** got it. how long you been lifting?
- choices: ['Under a year, still learning the lifts', '1 to 3 years, I know the main lifts', '3+ years, I program on purpose'] (multi=False)
- status=200 latency=1.18s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 1.2s (ceiling 45s)

## turn 2 ('beginner')
**user:** beginner
**assistant:** got it. what're you training with?
- choices: ['Full gym, bars and machines', 'Home setup with a barbell and rack', 'Dumbbells at home, maybe bands', 'Bodyweight, no equipment'] (multi=False)
- status=200 latency=1.33s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 1.3s (ceiling 45s)

## turn 3 ('180')
**user:** 180
**assistant:** didn't quite catch that — what're you training with?
- choices: ['Full gym, bars and machines', 'Home setup with a barbell and rack', 'Dumbbells at home, maybe bands', 'Bodyweight, no equipment'] (multi=False)
- status=200 latency=0.84s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 0.8s (ceiling 45s)

## turn 4 ('75')
**user:** 75
**assistant:** didn't quite catch that — what're you training with?
- choices: ['Full gym, bars and machines', 'Home setup with a barbell and rack', 'Dumbbells at home, maybe bands', 'Bodyweight, no equipment'] (multi=False)
- status=200 latency=1.11s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 1.1s (ceiling 45s)

## turn 5 ('22')
**user:** 22
**assistant:** didn't quite catch that — what're you training with?
- choices: ['Full gym, bars and machines', 'Home setup with a barbell and rack', 'Dumbbells at home, maybe bands', 'Bodyweight, no equipment'] (multi=False)
- status=200 latency=0.76s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 0.8s (ceiling 45s)

## turn 6 ('male')
**user:** male
**assistant:** didn't quite catch that — what're you training with?
- choices: ['Full gym, bars and machines', 'Home setup with a barbell and rack', 'Dumbbells at home, maybe bands', 'Bodyweight, no equipment'] (multi=False)
- status=200 latency=0.76s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 0.8s (ceiling 45s)

## turn 7 ('dumbbells at home')
**user:** dumbbells at home
**assistant:** got it. how many days a week can you actually train?
- status=200 latency=1.24s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 1.2s (ceiling 45s)

## turn 8 ('4')
**user:** 4
**assistant:** got it. how long you got per session, most days?
- status=200 latency=1.31s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 1.3s (ceiling 45s)

## turn 9 ('45')
**user:** 45
**assistant:** got it. outside the gym, how much do you move?
- choices: ['Desk job, sitting most of the day', 'On my feet here and there', 'Active job or moving most days', 'Manual work or hard training daily'] (multi=False)
- status=200 latency=2.06s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 2.1s (ceiling 45s)

## turn 10 ('moderate')
**user:** moderate
**assistant:** didn't quite catch that — outside the gym, how much do you move?
- choices: ['Desk job, sitting most of the day', 'On my feet here and there', 'Active job or moving most days', 'Manual work or hard training daily'] (multi=False)
- status=200 latency=0.78s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 0.8s (ceiling 45s)

## turn 11 ('none')
**user:** none
**assistant:** didn't quite catch that — outside the gym, how much do you move?
- choices: ['Desk job, sitting most of the day', 'On my feet here and there', 'Active job or moving most days', 'Manual work or hard training daily'] (multi=False)
- status=200 latency=0.83s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] latency_lt: 0.8s (ceiling 45s)

## turn 12 ('(final check on last response)')
**assistant:** didn't quite catch that — outside the gym, how much do you move?
- choices: ['Desk job, sitting most of the day', 'On my feet here and there', 'Active job or moving most days', 'Manual work or hard training daily'] (multi=False)
- status=200 latency=0.0s error=None
- checks:
  - [PASS] no_friendly_error: clean


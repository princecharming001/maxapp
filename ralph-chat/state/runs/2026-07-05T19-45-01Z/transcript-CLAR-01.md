# CLAR-01
## turn 0 ('i want to start working out')
**user:** i want to start working out
**assistant:** what's the main goal?
- choices: ['build muscle', 'lose fat', 'get stronger', 'general fitness', 'Something else'] (multi=False)
- status=200 latency=2.92s error=None
- checks:
  - [PASS] choices_present: choices=['build muscle', 'lose fat', 'get stronger', 'general fitness', 'Something else']
  - [PASS] latency_lt: 2.9s (ceiling 5s)


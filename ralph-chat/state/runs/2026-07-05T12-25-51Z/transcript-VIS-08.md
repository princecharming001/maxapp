# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** **7–9 hours** nightly is the target for muscle growth and recovery. that's the only sleep metric in your fitmax protocol. the docs don't break down specific growth rates by sleep duration or what happens at 6 vs 8 hours, just the range. on training days, add a wind-down cue 60 minutes before bed to hit that window consistently.
- status=200 latency=8.44s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=329
  - [PASS] latency_lt: 8.4s (ceiling 60s)
  - [FAIL] block_present: types present: []
- needs_judge: ['answers_the_question']


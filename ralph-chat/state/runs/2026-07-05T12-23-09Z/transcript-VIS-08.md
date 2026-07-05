# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** here's what your protocol says on sleep and muscle growth: **7-9 hours** nightly is the target. on training days, add a wind-down cue 60 minutes before bed to lock it in. that's it—the docs don't break down the specific muscle-protein synthesis numbers or recovery windows beyond the sleep duration itself. the bigger muscle-growth levers in your protocol are protein (1g per lb bodyweight, so roughly **98g daily** for you), progressive overload on compounds, and staying close to failure (RIR 0-2 on the last set). sleep anchors all three, but the docs treat it as a schedule input, not a detailed mechanism.
- products: 1 item(s)
- status=200 latency=15.55s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=610
  - [PASS] latency_lt: 15.5s (ceiling 60s)
  - [FAIL] block_present: types present: []
- needs_judge: ['answers_the_question']


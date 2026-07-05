# VIS-02
## turn 0 ('make me a table: 3-day beginner workout split, exercises/sets/reps')
**user:** make me a table: 3-day beginner workout split, exercises/sets/reps
**assistant:** 3-day full body is your best bet as a beginner — you hit each muscle 3× per week, learn movement patterns, and recover well. here's the split:

**key rules:**
1. **start with weights you** can control for the full rep range with good form.
2. **when you hit the** top of the range (e.g., 8 reps on squats) for 2 sessions straight, add 2.5–5 lb next time.
3. **last set of compounds** close to failure (1–2 reps left); earlier sets at 2–3 reps in reserve.
4. **lateral raises and face** pulls every session — they build shoulder health and rear delt size, both critical for aesthetics.
5. **rest 2** –3 min between heavy compounds, 60–90 sec between isolation.

you've got a pull-up bar at home, so use it for pull-ups on wed/fri instead of lat pulldown if you can. if not yet, lat pulldown or assisted machine works fine.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full body",
    "data": {
      "columns": [
        "exercise",
        "day 1 (mon)",
        "day 2 (wed)",
        "day 3 (fri)"
      ],
      "rows": [
        [
          "squat or leg press",
          "4\u00d76-8",
          "4\u00d76-8",
          "3\u00d78-10"
        ],
        [
          "bench press or push-ups",
          "4\u00d76-8",
          "\u2014",
          "3\u00d78-10"
        ],
        [
          "rows (barbell or machine)",
          "4\u00d76-8",
          "\u2014",
          "3\u00d78-10"
        ],
        [
          "deadlift or rdl",
          "\u2014",
          "4\u00d75-6",
          "\u2014"
        ],
        [
          "overhead press",
          "\u2014",
          "3\u00d78-10",
          "3\u00d78-10"
        ],
        [
          "pull-ups or lat pulldown",
          "\u2014",
          "3\u00d78-10",
          "3\u00d78-10"
        ],
        [
          "lateral raises",
          "3\u00d710-12",
          "3\u00d710-12",
          "3\u00d710-12"
        ],
        [
          "face pulls",
          "3\u00d712-15",
          "3\u00d712-15",
          "3\u00d712-15"
        ],
        [
          "leg curl or hamstring curl",
          "2\u00d710-12",
          "2\u00d710-12",
          "\u2014"
        ],
        [
          "dips or tricep pushdown",
          "\u2014",
          "2\u00d78-10",
          "2\u00d78-10"
        ],
        [
          "barbell curl or dumbbell curl",
          "\u2014",
          "2\u00d78-10",
          "2\u00d78-10"
        ]
      ]
    }
  }
]
```
- status=200 latency=19.14s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=821
  - [PASS] latency_lt: 19.1s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']


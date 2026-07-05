# VIS-02
## turn 0 ('give me a 3-day beginner gym split as a table with exercises, sets and reps')
**user:** give me a 3-day beginner gym split as a table with exercises, sets and reps
**assistant:** here's a 3-day full body split for beginners. each day hits all major muscle groups with compound lifts first, then isolation work. rest days between sessions let you recover properly. aim to finish each set with 0–3 reps left in the tank. pick one exercise per body part, nail the form, and progress the weight when you can hit the top of your rep range for two sessions straight.  run this mon / wed / fri. log every set and weight so you can track progression. don't swap exercises every week — stick with these for 6–8 weeks minimum.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full body split",
    "data": {
      "columns": [
        "body part",
        "exercise",
        "sets",
        "reps"
      ],
      "rows": [
        [
          "chest",
          "low-incline dumbbell press",
          "3",
          "6\u20138"
        ],
        [
          "back",
          "chest-supported row",
          "3",
          "6\u20138"
        ],
        [
          "legs",
          "leg press",
          "3",
          "8\u201310"
        ],
        [
          "shoulders",
          "machine shoulder press",
          "2",
          "8\u201310"
        ],
        [
          "biceps",
          "preacher curl",
          "2",
          "8\u201310"
        ],
        [
          "triceps",
          "cable pushdown",
          "2",
          "10\u201312"
        ],
        [
          "chest",
          "pec deck",
          "2",
          "10\u201312"
        ],
        [
          "back",
          "neutral-grip pulldown",
          "2",
          "8\u201310"
        ],
        [
          "legs",
          "lying leg curl",
          "2",
          "10\u201312"
        ],
        [
          "calves",
          "standing calf raise",
          "2",
          "12\u201315"
        ]
      ]
    }
  }
]
```
- status=200 latency=22.6s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=537
  - [PASS] latency_lt: 22.6s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']


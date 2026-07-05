# VIS-13
## turn 0 ("make me a table where one cell contains a pipe character, like 'AM | PM'")
**user:** make me a table where one cell contains a pipe character, like 'AM | PM'
**assistant:** got it — you escape the pipe with a backslash. here's a table with `am | pm` in one cell:

the backslash tells the markdown parser to treat the pipe as a literal character, not a column separator.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "sample schedule",
    "data": {
      "columns": [
        "time",
        "activity"
      ],
      "rows": [
        [
          "am \\| pm",
          "morning and evening routine"
        ],
        [
          "midday",
          "lunch and workout"
        ]
      ]
    }
  }
]
```
- status=200 latency=10.32s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=196
  - [PASS] latency_lt: 10.3s (ceiling 60s)
- needs_judge: ['answers_the_question']


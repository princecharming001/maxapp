# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** here's what the research says about sleep and muscle growth:  the big one: most of your daily GH pulse happens in the first 2 hours of sleep, and that's where the growth signal lives. drop below 6 hours and your test tanks 10–15% in a week. consistency matters as much as duration — same bedtime within 30 minutes beats sleeping 12 hours on weekends.
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "7\u20139 hours",
          "label": "nightly sleep target for optimal hypertrophy",
          "hint": "consistent window, \u00b130 min"
        },
        {
          "value": "70\u201380%",
          "label": "daily growth hormone released during slow-wave sleep",
          "hint": "peaks in first 2 hours"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone drop from sleep deprivation (<6 hr/night)",
          "hint": "happens within one week"
        },
        {
          "value": "65\u201368\u00b0f",
          "label": "ideal room temperature for deep-sleep architecture",
          "hint": "18\u201320\u00b0c"
        },
        {
          "value": "60 minutes",
          "label": "pre-sleep wind-down to improve slow-wave quality",
          "hint": "cut stimulation before bed"
        }
      ]
    }
  }
]
```
- status=200 latency=11.4s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=350
  - [PASS] latency_lt: 11.4s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


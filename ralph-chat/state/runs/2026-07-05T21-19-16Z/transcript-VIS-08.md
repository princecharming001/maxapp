# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** sleep is the master variable. **7–9 hours** drives GH pulses, testosterone, and recovery between sessions. cut below **6 hours** and you lose **10–15% testosterone** within a week.

the first **2 hours** of sleep matter most: that's when **~70–80% of your daily growth hormone** gets released. on the muscle side: you're looking at **0.25–0.5 lb/week** as an intermediate lifter, with muscle protein synthesis staying elevated for **24–48 hours** post-training.

hit **10–20 hard sets per muscle group** per week; past that you're just adding fatigue, not growth.
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
          "label": "optimal sleep for muscle growth",
          "hint": "consistent window, \u00b130 min"
        },
        {
          "value": "~70\u201380%",
          "label": "daily growth hormone released during slow-wave sleep",
          "hint": "within first 2 hours of sleep"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone reduction from sleep deprivation (<6 hr/night)",
          "hint": "occurs within one week"
        },
        {
          "value": "0.25\u20130.5 lb/week",
          "label": "natural muscle gain rate (intermediate lifters)",
          "hint": "0.5\u20132 lb/month"
        },
        {
          "value": "24\u201348 hours",
          "label": "muscle protein synthesis window post-training",
          "hint": "peaks 4\u20136 hours after session"
        },
        {
          "value": "10\u201320 sets",
          "label": "weekly volume sweet spot per muscle group",
          "hint": "growth drops off past 20 sets"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=10.38s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 6 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=563
  - [PASS] latency_lt: 10.4s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


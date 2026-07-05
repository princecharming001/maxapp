# VIS-08
## turn 0 ('summarize the key stats on sleep and muscle growth — bold the numbers')
**user:** summarize the key stats on sleep and muscle growth — bold the numbers
**assistant:** sleep and muscle growth are locked together. here's what moves the needle.  the chain is simple: bad sleep tanks testosterone and GH, which kills the growth signal even if you're training hard. you need 7–9 hours consistently. if you're under 6, you're losing 10–15% test within a week. that's not a small thing. on the muscle side, you grow ~0.25–0.5 lb/week as an intermediate lifter if everything else is dialed. that means 10–20 hard sets per muscle per week, training each muscle 2–3 times, and staying within 0–3 reps of failure on your working sets. more volume past 20 sets doesn't help. protein synthesis stays elevated for 24–48 hours post-training, so spacing sessions out matters. the sleep part is non-negotiable. 70–80% of your daily GH comes during slow-wave sleep in the first 2 hours, so a cool dark room (65–68°f) and a 60-minute wind-down before bed actually move the needle.
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
          "label": "nightly sleep target for optimal growth",
          "hint": "consistent window \u00b130 min"
        },
        {
          "value": "70\u201380%",
          "label": "daily growth hormone released during slow-wave sleep",
          "hint": "happens in first 2 hours"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone drop from sleep deprivation (<6 hr/night)",
          "hint": "within one week"
        },
        {
          "value": "0.25\u20130.5 lb/week",
          "label": "natural muscle gain rate (intermediate lifters)",
          "hint": "1\u20132 lb/month for beginners year one"
        },
        {
          "value": "10\u201320 sets",
          "label": "weekly volume sweet spot per muscle group",
          "hint": "growth plateaus past 20"
        },
        {
          "value": "24\u201348 hours",
          "label": "muscle protein synthesis window post-training",
          "hint": "peaks 4\u20136 hours after session"
        },
        {
          "value": "65\u201368\u00b0f",
          "label": "ideal room temperature for deep sleep",
          "hint": "18\u201320\u00b0c"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=16.66s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 7 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=894
  - [PASS] latency_lt: 16.7s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


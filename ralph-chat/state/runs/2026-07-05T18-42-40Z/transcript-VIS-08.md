# VIS-08
## turn 0 ('summarize the key stats on sleep and muscle growth — bold the numbers')
**user:** summarize the key stats on sleep and muscle growth — bold the numbers
**assistant:** sleep and muscle growth are locked together. here's what the numbers say. **sleep targets:**
- **7–9 hours** nightly for optimal growth - **70–80% of daily growth hormone** releases during slow-wave sleep, within the first 2 hours - **10–15% testosterone drop** within a week if you're under 6 hours - **60-minute wind-down** before bed measurably improves deep-sleep quality - **65–68°f room temperature** is linked to better deep-sleep architecture **muscle growth rates tied to recovery:**
- **0.25–0.5 lb/week** (0.5–2 lb/month) for intermediate lifters; beginners can hit 1–2 lb/month in year one - **24–48 hours** is the muscle protein synthesis window post-training; peaks at 4–6 hours - **25–40 g protein per meal** maximizes per-meal muscle protein synthesis - **10–20 hard sets per muscle group weekly** is the sweet spot; growth drops past 20 the bottom line: sleep debt kills testosterone and GH, which kills growth. you're at 23:00 bedtime and 07:00 wake, so you're hitting 8 hours if you fall asleep on time. keep the room cool and dark, phone out of reach, and you're set.
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
          "label": "nightly sleep target for growth",
          "hint": "consistent window \u00b130 min"
        },
        {
          "value": "70\u201380%",
          "label": "daily GH released in first 2 hours of sleep",
          "hint": "slow-wave sleep is where it happens"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone drop per week under 6 hours",
          "hint": "recovery debt compounds fast"
        },
        {
          "value": "0.25\u20130.5 lb/week",
          "label": "natural muscle gain rate (intermediate)",
          "hint": "only happens with sleep + food + training"
        },
        {
          "value": "24\u201348 hours",
          "label": "muscle protein synthesis window post-training",
          "hint": "peaks 4\u20136 hours after session"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=17.55s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1087
  - [PASS] latency_lt: 17.6s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


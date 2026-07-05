# VIS-08
## turn 0 ('summarize the key stats on sleep and muscle growth — bold the numbers')
**user:** summarize the key stats on sleep and muscle growth — bold the numbers
**assistant:** sleep and muscle growth are tightly linked. here's what the numbers show: **sleep targets for growth:**
1. **7–9 hours** nightly is the evidence-based baseline - **70–80% of daily growth hormone** releases during slow-wave sleep in the first **2 hours** after you fall asleep - **10–15% testosterone drop** within a week if you're under **6 hours/night** **muscle growth rates tied to recovery:**
2. **0.25–0.5 lb/week** (intermediate lifters) or **0.5–2 lb/month** (beginners in year one) — all contingent on adequate sleep - **24–48 hours** is the muscle protein synthesis window post-training; peaks **4–6 hours** after a session - **10–20 hard sets per muscle group weekly** is the sweet spot; growth plateaus past **20 sets** **sleep quality levers:**
3. **60-minute wind-down** (no screens) measurably improves deep-sleep quality - **65–68°f (18–20°c)** room temp is linked to better deep-sleep architecture
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
          "label": "nightly sleep target for hypertrophy"
        },
        {
          "value": "70\u201380%",
          "label": "daily GH released during first 2 hours of sleep"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone drop per week below 6 hours/night"
        },
        {
          "value": "0.25\u20130.5 lb/week",
          "label": "natural muscle gain rate (intermediate)"
        },
        {
          "value": "10\u201320 sets",
          "label": "weekly volume sweet spot per muscle group"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=18.08s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=913
  - [PASS] latency_lt: 18.1s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


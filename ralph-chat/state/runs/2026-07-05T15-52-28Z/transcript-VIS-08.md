# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** here's what the docs say on sleep and muscle growth: **7–9 hours** nightly is the target for optimal recovery and hypertrophy. **~70–80% of daily growth hormone** releases during slow-wave sleep in the first 2 hours. **sleep deprivation under 6 hours** cuts testosterone by **10–15%** within a week and suppresses GH pulse amplitude. a **60-minute wind-down** before bed measurably improves slow-wave sleep quality. room temp of **65–68°f (18–20°c)** is linked to better deep-sleep architecture. on the muscle side: **0.25–0.5 lb/week** (intermediate lifters); beginners can hit **1–2 lb/month** in year one. **muscle protein synthesis peaks 4–6 hours** post-training and stays elevated **24–48 hours**. **25–40 g protein per meal** maximizes per-meal MPS. **10–20 hard sets per muscle group weekly** is the sweet spot; growth drops past 20.
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
          "label": "daily growth hormone released during slow-wave sleep"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone reduction from <6 hr/night sleep (within 1 week)"
        },
        {
          "value": "0.25\u20130.5 lb/week",
          "label": "natural muscle gain rate (intermediate lifters)"
        },
        {
          "value": "4\u20136 hours",
          "label": "peak muscle protein synthesis post-training"
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
- status=200 latency=10.92s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 6 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=841
  - [PASS] latency_lt: 10.9s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


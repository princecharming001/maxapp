# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** here are the sleep and muscle growth numbers from your protocol: **7–9 hours** is the evidence-based target for optimal recovery and hypertrophy. **~70–80% of daily growth hormone** is released during slow-wave sleep (within the first 2 hours of sleep). sleep deprivation under **6 hours per night** reduces testosterone by **10–15%** within a week and suppresses GH pulse amplitude.

a **60-minute sleep wind-down** measurably improves slow-wave sleep quality. room temperature **65–68°f (18–20°c)** is linked to better deep-sleep architecture.

on the muscle side: **0.25–0.5 lb per week** (0.5–2 lb per month) for intermediate lifters; beginners can hit **1–2 lb per month** in the first year. **muscle protein synthesis** stays elevated for **24–48 hours** post-training and peaks **4–6 hours** after a session. hit **25–40 g protein per meal** to maximize per-meal MPS.

train each muscle **10–20 hard sets per week**; growth drops off past **20 sets** for most people.
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
          "label": "nightly sleep target for hypertrophy",
          "hint": "consistent window \u00b130 min"
        },
        {
          "value": "70\u201380%",
          "label": "daily growth hormone released during slow-wave sleep",
          "hint": "first 2 hours of sleep"
        },
        {
          "value": "10\u201315%",
          "label": "testosterone reduction from <6 hr sleep",
          "hint": "within one week"
        },
        {
          "value": "0.25\u20130.5 lb/week",
          "label": "natural muscle gain rate (intermediate)",
          "hint": "0.5\u20132 lb/month"
        },
        {
          "value": "24\u201348 hours",
          "label": "muscle protein synthesis window post-training",
          "hint": "peaks 4\u20136 hours after session"
        },
        {
          "value": "25\u201340 g",
          "label": "protein per meal for max MPS",
          "hint": "leucine threshold ~2\u20133 g"
        },
        {
          "value": "10\u201320 sets",
          "label": "weekly volume sweet spot per muscle",
          "hint": "growth drops past 20 sets"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=12.25s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 7 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=974
  - [PASS] latency_lt: 12.2s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']


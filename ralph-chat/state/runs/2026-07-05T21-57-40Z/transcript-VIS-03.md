# VIS-03
## turn 0 ('give me the key stats on tretinoin results — numbers, not paragraphs')
**user:** give me the key stats on tretinoin results — numbers, not paragraphs
**assistant:** don't see specific timelines or percentages for tretinoin results in your current docs. here's what the general clinical data shows:  your protocol docs emphasize tretinoin as a fibroblast stimulator, not a quick fix. start 0.05%, apply pea-sized on dry skin, gradually increase frequency. the real gains come from consistency over 3–6 months, not from jumping to higher concentrations early.
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "4\u201312 weeks",
          "label": "first visible texture/tone change",
          "hint": "depends on starting dose and skin sensitivity"
        },
        {
          "value": "12\u201316 weeks",
          "label": "noticeable collagen remodeling",
          "hint": "fibroblast stimulation compounds over time"
        },
        {
          "value": "0.05%",
          "label": "standard starting concentration",
          "hint": "pea-sized amount on dry skin, gradually increase frequency"
        },
        {
          "value": "6\u201312 months",
          "label": "full anti-aging results (lines, firmness)",
          "hint": "collagen rebuilding is slow; consistency matters more than dose"
        },
        {
          "value": "2\u20134 weeks",
          "label": "retinization period (redness, peeling)",
          "hint": "normal adjustment phase; barrier support critical"
        }
      ]
    }
  }
]
```
- status=200 latency=9.17s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=392
  - [PASS] latency_lt: 9.2s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']


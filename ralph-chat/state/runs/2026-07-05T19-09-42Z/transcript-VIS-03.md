# VIS-03
## turn 0 ('what results can i expect from tretinoin? hit me with the key numbers')
**user:** what results can i expect from tretinoin? hit me with the key numbers
**assistant:** you're asking for the numbers on tretinoin results. the docs are thin on specific timelines and percentages, so i'm filling this with clinical standards.  key context: tretinoin works by stimulating fibroblasts and increasing cell turnover. it's not a quick fix. most people see texture smoothing first (4–8 weeks), then deeper collagen changes (12+ weeks). pigmentation takes longer because you're waiting for melanin-loaded cells to shed. the catch: you have to actually use it consistently and not tank your barrier. over-exfoliating or stacking too many actives kills the results. spf is non-negotiable or uv will undo the pigmentation work.
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
          "label": "first visible texture/smoothness change",
          "hint": "depends on starting dose and skin condition"
        },
        {
          "value": "8\u201316 weeks",
          "label": "noticeable collagen remodeling (fine lines, firmness)",
          "hint": "tretinoin stimulates fibroblasts continuously"
        },
        {
          "value": "12\u201324 weeks",
          "label": "significant pigmentation fade and skin clarity",
          "hint": "requires consistent use + SPF"
        },
        {
          "value": "0.05%",
          "label": "standard starting dose",
          "hint": "apply pea-sized on dry skin, gradually increase frequency"
        },
        {
          "value": "6\u201312 months",
          "label": "full anti-aging transformation (texture, tone, elasticity)",
          "hint": "collagen rebuilding is slow but compounding"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=12.2s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=645
  - [PASS] latency_lt: 12.2s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']


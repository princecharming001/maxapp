# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** your skin's oily, so this is built around controlling sebum, keeping your barrier intact, and letting actives work without irritation. you've got intermediate experience, so we're not babying it — but we're not stacking everything at once either.

start with the core four: a solid cleanser, one active (azelaic or niacinamide), a hydrating serum, and spf. add retinoid in week 3 once your skin settles. that's how you build without breaking your barrier.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "core skincare products by step",
    "data": {
      "columns": [
        "step",
        "morning",
        "evening",
        "frequency",
        "why"
      ],
      "rows": [
        [
          "cleanser",
          "cerave foaming facial cleanser",
          "cerave foaming facial cleanser",
          "2\u00d7 daily",
          "removes oil and buildup so actives penetrate"
        ],
        [
          "active",
          "niacinamide 10% + zinc 1%",
          "\u2014",
          "am only",
          "controls sebum, tightens pores, no irritation"
        ],
        [
          "treatment serum",
          "vitamin c (optional)",
          "centella or panthenol",
          "daily",
          "supports barrier, reduces inflammation"
        ],
        [
          "hydrating serum",
          "hyaluronic acid",
          "hyaluronic acid",
          "2\u00d7 daily",
          "pulls water in, improves plumpness"
        ],
        [
          "moisturizer",
          "lightweight gel-cream",
          "lightweight gel-cream",
          "2\u00d7 daily",
          "locks hydration, ceramides repair barrier"
        ],
        [
          "retinoid",
          "\u2014",
          "0.05% tretinoin (week 3+)",
          "3\u00d7 per week pm",
          "builds collagen, improves texture"
        ],
        [
          "spf",
          "spf 50+ (beauty of joseon)",
          "\u2014",
          "am only",
          "blocks uv, prevents pigmentation"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week skincare build",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + niacinamide am + hydrating serum + moisturizer + spf. twice daily. let your skin adjust, no retinoid yet. watch for irritation or dryness."
        },
        {
          "label": "week 3: add retinoid",
          "detail": "introduce 0.05% tretinoin on monday, wednesday, friday evenings only. apply on completely dry skin, pea-sized amount. skip other actives on retinoid nights."
        },
        {
          "label": "week 4\u20136: stabilize",
          "detail": "continue 3\u00d7 per week retinoid. skin texture improves, pores appear smaller. if no irritation, you can move to 4\u00d7 per week (m, w, f, sun)."
        },
        {
          "label": "week 7\u20138: assess & adjust",
          "detail": "first visible changes: smoother texture, less oiliness, subtle glow. if barrier feels damaged (red, flaky), dial back to 2\u00d7 per week. if thriving, stay at current frequency."
        }
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=18.34s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=455
  - [PASS] latency_lt: 18.3s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


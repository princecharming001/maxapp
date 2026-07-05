# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** # complete skincare starter guide you're starting from zero, so the priority is barrier health first, then one active. no product stacking, no exfoliating acids yet. here's the full system. --- ## core principle
your barrier is the foundation. damaged barrier = products don't work, skin gets worse. build with ceramides + panthenol, add one active only after 4 weeks, always use SPF. ---  ---  ---  ---  --- ## what NOT to do (week 1–4)
no exfoliating acids, no scrubs, no vitamin c, no retinoids yet. over-exfoliating damages the barrier and makes acne worse. one active at a time, always. product overload reduces absorption and overwhelms skin. ## after week 8
if skin is stable (no redness, no stinging), you can add a second active,but only if the first is working and you're consistent. still no stacking acids + retinoids in the same routine.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "product stack by skin type",
    "data": {
      "columns": [
        "step",
        "oily/acne-prone",
        "dry/sensitive",
        "combination"
      ],
      "rows": [
        [
          "cleanser",
          "gentle daily cleanser",
          "gentle, once daily or skip PM",
          "gentle daily"
        ],
        [
          "hydrator",
          "lightweight hydrator + niacinamide",
          "rich moisturizer + ceramides + panthenol",
          "hydrator on cheeks, lighter on t-zone"
        ],
        [
          "active (week 5+)",
          "azelaic AM or adapalene PM",
          "retinoid PM (low dose)",
          "azelaic AM, retinoid PM"
        ],
        [
          "SPF",
          "daily, broad-spectrum SPF 30+",
          "daily, broad-spectrum SPF 30+",
          "daily, broad-spectrum SPF 30+"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week starter timeline",
    "data": {
      "steps": [
        {
          "label": "week 1\u20134: barrier repair",
          "detail": "cleanse + hydrate + SPF only. no actives. let skin stabilize. watch for persistent redness, stinging, or dryness\u2014signs of barrier damage."
        },
        {
          "label": "week 5\u20136: introduce one active",
          "detail": "add azelaic (AM, oily skin) or low-dose retinoid (PM, dry skin). use 2\u20133x per week. pair with panthenol-rich moisturizer."
        },
        {
          "label": "week 7\u20138: assess & adjust",
          "detail": "if no irritation, increase active frequency. if stinging or flaking, pause and repair barrier for 1\u20132 weeks. do not stack actives yet."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "pick your skin type (oily/acne, dry/sensitive, or combo)",
        "buy: gentle cleanser, ceramide + panthenol moisturizer, broad-spectrum SPF 30+",
        "weeks 1\u20134: AM (cleanse, moisturize, SPF) + PM (cleanse, moisturize). nothing else.",
        "week 5: introduce azelaic (AM) or retinoid (PM) at lowest dose, 2\u20133x per week",
        "week 6+: increase frequency only if zero irritation. never stack two actives.",
        "daily: SPF is non-negotiable. UV worsens pigmentation and breaks down collagen.",
        "monitor: redness, stinging, dryness, flaking. if present, pause actives and repair barrier."
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "4 weeks",
          "label": "barrier stabilization time",
          "hint": "before adding any active"
        },
        {
          "value": "1 active",
          "label": "maximum at a time",
          "hint": "stacking acids + retinoids overwhelms skin"
        },
        {
          "value": "SPF 30+",
          "label": "non-negotiable daily",
          "hint": "UV worsens pigmentation and collagen breakdown"
        },
        {
          "value": "2\u20133x/week",
          "label": "starting frequency for actives",
          "hint": "increase only after 2 weeks with zero irritation"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=16.75s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=850
  - [PASS] latency_lt: 16.7s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


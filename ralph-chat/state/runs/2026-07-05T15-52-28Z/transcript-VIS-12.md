# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** here's your complete skincare starter system. start with the basics — cleanser, moisturizer, spf — then layer in treatments as your barrier strengthens.

---

## product lineup

start with niacinamide before retinoids — it's gentler and repairs your barrier first.

---

## your 12-week timeline

---

## action checklist
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "skincare starter kit",
    "data": {
      "columns": [
        "step",
        "product type",
        "best pick",
        "when",
        "why"
      ],
      "rows": [
        [
          "1",
          "cleanser",
          "cerave hydrating",
          "am + pm",
          "removes oil & buildup without stripping"
        ],
        [
          "2",
          "toner/essence",
          "cosrx snail 96",
          "pm (optional am)",
          "hydration layer; preps skin for actives"
        ],
        [
          "3",
          "active",
          "niacinamide 4%",
          "3\u20134x/week pm",
          "reduces redness, supports barrier"
        ],
        [
          "4",
          "moisturizer",
          "cerave pm lotion",
          "am + pm",
          "ceramides lock hydration in"
        ],
        [
          "5",
          "occlusive",
          "cerave tub (heavy)",
          "pm only",
          "seal barrier when very dry"
        ],
        [
          "6",
          "spf",
          "beauty of joseon 50+",
          "am only",
          "non-negotiable uv block"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "dark circles + dry skin recovery",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + moisturizer am/pm only. let skin adjust. no actives yet. goal: establish routine without irritation."
        },
        {
          "label": "week 3\u20134: add hydration",
          "detail": "introduce cosrx essence pm. skin feels plumper, barrier begins healing. still no actives."
        },
        {
          "label": "week 5\u20136: first active",
          "detail": "add niacinamide 4% 2x/week pm. watch for dryness. redness and dark circle puffiness start to ease."
        },
        {
          "label": "week 7\u20138: frequency up",
          "detail": "niacinamide 3\u20134x/week. dark circles less pronounced. barrier noticeably stronger, less reactive."
        },
        {
          "label": "week 9\u201312: maintenance",
          "detail": "steady routine locked in. consider gentle retinoid (0.025% retinol) 1x/week if barrier is solid. dark circles continue fading."
        }
      ]
    }
  }
]
```
- products: 6 item(s)
- status=200 latency=18.81s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=321
  - [PASS] latency_lt: 18.8s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


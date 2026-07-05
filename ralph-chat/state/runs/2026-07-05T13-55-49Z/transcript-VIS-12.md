# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** here's your complete skincare foundation—built for combination skin with dark circles.

---

**the product stack**

start with these five pillars. one active at a time, always.

---

**timeline: what to expect**

---

**action checklist: first week**

---

**key stats**
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "skincare starter stack",
    "data": {
      "columns": [
        "step",
        "product type",
        "role",
        "frequency"
      ],
      "rows": [
        [
          "1",
          "cleanser",
          "remove oil, dirt, sunscreen",
          "2\u00d7 daily (am + pm)"
        ],
        [
          "2",
          "hydrating toner",
          "prep skin, expand cells",
          "am + pm (optional, but helps absorption)"
        ],
        [
          "3",
          "active",
          "retinoid or niacinamide (not both yet)",
          "pm retinoid 2\u20133\u00d7/week; am niacinamide daily"
        ],
        [
          "4",
          "serum",
          "vitamin c (am) or centella/panthenol (pm)",
          "daily, after active"
        ],
        [
          "5",
          "moisturizer",
          "lock hydration, repair barrier",
          "am + pm"
        ],
        [
          "6",
          "spf 30+",
          "block uv damage and pigmentation",
          "am only, non-negotiable"
        ]
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "get a gentle cleanser (cerave hydrating or foaming)",
        "buy a basic ceramide moisturizer (cerave pm)",
        "get spf 30+ (mineral or chemical, daily-wear)",
        "optional: hydrating toner to boost absorption",
        "plan: cleanser + moisturizer + spf for 2 weeks before adding any active",
        "set phone reminder for am spf (7:15 am, right after shower)"
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=18.35s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=270
  - [PASS] latency_lt: 18.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


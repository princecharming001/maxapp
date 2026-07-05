# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** **your oily-skin starter routine:**

1. **cleanse** — removes oil buildup so actives reach skin. morning + night.
2. **niacinamide** — controls sebum and shrinks pore appearance. once daily (start pm).
3. **sunscreen** — blocks uv damage and prevents oiliness from worsening. am only, non-negotiable.
4. **moisturizer** — locks hydration; prevents rebound oil. pm only.

start here. one active (niacinamide). no acids, no retinoids yet. your barrier needs time.

---
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "first 8 weeks: what to expect",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "skin may feel slightly dry as barrier adjusts. stick with the routine. no new products yet."
        },
        {
          "label": "week 3\u20134",
          "detail": "oiliness stabilizes. pores look slightly refined. if skin is calm, you can add a second product (optional: gentle exfoliant 1x/week)."
        },
        {
          "label": "week 5\u20136",
          "detail": "first visible refinement in texture. skin feels more balanced. this is when you lock in the habit."
        },
        {
          "label": "week 7\u20138",
          "detail": "clearer, more even skin tone. you can assess if you need actives beyond niacinamide (e.g., azelaic acid for redness if it develops)."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "grab the cerave foaming cleanser \u2014 non-stripping, designed for oily skin",
        "get the ordinary niacinamide 10% + zinc \u2014 controls sebum, affordable",
        "pick the beauty of joseon spf 50+ \u2014 no white cast, elegant finish",
        "use cleanser twice daily (morning shower, before bed)",
        "apply niacinamide to clean, dry skin at night; wait 60 seconds before moisturizer",
        "use moisturizer every night (even oily skin needs it \u2014 prevents rebound oil)",
        "apply spf every morning, 15 min before leaving the house",
        "don't add anything else for 4 weeks \u2014 let your skin adapt"
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=16.39s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=466
  - [PASS] latency_lt: 16.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


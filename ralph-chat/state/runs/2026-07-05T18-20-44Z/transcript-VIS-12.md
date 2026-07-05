# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** **morning routine:**
1. cleanser — cerave foaming (oily skin loves it, won't leave residue)
2. **hydrating serum** — hyaluronic acid or beta-glucan, pulls water into skin
3. **lightweight moisturizer** — gel or lotion, not cream
4. **spf 50** — beauty of joseon rice spf is elegant, no white cast

**evening routine:**
5. cleanser — same foaming cleanser
6. active (optional for now) — skip this until you're 2 weeks in; then pick one: niacinamide (pore control), azelaic acid (gentle, anti-inflammatory), or a low % retinoid
7. moisturizer — same lightweight one

start with cleanser + moisturizer + spf for 2 weeks. that's it. let your skin adjust. then add one active if you want to refine texture or pore size.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "oily skin starter products",
    "data": {
      "columns": [
        "step",
        "am",
        "pm",
        "purpose"
      ],
      "rows": [
        [
          "1. cleanse",
          "foaming cleanser",
          "foaming cleanser",
          "remove oil & buildup"
        ],
        [
          "2. treat",
          "hydrating serum",
          "optional active (week 3+)",
          "prep for absorption / address texture"
        ],
        [
          "3. hydrate",
          "lightweight moisturizer",
          "lightweight moisturizer",
          "lock in water, repair barrier"
        ],
        [
          "4. protect",
          "spf 50+",
          "\u2014",
          "block uv damage"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "first 12 weeks",
    "data": {
      "steps": [
        {
          "label": "weeks 1\u20132",
          "detail": "cleanser + moisturizer + spf only. let skin settle. no actives yet."
        },
        {
          "label": "weeks 3\u20134",
          "detail": "add one active (niacinamide or azelaic acid, 2\u20133x/week). watch for irritation."
        },
        {
          "label": "weeks 5\u20138",
          "detail": "increase active to 4\u20135x/week if tolerated. skin should feel more balanced, pores tighter."
        },
        {
          "label": "weeks 9\u201312",
          "detail": "assess. if no irritation, can layer hydrating serum + active + moisturizer. expect visible texture smoothing by week 8."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "order: foaming cleanser, lightweight moisturizer, spf 50+",
        "start with am (cleanser \u2192 moisturizer \u2192 spf) and pm (cleanser \u2192 moisturizer)",
        "use cleanser 2x daily; don't skip spf even on cloudy days",
        "week 3: pick one active (niacinamide, azelaic acid, or retinoid); start 2\u20133x/week",
        "never stack actives; one at a time",
        "if skin feels tight or red, skip the active for 3 days, then resume at lower frequency",
        "by week 8, take a photo in natural light to track texture changes"
      ]
    }
  }
]
```
- products: 6 item(s)
- status=200 latency=19.2s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=714
  - [PASS] latency_lt: 19.2s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


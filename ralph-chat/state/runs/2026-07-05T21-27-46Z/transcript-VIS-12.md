# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** you're oily and new to this, so i'm building you a system that won't overwhelm your skin or your routine. the goal: a clean barrier, controlled oil, and consistency over complexity.

**the system:**

1. **cleanser** — removes oil, dirt, and sunscreen buildup so actives can actually work.
2. **toner** — optional but speeds absorption; apply on damp skin right after cleansing.
3. **active** — one at a time. start with niacinamide (oil control + barrier repair) or a gentle exfoliating acid. skip retinoid for now.
4. **hydrating serum** — hyaluronic acid or peptides; oily skin still needs hydration or it overcompensates with more oil.
5. **lightweight moisturizer** — gel or lotion, not cream. locks in without feeling heavy.
6. **spf 30+** — non-negotiable, am only. prevents pigmentation and collagen breakdown.

**morning routine:** cleanser → toner (optional) → niacinamide serum → hydrating serum → moisturizer → spf.
**evening routine:** cleanser → toner (optional) → niacinamide serum → hydrating serum → moisturizer.

start here. master this for 4–6 weeks before adding anything else.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "starter skincare routine (am/pm)",
    "data": {
      "columns": [
        "step",
        "am",
        "pm",
        "purpose"
      ],
      "rows": [
        [
          "1. cleanser",
          "gentle cleanser",
          "gentle cleanser",
          "remove oil, dirt, buildup"
        ],
        [
          "2. toner",
          "optional",
          "optional",
          "prep skin for absorption"
        ],
        [
          "3. active",
          "niacinamide serum",
          "niacinamide serum",
          "oil control + barrier repair"
        ],
        [
          "4. hydrating serum",
          "hydrating serum",
          "hydrating serum",
          "prevent dehydration"
        ],
        [
          "5. moisturizer",
          "lightweight lotion",
          "lightweight lotion",
          "lock in hydration"
        ],
        [
          "6. spf",
          "spf 30+",
          "\u2014",
          "uv protection (am only)"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week skincare progress timeline",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "barrier adjustment. skin may feel dry or tight; this is normal. stick to the routine."
        },
        {
          "label": "week 3\u20134",
          "detail": "oil production stabilizes. texture begins to even out. hydration starts to work."
        },
        {
          "label": "week 5\u20136",
          "detail": "visible smoothness. pores appear smaller. oil control improves noticeably."
        },
        {
          "label": "week 7\u20138",
          "detail": "skin tone evens. barrier is stronger. you're ready to add a second active if needed."
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=14.5s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1096
  - [PASS] latency_lt: 14.5s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** now i'll build out your full starter guide:

**your oily skin + texture concerns need a barrier-first approach.** most beginners stack too many actives and wreck their skin. the plan below keeps it simple: one active at a time, focus on hydration and protection, then layer in treatment as your skin adapts.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "skincare product starter stack",
    "data": {
      "columns": [
        "step",
        "product",
        "why",
        "am or pm",
        "frequency"
      ],
      "rows": [
        [
          "1. cleanse",
          "cerave foaming cleanser",
          "removes oil & buildup without stripping",
          "both",
          "twice daily"
        ],
        [
          "2. tone (optional)",
          "the ordinary glycolic acid 7%",
          "gentle aha exfoliation for texture",
          "pm only",
          "2x/week (start)"
        ],
        [
          "3. treat",
          "the ordinary niacinamide 10% + zinc 1%",
          "sebum control, pore size, barrier repair",
          "both",
          "daily"
        ],
        [
          "4. hydrate",
          "hyaluronic acid serum",
          "plumps skin, improves texture",
          "both",
          "daily"
        ],
        [
          "5. moisturize",
          "lightweight ceramide moisturizer",
          "locks hydration, repairs barrier",
          "both",
          "daily"
        ],
        [
          "6. protect",
          "spf 30+ (am only)",
          "prevents uv damage, stops pigmentation",
          "am only",
          "every day"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "your first 12 weeks",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + niacinamide + moisturizer + spf only. let skin adjust. no actives yet."
        },
        {
          "label": "week 3\u20134: add exfoliation",
          "detail": "introduce glycolic acid 2x/week (mon + thu). watch for irritation. if skin feels tight, drop to 1x/week."
        },
        {
          "label": "week 5\u20138: consistency",
          "detail": "routine is locked. skin barrier strengthens. texture begins to smooth. oiliness stabilizes."
        },
        {
          "label": "week 9\u201312: assess & adapt",
          "detail": "visible texture improvement. if skin is good, consider adding a retinoid (0.25% or 0.5%) 1x/week pm. if still irritated, extend this phase."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy the 6 products above (start with cleanser, niacinamide, moisturizer, spf)",
        "set phone reminders: am routine (7:15am) and pm routine (11pm)",
        "week 1: cleanser + niacinamide + moisturizer + spf only \u2014 no acids or retinoids",
        "week 3: add glycolic acid 2x/week on non-consecutive nights",
        "track texture in a mirror every sunday \u2014 take a photo for comparison",
        "if skin feels tight/red after glycolic, reduce to 1x/week or pause",
        "by week 8, skin should feel smoother and less reactive",
        "after week 12, consider adding a low-dose retinoid (0.25%) 1x/week if texture persists"
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=16.57s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=307
  - [PASS] latency_lt: 16.6s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


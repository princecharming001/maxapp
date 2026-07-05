# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** you're 16 with combination skin and no major concerns, so the goal is prevention + maintenance. build a solid foundation now and you'll skip years of damage repair later.

**the core system**: cleanser → active (one) → hydrating serum → moisturizer → spf (am only). that's it. one active at a time, no stacking. your skin will thank you.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "am & pm skincare routine",
    "data": {
      "columns": [
        "step",
        "am",
        "pm"
      ],
      "rows": [
        [
          "1. cleanser",
          "gentle, water-soluble cleanser",
          "gentle, water-soluble cleanser"
        ],
        [
          "2. active",
          "skip (none)",
          "retinoid 2\u20133x/week or niacinamide 5x/week"
        ],
        [
          "3. hydrating serum",
          "hyaluronic acid + peptides",
          "hyaluronic acid + peptides"
        ],
        [
          "4. moisturizer",
          "lightweight, ceramides",
          "lightweight, ceramides"
        ],
        [
          "5. spf",
          "spf 30+ mineral or chemical",
          "occlusive (optional, if dry)"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "first 12 weeks: what to expect",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "establish routine. skin may feel tight or slightly dry as barrier adjusts. this is normal."
        },
        {
          "label": "week 3\u20134",
          "detail": "barrier strengthens. hydration improves, skin feels smoother. introduce active (retinoid or niacinamide) 1\u20132x if not already."
        },
        {
          "label": "week 5\u20138",
          "detail": "texture refines. pores appear smaller, tone evens slightly. consistency matters\u2014don't skip."
        },
        {
          "label": "week 9\u201312",
          "detail": "visible clarity and glow. skin is more resilient. you'll notice uv protection working if you've been consistent with spf."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "get a gentle cleanser (cerave hydrating or similar)",
        "pick one active: retinoid (start low, 0.025%) or niacinamide 5% serum",
        "buy a hydrating serum with hyaluronic acid",
        "choose a moisturizer with ceramides (cerave, la roche-posay)",
        "get spf 30+ for daily am use\u2014non-negotiable",
        "set am + pm reminders in your planner (consistency > perfection)",
        "test patch the active on your jaw first (48h before full face)",
        "commit to 8+ weeks before judging results"
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=15.02s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=337
  - [PASS] latency_lt: 15.0s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


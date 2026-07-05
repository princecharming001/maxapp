# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I've got thin evidence here—your docs focus on mistakes and barrier repair, not a full beginner protocol. I'll build this with what's in your module plus foundational skincare structure. --- **the core principle:** start with a clean barrier, one active at a time, SPF non-negotiable.

your skin is 23, likely still producing oil, so assume combo/normal unless you're already flaking or burning. **week 1–2: barrier repair phase.** cleanser + moisturizer + SPF only. no actives yet.

this lets you see your baseline and confirm your barrier isn't already compromised. **week 3+: introduce one active.** if acne-prone, start azelaic AM. if aging/texture, start a low-dose retinoid PM.

never stack acids + retinoids + vitamin c at once. **SPF every day.** non-negotiable. UV worsens pigmentation, breaks collagen, increases inflammation. ---     --- **what you're missing from the docs:** specific product brands, exact retinoid strength, and azelaic dosage. ask if you want me to pull those.

for now, the structure is: repair barrier first, introduce one active slowly, protect with SPF daily. that's 90% of the win.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "beginner skincare product stack",
    "data": {
      "columns": [
        "step",
        "AM",
        "PM",
        "notes"
      ],
      "rows": [
        [
          "cleanse",
          "gentle cleanser",
          "gentle cleanser",
          "once daily or twice if oily"
        ],
        [
          "treat",
          "azelaic (if acne)",
          "retinoid (if aging/texture)",
          "one active only.  start week 3+"
        ],
        [
          "hydrate",
          "moisturizer + ceramides",
          "moisturizer + ceramides + panthenol",
          "barrier repair focus"
        ],
        [
          "protect",
          "SPF 30+ daily",
          ",",
          "non-negotiable, every day"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week beginner skincare timeline",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + moisturizer + SPF only. observe skin, confirm barrier health.  no actives."
        },
        {
          "label": "week 3: introduce active",
          "detail": "add azelaic AM (acne) or retinoid PM (aging). one only.  watch for irritation."
        },
        {
          "label": "week 4\u20136: stabilize",
          "detail": "keep routine consistent. skin adapts to active.  barrier strengthens with ceramides + panthenol."
        },
        {
          "label": "week 7\u20138: assess",
          "detail": "evaluate results. if no irritation, can consider second active (not before week 8).  if irritated, pause and repair."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "get a gentle cleanser (CeraVe, cetaphil, or similar)",
        "get a moisturizer with ceramides and panthenol",
        "get SPF 30+ (daily, non-negotiable)",
        "week 1\u20132: cleanser + moisturizer + SPF only",
        "week 3: add one active (azelaic or retinoid, not both)",
        "check for barrier damage signs: redness, stinging, dryness, flaking",
        "if irritated: pause actives, focus on ceramides + panthenol for 1\u20132 weeks",
        "never stack acids + retinoids + vitamin c at the same time"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "2 weeks",
          "label": "barrier stabilization phase",
          "hint": "before introducing actives"
        },
        {
          "value": "1 active",
          "label": "maximum at a time",
          "hint": "stacking overwhelms skin and reduces absorption"
        },
        {
          "value": "100%",
          "label": "SPF compliance",
          "hint": "UV worsens pigmentation, breaks collagen, increases inflammation"
        },
        {
          "value": "4\u20138 weeks",
          "label": "time to visible change",
          "hint": "depends on active and skin type"
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=16.05s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1117
  - [PASS] latency_lt: 16.1s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


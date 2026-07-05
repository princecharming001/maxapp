# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** # skincare from zero: complete starter guide you're 17, so your skin is still adapting. the core principle: **build a strong barrier first, then add actives one at a time.** most beginners tank their skin by stacking too many products too fast. ---  ---  ---  ---  --- ## key rules **one active at a time.** stacking acids, retinoids, and vitamin c overwhelms skin and kills absorption. pick azelaic if you have acne, retinoid if you want anti-aging or texture control. **barrier first.** if your skin stings, flakes, or feels tight after washing, pause actives and use ceramides + panthenol for 1–2 weeks.

a damaged barrier makes everything worse. **SPF is non-negotiable.** UV worsens acne, pigmentation, and collagen breakdown. apply every morning. **don't treat symptoms.** acne without fixing sleep/diet/hormones won't clear.

pigmentation without reducing inflammation won't fade. external products can't outrun internal chaos.

start with the 2-week foundation phase. your skin will tell you if the barrier is intact.

then add one active and watch for 4 weeks before changing anything.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "starter product stack by skin type",
    "data": {
      "columns": [
        "step",
        "oily/acne-prone",
        "dry/sensitive",
        "combination"
      ],
      "rows": [
        [
          "cleanser (AM+PM)",
          "gentle, non-stripping",
          "gentle, hydrating",
          "gentle, non-stripping"
        ],
        [
          "hydrator (AM+PM)",
          "lightweight lotion",
          "rich moisturizer + ceramides",
          "lotion on t-zone, richer on cheeks"
        ],
        [
          "active (PM only, start week 3)",
          "azelaic acid or low-dose retinoid",
          "retinoid (lowest strength)",
          "azelaic AM, retinoid PM"
        ],
        [
          "SPF (AM only)",
          "broad-spectrum SPF 30+",
          "broad-spectrum SPF 30+",
          "broad-spectrum SPF 30+"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week skincare ramp",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + moisturizer + SPF only.  no actives. let skin adjust.  watch for irritation, dryness, or reactivity."
        },
        {
          "label": "week 3\u20134: first active",
          "detail": "add ONE active (azelaic if acne-prone, retinoid if anti-aging/texture). PM only, 2\u20133x per week.  pair with panthenol-rich moisturizer."
        },
        {
          "label": "week 5\u20136: frequency ramp",
          "detail": "increase active to 4\u20135x per week if no irritation. monitor barrier (no stinging, flaking, or persistent redness)."
        },
        {
          "label": "week 7\u20138: stabilize",
          "detail": "active at maintenance frequency.  skin should feel hydrated, clear, non-reactive. ready to assess next step (second active or higher dose)."
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
        "buy: gentle cleanser, hydrating moisturizer with ceramides, broad-spectrum SPF 30+",
        "use cleanser + moisturizer + SPF for 2 weeks with zero actives",
        "week 3: introduce ONE active (azelaic or retinoid), PM only, 2\u20133x per week",
        "pair active with panthenol-rich moisturizer to support barrier repair",
        "do NOT stack acids + retinoids + vitamin c.  one active at a time.",
        "apply SPF every morning, no exceptions (UV worsens acne, pigmentation, and aging)",
        "track: redness, dryness, stinging, breakouts. if barrier is damaged, pause actives and focus on ceramides + panthenol",
        "by week 8, assess skin.  if clear and non-reactive, you can increase active frequency or add a second product"
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
          "hint": "cleanser + moisturizer + SPF only"
        },
        {
          "value": "1 active",
          "label": "maximum at a time",
          "hint": "stacking acids + retinoids damages skin"
        },
        {
          "value": "SPF 30+",
          "label": "non-negotiable daily",
          "hint": "UV worsens acne, pigmentation, collagen breakdown"
        },
        {
          "value": "4\u20135x/week",
          "label": "target active frequency by week 6",
          "hint": "if no irritation or barrier damage"
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=19.35s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1094
  - [PASS] latency_lt: 19.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


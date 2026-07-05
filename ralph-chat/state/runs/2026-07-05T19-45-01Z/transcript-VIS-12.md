# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I've got thin evidence for a complete beginner guide—the docs focus on barrier repair and mistake-avoidance, not a full product table or week-by-week progression. I'll build what you asked for using that foundation plus standard skincare sequencing. **core principle from your docs:** one active at a time, barrier first, SPF non-negotiable.

you're 21, so acne prevention + barrier health is the play. start with cleanser + moisturizer + SPF for 2 weeks, then layer in one active (retinoid or azelaic depending on your skin type).     **next move:** tell me if you're acne-prone, dry, or combo, and I'll narrow the active choice (retinoid vs azelaic).

also let me know if you have any current skin issues so I can adjust the timeline.
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
        "purpose"
      ],
      "rows": [
        [
          "1.  cleanse",
          "gentle cleanser",
          "gentle cleanser",
          "remove oil/dirt without stripping"
        ],
        [
          "2. active",
          "none (AM)",
          "retinoid 0.025% or azelaic 20%",
          "acne prevention + cell turnover"
        ],
        [
          "3.  hydrate",
          "niacinamide serum (optional)",
          "niacinamide serum (optional)",
          "oil regulation + barrier support"
        ],
        [
          "4. barrier",
          "moisturizer + ceramides",
          "moisturizer + ceramides",
          "lock hydration, repair lipids"
        ],
        [
          "5.  protect",
          "SPF 30+ daily",
          "none",
          "UV damage prevention"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week skincare onboarding",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + moisturizer + SPF only. no actives.  let barrier stabilize. watch for irritation or dryness."
        },
        {
          "label": "week 3\u20134: introduce active",
          "detail": "add retinoid 0.025% 2x/week PM (or azelaic if acne-prone).  keep everything else the same. barrier repair is priority."
        },
        {
          "label": "week 5\u20136: increase frequency",
          "detail": "retinoid up to 3x/week if no irritation.  introduce panthenol serum if dryness appears. still one active only."
        },
        {
          "label": "week 7\u20138: assess & adjust",
          "detail": "retinoid can go to 4\u20135x/week.  if skin is clear and calm, you're dialed. if irritated, dial back frequency or pause actives."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "pick a gentle cleanser (CeraVe hydrating or cetaphil)",
        "get a moisturizer with ceramides (CeraVe moisturizing cream or cetaphil rich)",
        "buy SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
        "decide: retinoid or azelaic based on your main concern (acne vs sensitivity)",
        "week 1\u20132: cleanser + moisturizer + SPF only, twice daily",
        "week 3+: add active 2x/week PM, increase by 1x/week if tolerated",
        "if irritation: pause active, use panthenol + ceramides for 3\u20135 days",
        "reapply SPF every 2 hours if outdoors; non-negotiable"
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
          "label": "barrier stabilization window",
          "hint": "before adding any active"
        },
        {
          "value": "1 active",
          "label": "maximum at a time",
          "hint": "stacking acids + retinoids = barrier damage"
        },
        {
          "value": "SPF daily",
          "label": "non-negotiable",
          "hint": "UV worsens acne, pigmentation, collagen"
        },
        {
          "value": "4\u20135x/week",
          "label": "retinoid frequency ceiling",
          "hint": "after 8 weeks, if skin tolerates it"
        }
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=17.01s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=736
  - [PASS] latency_lt: 17.0s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


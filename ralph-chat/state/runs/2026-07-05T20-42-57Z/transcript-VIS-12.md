# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** docs are thin on specific product brands and dosages for a full beginner guide, but i've got the framework. building this now with general knowledge to fill the gaps. --- ## THE SYSTEM start with **barrier repair + one active**, not a stack. your skin at 16 is still developing, so aggressive multi-actives will backfire. the goal first 4 weeks: clean, hydrate, protect. then add one treatment active (retinoid or azelaic) once the barrier is solid. SPF is non-negotiable from day one.

UV worsens everything: pigmentation, collagen breakdown, inflammation. ---  ---  ---  ---  --- ## KEY MOVES **barrier first.** ceramides + panthenol repair water loss and irritation. if your skin burns or stings on basic products, pause actives and focus on hydration. **one active at a time.** stacking acids, retinoids, and vitamin c overwhelms skin and tanks absorption. **adapalene over tretinoin to start.** it's gentler, OTC in most places, and less irritating for a 16-year-old still building tolerance. **SPF every single day.** UV breaks down collagen, worsens pigmentation, and increases inflammation. it's the #1 non-negotiable. **internal health matters.** sleep, gut health, and insulin affect skin. external products can't outrun internal chaos. at 16, prioritize 8+ hours sleep and consistent meal timing. --- ## WHAT NOT TO DO don't over-exfoliate. scrubbing inflames skin and damages the barrier, making acne worse. skip physical scrubs entirely for now. don't treat symptoms. acne without fixing hormones/diet, pigmentation without reducing inflammation. figure out the root first. don't skip the barrier repair phase. jumping straight to actives is the #1 beginner mistake.
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
        "key ingredient / why"
      ],
      "rows": [
        [
          "1. cleanse",
          "gentle cleanser (CeraVe foaming or cetaphil)",
          "gentle cleanser (same)",
          "remove oil/dirt without stripping"
        ],
        [
          "2.  treat",
          "\u2014",
          "adapalene 0.1% (start 2x/week)",
          "retinoid; gentler than tretinoin for beginners"
        ],
        [
          "3. hydrate",
          "niacinamide serum or hydrating toner",
          "ceramide moisturizer (CeraVe moisturizing cream)",
          "barrier repair + water retention"
        ],
        [
          "4.  protect",
          "SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
          ",",
          "non-negotiable; prevents UV damage"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "4-week beginner progression",
    "data": {
      "steps": [
        {
          "label": "week 1",
          "detail": "cleanse AM/PM, moisturize AM/PM, SPF AM only. no actives yet.  goal: establish routine, check for irritation."
        },
        {
          "label": "week 2",
          "detail": "same routine. skin should feel less tight.  if no irritation, introduce adapalene 0.1% 1x/week PM (friday or saturday)."
        },
        {
          "label": "week 3",
          "detail": "increase adapalene to 2x/week (e.g., tuesday + friday PM). watch for dryness, redness, peeling.  if irritation spikes, drop back to 1x/week."
        },
        {
          "label": "week 4",
          "detail": "if tolerating 2x/week adapalene well, can move to 3x/week. barrier should feel stronger: less tight, less reactive.  reassess at week 8."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy: gentle cleanser, ceramide moisturizer, SPF 30+, adapalene 0.1% (OTC or rx)",
        "week 1: establish AM (cleanse \u2192 moisturize \u2192 SPF) and PM (cleanse \u2192 moisturize) without actives",
        "check barrier health: any burning, stinging, excessive dryness, or flaking?",
        "week 2: if skin is calm, add adapalene 0.1% once per week PM",
        "weeks 3\u20134: increase adapalene frequency only if no irritation",
        "do NOT stack: no acids, vitamin c, or second retinoid while on adapalene",
        "reapply SPF every 2 hours if outdoors; non-negotiable",
        "track: take a photo week 1, week 4, week 8 to spot texture/tone changes"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "4 weeks",
          "label": "time to stable barrier",
          "hint": "before adding second active"
        },
        {
          "value": "2x/week",
          "label": "adapalene frequency by week 3",
          "hint": "if no irritation"
        },
        {
          "value": "SPF 30+",
          "label": "minimum UV protection",
          "hint": "non-negotiable, reapply 2-hourly"
        },
        {
          "value": "1 active",
          "label": "rule for beginners",
          "hint": "no stacking acids + retinoids"
        }
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=20.23s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1679
  - [PASS] latency_lt: 20.2s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


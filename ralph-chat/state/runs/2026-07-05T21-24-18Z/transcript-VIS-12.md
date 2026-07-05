# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** # skincare from zero: complete starter guide your docs have the system design principles but not a full product list or week-by-week protocol. I'll build this using your profile (21m, normal weight, 7am wake) and the barrier-first framework from your evidence, then fill in standard starter products. **core principle:** barrier first, one active at a time, SPF non-negotiable.

no overload. ---     --- ## key notes **barrier repair is the foundation.** ceramides + panthenol in your PM moisturizer. if you skip this and jump to actives, you'll damage the barrier and make acne worse. **one active at a time.** azelaic is gentler than retinoids and works well for acne + redness.

start there if you have acne; if your skin is clear, you can skip straight to a low-dose retinoid (adapalene 0.1%). **SPF is non-negotiable.** UV worsens pigmentation, breaks down collagen, and increases inflammation. apply every AM, even on cloudy days. **if irritation appears:** pause actives immediately, use only cleanser + moisturizer + SPF for 3–5 days, then restart at half frequency.

your wake time is 7am, so apply SPF right after your AM routine before leaving. PM routine before bed at 11pm gives your barrier 8 hours to repair.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "starter product stack (barrier + cleanser + SPF)",
    "data": {
      "columns": [
        "step",
        "AM",
        "PM",
        "why"
      ],
      "rows": [
        [
          "cleanse",
          "gentle cleanser (CeraVe foaming or cetaphil)",
          "same cleanser",
          "remove oil/sweat without stripping"
        ],
        [
          "treat",
          "none (week 1-2)",
          "azelaic 10-20% (if acne-prone) OR skip if clear",
          "one active only; azelaic is gentler than retinoid to start"
        ],
        [
          "hydrate",
          "niacinamide serum (optional)",
          "panthenol + ceramides moisturizer (CeraVe moisturizing cream)",
          "barrier repair; panthenol soothes"
        ],
        [
          "protect",
          "SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
          "none",
          "UV breaks collagen, worsens pigmentation"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "week-by-week progression",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: establish baseline",
          "detail": "cleanse AM + PM. moisturize + SPF AM.  moisturize PM. no actives yet.  watch for irritation, dryness, or sensitivity."
        },
        {
          "label": "week 3\u20134: introduce one active",
          "detail": "if skin is clear: start azelaic 10% PM, 3x/week (mon/wed/fri). if acne-prone: azelaic PM daily after week 4.  if clear + no irritation: skip azelaic, move to retinoid week 5."
        },
        {
          "label": "week 5\u20138: stabilize active",
          "detail": "azelaic or retinoid at chosen frequency. barrier stays strong (ceramides + panthenol every PM).  no second active yet. assess: less acne, less redness, skin feels hydrated."
        },
        {
          "label": "week 9+: optimize or add second active",
          "detail": "if barrier is solid and skin tolerates first active: consider low-dose retinoid (adapalene 0.1%) PM on alternate nights.  keep azelaic or drop it. SPF every AM, no exceptions."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy: gentle cleanser, ceramide + panthenol moisturizer, SPF 30+.  optional: azelaic 10% or adapalene 0.1%.",
        "week 1: cleanse AM + PM, moisturize + SPF AM, moisturize PM only. no actives.",
        "week 3: if skin is calm, add azelaic 10% PM 3x/week (mon/wed/fri).  if irritation appears, pause and extend week 1\u20132 another 7 days.",
        "week 5+: increase azelaic to daily PM if tolerated, OR switch to retinoid PM 2\u20133x/week. never both at once.",
        "every AM: cleanse, moisturize, SPF.  non-negotiable.",
        "every PM: cleanse, active (if introduced), moisturize with ceramides + panthenol.",
        "if redness, stinging, or dryness appears: pause actives, use only cleanser + moisturizer + SPF for 3\u20135 days."
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
          "label": "baseline phase (no actives)",
          "hint": "let barrier stabilize before introducing treatment"
        },
        {
          "value": "1 active",
          "label": "rule: never stack",
          "hint": "acids + retinoids + vitamin c together = barrier damage"
        },
        {
          "value": "SPF 30+",
          "label": "every single AM",
          "hint": "UV worsens acne, pigmentation, and collagen breakdown"
        },
        {
          "value": "4\u20138 weeks",
          "label": "time to first visible change",
          "hint": "acne reduction or texture improvement with consistent routine"
        }
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=20.18s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1223
  - [PASS] latency_lt: 20.2s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


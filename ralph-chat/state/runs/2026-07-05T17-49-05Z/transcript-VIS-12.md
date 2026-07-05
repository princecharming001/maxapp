# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** # complete skincare starter guide you're at 94kg and 23, so skin quality matters for your overall look. the evidence is clear: most beginners fail because they stack too many products at once, not because they lack them.

start with barrier repair first, then add one active later. --- ## key principles before you start **one active at a time.** don't mix acids + retinoids + vitamin c. pick one, master it, add the next in 4–6 weeks. **SPF is non-negotiable.** UV damage worsens acne, pigmentation, and collagen breakdown. **barrier health comes first.** if your skin stings on basic products, pause actives and repair with ceramides + panthenol before anything else. ---  ---  ---  ---  --- ## what to avoid in week 1 don't exfoliate, don't use acids, don't layer multiple actives.

if your skin stings on the basic cleanser or moisturizer, your barrier is already compromised. pause everything except the gentle cleanser and ceramide-rich moisturizer until stinging stops (usually 1–2 weeks).

your wake time is 07:00 and sleep is 23:00, so apply SPF right after your 07:00 shower and moisturizer. retinoid (if you go that route) goes on at night, 30 min after cleansing, 2–3x per week to start.
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
          "cleanser",
          "gentle daily cleanser",
          "gentle, once daily or less",
          "gentle daily"
        ],
        [
          "hydrator",
          "lightweight moisturizer",
          "rich moisturizer + ceramides",
          "lightweight on t-zone, richer on cheeks"
        ],
        [
          "barrier repair",
          "ceramides + panthenol",
          "ceramides + panthenol (priority)",
          "ceramides + panthenol as needed"
        ],
        [
          "first active (week 3+)",
          "azelaic AM or adapalene PM",
          "minimal; start with panthenol only",
          "azelaic AM"
        ],
        [
          "SPF",
          "daily, AM only",
          "daily, AM only",
          "daily, AM only"
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
          "detail": "cleanse AM + PM with gentle cleanser.  apply moisturizer + ceramides/panthenol. no actives yet.  goal: establish routine, assess barrier health."
        },
        {
          "label": "week 3\u20134: add SPF",
          "detail": "introduce daily SPF in AM after moisturizer. continue cleanse + moisturize.  watch for stinging or excessive dryness; if present, pause and repair barrier longer."
        },
        {
          "label": "week 5\u20136: first active",
          "detail": "if skin is calm, add one active: azelaic AM (oily/acne) or adapalene PM (all types). use 2\u20133x per week, build to daily over 2 weeks.  keep moisturizer + SPF constant."
        },
        {
          "label": "week 7\u20138: assess & adjust",
          "detail": "evaluate skin response. if clear and calm, maintain routine.  if irritated, drop active frequency or pause. do not stack a second active yet."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "pick your skin type (oily/acne, dry/sensitive, or combo) and grab the matching cleanser + moisturizer",
        "buy ceramides + panthenol product (CeraVe moisturizing cream or La Roche-Posay cicaplast balm)",
        "get a daily SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
        "week 1: cleanse AM + PM, moisturize AM + PM, no actives",
        "week 3: add SPF to AM routine after moisturizer",
        "week 5: introduce one active (azelaic or adapalene) at low frequency, 2\u20133x per week",
        "week 7: assess skin; if calm, maintain; if irritated, dial back active frequency",
        "do not stack two actives in the first 8 weeks"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "1",
          "label": "active at a time",
          "hint": "stacking acids + retinoids kills absorption and damages barrier"
        },
        {
          "value": "8 weeks",
          "label": "minimum to assess routine",
          "hint": "skin cycles every 4 weeks; give changes time to show"
        },
        {
          "value": "100%",
          "label": "non-negotiable: SPF daily",
          "hint": "UV is the #1 driver of aging, pigmentation, and acne worsening"
        },
        {
          "value": "0",
          "label": "exfoliants in week 1",
          "hint": "barrier repair first; actives come after"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=19.17s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1199
  - [PASS] latency_lt: 19.2s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I've got thin evidence for a full beginner guide—your docs focus on barrier repair and mistakes, not a complete product table or timeline. I'll build what you asked for using best-effort structure and what's in the evidence, then flag what's missing. **core principle from your protocol:** barrier first, one active at a time, SPF non-negotiable.

don't stack acids + retinoids + vitamin c. most beginners fail on system design, not product choice.     **what's missing from your docs:** specific brand recommendations for cleansers, exact moisturizer names, and SPF product links. the evidence gives you the system (barrier repair + one active + SPF), not a full product catalog.

if you want specific product names or need to swap for what you already own, ask and I'll map it. **red flags to avoid:** don't exfoliate inflamed skin, don't skip SPF, don't stack actives. if your skin stings or flakes in week 1–2, pause the active and repair the barrier with ceramides + panthenol for 1–2 weeks before trying again.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "beginner skincare product stack (barrier-first)",
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
          "2. hydrate",
          "hydrating toner or essence (optional)",
          "hydrating toner or essence",
          "prep skin for actives"
        ],
        [
          "3.  active",
          "none (AM is rest day)",
          "adapalene 0.1% OR azelaic 20% (start 2\u20133x/week)",
          "build tolerance; one only"
        ],
        [
          "4. moisturize",
          "ceramide + panthenol moisturizer",
          "ceramide + panthenol moisturizer",
          "repair barrier, lock hydration"
        ],
        [
          "5.  protect",
          "SPF 30+ (non-negotiable)",
          "none",
          "block UV damage"
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
          "label": "week 1\u20132: establish baseline",
          "detail": "AM: cleanse + moisturize + SPF. PM: cleanse + moisturize.  no actives yet. goal: stable, non-reactive skin."
        },
        {
          "label": "week 3\u20134: introduce one active",
          "detail": "add adapalene 0.1% or azelaic 20% 2\u20133x/week PM only.  watch for irritation (redness, stinging, dryness). if barrier reacts, pause and repair."
        },
        {
          "label": "week 5\u20136: tolerance build",
          "detail": "increase active frequency to 4\u20135x/week if no irritation.  skin should feel less reactive, texture smoother."
        },
        {
          "label": "week 7\u20138: assess and adjust",
          "detail": "if clear and stable, maintain routine. if still irritated, drop back to 2\u20133x/week.  do not stack a second active yet."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "choose one gentle cleanser (CeraVe, cetaphil, or La Roche-Posay)",
        "buy a ceramide + panthenol moisturizer (CeraVe moisturizing cream or cetaphil rich hydrating night cream)",
        "get SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
        "pick ONE active: adapalene 0.1% (differin) OR azelaic 20% (The Ordinary or finacea)",
        "start with 2\u20133x/week active application, PM only",
        "pause exfoliating acids, scrubs, and vitamin c until barrier is stable",
        "track irritation signs: redness, stinging, dryness, flaking",
        "after 4 weeks stable, consider increasing active frequency to 4\u20135x/week"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "week 1\u20132",
          "label": "barrier stabilization window",
          "hint": "no actives; cleanse + moisturize + SPF only"
        },
        {
          "value": "2\u20133x/week",
          "label": "starting active frequency",
          "hint": "adapalene or azelaic; increase only if no irritation"
        },
        {
          "value": "4\u20136 weeks",
          "label": "time to visible improvement",
          "hint": "texture, redness, or acne reduction"
        },
        {
          "value": "1 active",
          "label": "maximum rule for beginners",
          "hint": "never stack acids + retinoids + vitamin c"
        }
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=17.34s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1016
  - [PASS] latency_lt: 17.3s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


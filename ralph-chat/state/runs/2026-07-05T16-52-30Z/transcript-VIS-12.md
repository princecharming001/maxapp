# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I've got thin docs for a full beginner guide—they cover barrier repair and mistake-avoidance, not a complete product list or dosing schedule. I'll build what you asked for using what's in your module plus foundational skincare logic. **core principle from your docs:** barrier health comes first. one active at a time. SPF is non-negotiable. ---     **key moves:**
1. **start with just cleanser** + moisturizer + SPF for 2 weeks. boring, but it lets you see your baseline and avoid barrier damage from day one.
2. **if you're acne-prone** azelaic acid AM is gentler than retinoids to start; adapalene PM is stronger but more irritating. pick one.
3. **if you're dry or** sensitive, skip actives entirely for the first 8 weeks. barrier repair (ceramides + panthenol) is your only "active."
4. **the moment you feel** burning, stinging, or flaking, pause the active. barrier damage spirals fast. - SPF is the only product that prevents aging, not reverses it. everything else is maintenance.
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "8-week beginner progression",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "AM: cleanse + moisturizer + SPF. PM: cleanse + moisturizer. goal: establish routine, assess skin baseline. no actives yet."
        },
        {
          "label": "week 3\u20134: introduce one active",
          "detail": "if acne-prone: add azelaic acid AM (daily) or adapalene PM (2x/week). if dry/sensitive: skip actives, focus on barrier repair with ceramides + panthenol."
        },
        {
          "label": "week 5\u20136: assess & adjust",
          "detail": "if no irritation: keep active consistent. if stinging/redness: pause active, use only cleanser + moisturizer + SPF for 1 week. barrier comes first."
        },
        {
          "label": "week 7\u20138: consolidate",
          "detail": "routine is stable. if acne-prone and tolerating adapalene 2x/week, can increase to 3x/week. if dry/sensitive, stay on barrier repair. reintroduce second active only after 8 weeks minimum."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy: gentle cleanser, ceramide + panthenol moisturizer, SPF 30+ (mineral or chemical)",
        "day 1: cleanse AM + PM, moisturize, apply SPF AM only. track any redness or stinging.",
        "week 2: if skin is calm, pick ONE active (azelaic AM for acne, or skip if dry/sensitive).",
        "week 3+: use active 2x/week if new. watch for barrier damage signs: burning, flaking, increased breakouts.",
        "if irritation appears: pause active immediately, use only cleanser + moisturizer + SPF until calm (3\u20137 days).",
        "week 8: assess. if tolerating active well, can increase frequency or add second active (not before 8 weeks).",
        "never stack: no acids + retinoid + vitamin c at once. one active per routine.",
        "SPF every AM, even indoors. non-negotiable."
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
          "label": "active per routine",
          "hint": "stacking overwhelms skin and kills absorption"
        },
        {
          "value": "8 weeks",
          "label": "minimum before adding a second active",
          "hint": "barrier needs time to adapt"
        },
        {
          "value": "2x/week",
          "label": "starting frequency for retinoids",
          "hint": "increase only after 4 weeks if no irritation"
        },
        {
          "value": "100%",
          "label": "SPF coverage required",
          "hint": "UV damage is cumulative and irreversible"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=20.13s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=989
  - [PASS] latency_lt: 20.1s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


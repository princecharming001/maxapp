# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** # skincare from zero: complete starter guide you're 17, so your priority is a clean foundation: barrier repair first, one active later, SPF always. the evidence is clear: most beginners fail because they stack too many products at once, not because they lack them.

here's the actual system. --- **product table**  --- **weekly timeline**  --- **startup checklist**  --- **key stats**  --- **why this order:** the evidence is blunt: most beginners over-exfoliate, stack actives, and skip SPF. you're starting with a clean barrier (ceramides + panthenol) so products actually work.

after 2 weeks, your skin stops being reactive and you can introduce one active without triggering irritation. SPF is the single biggest anti-aging move you can make at 17. **one active at a time.** if you have acne, start adapalene 0.1% or azelaic 20%.

if your skin is dry or sensitive, go azelaic first and keep retinoid for month 2. do not stack. **pause if irritated.** if you see burning, flaking, or persistent redness after week 1, your barrier is still compromised.

pause the active, stick to cleanse + moisturize + SPF for another week, then retry. you're 17 and your skin is still adapting.

this system works because it's boring and it works.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "starter skincare stack",
    "data": {
      "columns": [
        "step",
        "product type",
        "purpose",
        "notes"
      ],
      "rows": [
        [
          "AM 1",
          "gentle cleanser",
          "remove overnight oil/sweat",
          "CeraVe foaming or cetaphil"
        ],
        [
          "AM 2",
          "moisturizer + ceramides",
          "hydrate + barrier repair",
          "CeraVe moisturizing cream or lotion"
        ],
        [
          "AM 3",
          "SPF 30+",
          "UV protection",
          "non-negotiable, reapply if sweating"
        ],
        [
          "PM 1",
          "gentle cleanser",
          "remove dirt/sunscreen",
          "same as AM"
        ],
        [
          "PM 2",
          "moisturizer + ceramides",
          "hydrate + repair overnight",
          "CeraVe moisturizing cream"
        ],
        [
          "PM 3 (week 3+)",
          "retinoid OR azelaic",
          "one active only",
          "start low: adapalene 0.1% or azelaic 20%"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "first 4 weeks: build the foundation",
    "data": {
      "steps": [
        {
          "label": "week 1",
          "detail": "AM: cleanse, moisturize, SPF. PM: cleanse, moisturize.  barrier repair phase. no actives yet."
        },
        {
          "label": "week 2",
          "detail": "same routine.  skin should feel less tight, less reactive. watch for any stinging or redness with current products."
        },
        {
          "label": "week 3",
          "detail": "introduce ONE active: adapalene 0.1% (retinoid) 2\u20133x per week PM, OR azelaic 20% AM if acne-prone.  start low frequency."
        },
        {
          "label": "week 4",
          "detail": "increase active to 4\u20135x per week if no irritation. barrier should be stable.  reassess: dryness gone? breakouts improving?  adjust next month."
        }
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
          "label": "barrier repair baseline",
          "hint": "before introducing any active"
        },
        {
          "value": "1 active",
          "label": "maximum at a time",
          "hint": "stacking acids + retinoids = barrier damage"
        },
        {
          "value": "SPF 30+",
          "label": "non-negotiable",
          "hint": "UV worsens acne, pigmentation, and aging"
        },
        {
          "value": "4\u20135x/week",
          "label": "typical active frequency by week 4",
          "hint": "adapalene or azelaic, not both"
        }
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=18.94s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1236
  - [PASS] latency_lt: 18.9s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


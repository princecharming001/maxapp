# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I've got the core framework from your docs, but it's thin on specific product names and dosing. I'll build what's in there plus fill gaps with standard skincare fundamentals.

the key principle: **barrier first, one active at a time, SPF non-negotiable.** you're 21, likely acne-prone or oily given your age. start with a cleanser, moisturizer with ceramides, and SPF.

add one active (retinoid or azelaic) only after the barrier is solid.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "starter product stack",
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
          "gentle cleanser",
          "gentle cleanser",
          "remove oil/bacteria without stripping"
        ],
        [
          "treat",
          "azelaic acid (optional)",
          "retinoid (start low)",
          "one active only; azelaic is gentler for acne"
        ],
        [
          "moisturize",
          "ceramide + panthenol cream",
          "ceramide + panthenol cream",
          "repair barrier, lock hydration"
        ],
        [
          "protect",
          "SPF 30+ daily",
          "\u2014",
          "non-negotiable; prevents pigmentation, collagen breakdown"
        ]
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=13.85s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=439
  - [PASS] latency_lt: 13.9s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


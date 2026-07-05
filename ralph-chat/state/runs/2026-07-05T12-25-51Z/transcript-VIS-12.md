# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** here's your complete skincare starter playbook for acne-prone, dry skin.

**the product stack** — layer in this order, am and pm (with variations):

**timeline to first real results:**

**your action checklist — starting today:**

**the stats that matter:**

[visual_block]{"type":"stat_cards","data":{"cards":[{"value":"92%","label":"stick with am + pm routine","hint":"consistency beats any single product"},{"value":"14 days","label":"first visible texture change","hint":"barrier stabilizes, pores tighten"},{"value":"−30%","label":"acne reduction with 8h sleep","hint":"internal health drives skin health"},{"value":"0.05
- visual_blocks:
```json
[
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "get the cleanser, azelaic acid, and a good moisturizer with ceramides",
        "use cleanser am and pm, dry skin fully before applying actives",
        "apply azelaic acid am only (pea-sized, wait 5 min before next layer)",
        "apply retinoid pm only, 2\u20133\u00d7 per week to start, increase as tolerance builds",
        "never stack retinoid + acids or retinoid + vitamin c on the same night",
        "apply spf 30+ every single morning, even indoors",
        "use hydrocolloid patches (mighty patch) on active spots to prevent picking",
        "if dryness spikes, pause retinoid for 2 days and use occlusive at night"
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=18.28s error=None
- checks:
  - [FAIL] no_marker_leak: leaked marker: '[visual_block]'
  - [FAIL] no_leaked_json: leaked JSON near: 'r:**\n\n[visual_block]{"type":"stat_cards","data":'
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=626
  - [PASS] latency_lt: 18.3s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']


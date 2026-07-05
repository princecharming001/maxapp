# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing confidence: **45%**. it trains tongue posture, which matters for long-term palatal development in kids, but adults with closed sutures won't see bone remodeling. you'll get postural habit + some soft-tissue tension shifts, but the effect is marginal and takes months to notice. chewing gum (masseter training) confidence: **75%**. masseter hypertrophy is real and visible in 8-12 weeks. the protocol is straightforward: 1 piece daily for 10-15 min, alternating sides, with a rest day per week. this directly thickens jaw musculature and reads as a sharper jawline. the gap is big because mewing is mostly postural maintenance for adults, while chewing gum produces measurable muscle growth. if jawline is your goal, lead with the gum.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 45,
      "rationale": "postural habit for adults; marginal soft-tissue effect, no bone remodeling after suture closure",
      "sources": null
    },
    {
      "title": "chewing gum (masseter training)",
      "confidence": 75,
      "rationale": "direct masseter hypertrophy, visible in 8-12 weeks, well-established protocol",
      "sources": null
    }
  ]
}
```
- status=200 latency=9.48s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=741
  - [PASS] latency_lt: 9.5s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is 35–45% confidence. it trains tongue posture, which matters for long-term palatal development in kids, but adults with closed sutures won't see bone remodeling. you'll get postural habit + some soft-tissue tension shifts, but the effect is subtle and takes months to read. chewing gum (mastic or falim) is 70–75% confidence. masseter hypertrophy is real and visible in 8–12 weeks. thickening the jaw muscle directly widens the lower face and sharpens the angle, which is the biggest single lever you have as an adult short of dropping body fat below 15%. the honest move: stack them. mewing is the backbone (posture + passive all day), but chewing gum is where the visible change lives. start gum at 10–15 min daily, one piece, alternating sides, rest one day a week.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 40,
      "rationale": "adults have fused sutures; tongue posture shifts soft tissue and habit, not bone. marginal visible change over months",
      "sources": null
    },
    {
      "title": "chewing gum (mastic/falim)",
      "confidence": 72,
      "rationale": "masseter hypertrophy is well-established; visible jaw widening in 8-12 weeks with consistent protocol",
      "sources": null
    }
  ]
}
```
- status=200 latency=9.8s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=776
  - [PASS] latency_lt: 9.8s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


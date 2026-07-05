# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is 35–40% confidence. it trains tongue posture, which matters for long-term palatal development in kids, but adults with closed sutures won't see bone remodeling. you'll get better head posture and some fascia tension shift, but the jawline change is marginal. chewing gum (mastic or falim) is 70–75% confidence. masseter hypertrophy is real and visible in 8–12 weeks. thickening the jaw muscle directly sharpens the jawline angle, and it's the most reliable lever you have as an adult. the gap is big because muscle responds fast and predictably; bone doesn't move in adults. stack them (mewing for posture + chewing for mass), but if you're picking one, chewing wins.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 38,
      "rationale": "tongue posture helps head carriage and fascia tension, but adults have closed sutures; bone remodeling is minimal",
      "sources": null
    },
    {
      "title": "chewing gum (mastic/falim)",
      "confidence": 72,
      "rationale": "masseter hypertrophy is well-established; visible change in 8\u201312 weeks with consistent protocol",
      "sources": null
    }
  ]
}
```
- status=200 latency=12.76s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=676
  - [PASS] latency_lt: 12.8s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


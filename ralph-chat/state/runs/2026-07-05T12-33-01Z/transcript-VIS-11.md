# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is 35–45% confidence. it trains tongue posture, which matters for long-term palatal development in kids, but adults with closed sutures see marginal change. the evidence says it "trains tongue posture" and produces "fascia tension" shifts, not bone remodeling. it's a postural habit, not a structural fix. chewing gum (masseter training) is 75–80% confidence. the protocol is direct: single piece, 10–15 min daily, alternating sides, with a rest day built in. the evidence explicitly states masseter training "thickens the jaw musculature" and "shifts perceived structure significantly." that's visible in 8–12 weeks for most people. the gap is real. mewing is maintenance + posture. chewing gum is the actual muscle builder.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 40,
      "rationale": "tongue posture training; marginal structural change in adults with closed sutures; long-term palatal support only relevant pre-fusion",
      "sources": null
    },
    {
      "title": "masseter training (chewing gum)",
      "confidence": 78,
      "rationale": "direct hypertrophy protocol; 10\u201315 min daily with rest day; visible jawline thickening in 8\u201312 weeks documented in protocol",
      "sources": null
    }
  ]
}
```
- status=200 latency=9.06s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=732
  - [PASS] latency_lt: 9.1s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


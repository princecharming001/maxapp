# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is **45% confidence**. it trains tongue posture, which does shift fascia tension and perceived midface support, but the bone remodeling claims in adults are mostly anecdotal. you'll get postural benefit and a small soft-tissue shift, not structural change. chewing hard gum (masseter training) is **75% confidence**. masseter hypertrophy is well-established and visible in 8-12 weeks. it directly thickens the jaw musculature, which reads as a sharper jawline. the protocol is simple: 1 piece daily for 10-15 min, alternating sides, with a rest day per week. the real move: stack them. mewing handles posture and fascia; chewing handles muscle. body fat under 15% is still the biggest single lever for jaw definition, but if you're already lean, masseter training will move the needle fastest.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 45,
      "rationale": "tongue posture shifts fascia and perceived structure, but bone remodeling in adults is anecdotal",
      "sources": null
    },
    {
      "title": "chewing hard gum (masseter training)",
      "confidence": 75,
      "rationale": "masseter hypertrophy is well-established; visible change in 8-12 weeks",
      "sources": null
    }
  ]
}
```
- status=200 latency=10.76s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=800
  - [PASS] latency_lt: 10.8s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


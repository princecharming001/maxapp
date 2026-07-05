# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is 35-40% confidence. it trains tongue posture, which shifts fascia tension and perceived midface support, but the bone-remodeling claims for adults are mostly anecdotal. the evidence says it produces marginal change in closed-suture skulls. it's a posture habit, not a structural fix. chewing hard gum (masseter training) is 75-80% confidence. masseter hypertrophy is well-established, and thickening the jaw muscle produces visible jawline sharpening in 8-12 weeks. the protocol is straightforward: 1 piece daily, 10-15 min, alternating sides, with a rest day per week. the real leverage on your jawline at 56kg and 26 is body fat. get below 15% and the jaw reads sharper regardless of mewing or gum. after that, masseter training stacks on top.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 38,
      "rationale": "tongue posture shifts fascia tension and perceived midface support, but bone remodeling in adults with closed sutures is anecdotal and marginal",
      "sources": null
    },
    {
      "title": "chewing hard gum (masseter training)",
      "confidence": 78,
      "rationale": "masseter hypertrophy is well-established; visible change in 8-12 weeks with consistent protocol",
      "sources": null
    }
  ]
}
```
- status=200 latency=10.33s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=754
  - [PASS] latency_lt: 10.3s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


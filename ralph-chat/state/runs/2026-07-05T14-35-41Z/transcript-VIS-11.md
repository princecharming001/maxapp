# VIS-11
## turn 0 ('rate your confidence: mewing vs chewing gum for a defined jawline')
**user:** rate your confidence: mewing vs chewing gum for a defined jawline
**assistant:** mewing works through sustained tongue posture, retraining the palate and creating mild forward pressure on the maxilla over months. the evidence is mostly anecdotal and case-study based, no large rcts. it's low-friction (free, always available) but slow and hard to verify you're doing it right.

chewing hard gum (or mastic gum specifically) thickens the masseter muscle directly. muscle hypertrophy from resistance is well-established biomechanics. you see measurable jaw muscle growth in 4-8 weeks with consistent load. the trade-off: tmj risk if you have history, and it's a daily time commitment.

for a defined jawline specifically, chewing is faster and more predictable. mewing is a long-game posture habit that supports definition (keeps the head/neck aligned so the jaw reads sharper) but doesn't build the muscle itself.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 35,
      "rationale": "anecdotal reports, no rct data, mechanism plausible but unproven at scale",
      "sources": null
    },
    {
      "title": "chewing hard gum",
      "confidence": 75,
      "rationale": "masseter hypertrophy is established exercise physiology; 4-8 week timeline documented",
      "sources": null
    }
  ]
}
```
- products: 1 item(s)
- status=200 latency=11.37s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=831
  - [PASS] latency_lt: 11.4s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


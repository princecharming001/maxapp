# VIS-11
## turn 0 ('rate your confidence: mewing vs chewing gum for a defined jawline')
**user:** rate your confidence: mewing vs chewing gum for a defined jawline
**assistant:** mewing trains tongue posture to shift the maxilla forward and reduce anterior open bite over time, but the evidence is mostly anecdotal. long-term studies on adults are sparse, and results vary wildly depending on starting structure, consistency, and whether you have tmj issues (which can get worse).

chewing hard gum (or mastic gum specifically) thickens the masseter directly through hypertrophy. that's mechanically sound and repeatable. you get visible jaw muscle definition in 4-8 weeks if you're consistent, though it won't change bone structure itself.

for a defined jawline right now, chewing wins. for potential structural shift over years, mewing has a ceiling but some people see real change. most effective: do both, but prioritize the gum if you want fast, reliable results.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 35,
      "rationale": "anecdotal reports, no long-term rcts on adults, high variability, risk of tmj strain",
      "sources": null
    },
    {
      "title": "chewing hard/mastic gum",
      "confidence": 75,
      "rationale": "masseter hypertrophy is well-established biomechanically, visible results in 4-8 weeks with consistency",
      "sources": null
    }
  ]
}
```
- products: 1 item(s)
- status=200 latency=10.64s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=790
  - [PASS] latency_lt: 10.6s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']


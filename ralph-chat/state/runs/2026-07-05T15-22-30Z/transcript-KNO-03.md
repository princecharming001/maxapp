# KNO-03
## turn 0 ('what is mewing and does it actually work')
**user:** what is mewing and does it actually work
**assistant:** mewing is tongue posture training. you put your tongue on the back third of your palate, seal your lips, and keep your teeth in light contact. the idea is that sustained palatal contact reshapes the midface and improves jaw support over time. **does it actually work for adults.** marginal. mewing produces small changes in tongue posture and can reduce forward head posture if you're disciplined about it, but it won't reshape bone in a closed-suture adult. what does move the needle is the stuff around it: masseter training (jaw muscle thickening, visible in 8-12 weeks), neck training (keeps your head back so the jawline reads sharper), and getting body fat low enough that your existing structure shows. if you're serious about jaw aesthetics, mewing is the foundation (3 resets a day: morning, midday, night), but pair it with masseter work and neck training. mewing alone is mostly postural discipline, not structural magic.
- status=200 latency=11.44s error=None
- checks:
  - [PASS] no_tech_leak: clean
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=932
  - [PASS] latency_lt: 11.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['tongue', 'palate', 'jaw']
- needs_judge: ['answers_the_question', 'max_voice']


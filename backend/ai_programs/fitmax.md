# FitMax

## What it is
FitMax is a time-efficient training plan for busy people: 2–4 full-body strength sessions of 20–40 minutes a week, easy "zone 2" cardio and daily steps, short mobility and posture breaks, and simple protein and recovery habits. It is built to fit around work and sleep, and it progresses slowly. It is general fitness guidance, not physical therapy or a medical exercise program.

## Who it fits / who should check with a professional first
Fits: beginners to intermediate adults who want to get stronger, fitter and less stiff without long gym sessions; people returning after a break.

Check with a professional first (CDC: people with chronic conditions should talk with their doctor about the right type and amount of activity):
- Heart disease, high blood pressure that is not controlled, chest pain, fainting or unusual breathlessness with effort, diabetes on insulin, or a recent surgery or injury.
- Pregnancy or recent birth: activity is generally encouraged, but the plan should follow their clinician's advice (ACOG guidance); avoid lying flat on the back for long after the first trimester and contact sports.
- Joint, back or nerve pain that is current, sharp or getting worse: suggest a physical therapist; do not program around pain.
- History of eating disorders or compulsive exercise: avoid body-composition goals, calorie burn framing and daily training streaks; keep rest days mandatory.
- Older adults or anyone with balance issues or osteoporosis: include balance work, avoid jumping and loaded spinal flexion unless cleared.

## Habit library

### `strength_full_body` — Full-body strength
- minutes: 20 / 30 (up to 40)
- anchor: user's stored workout time; else before_work, lunch or after_work
- frequency: 2–3× per week (4 for users with 40+ min and experience)
- tier: core
- why: Adults are advised to do muscle-strengthening work for all major muscle groups at least 2 days a week.
- how: 1) Warm up 3 min (march, arm circles, bodyweight squats). 2) 4–6 moves covering squat, hinge, push, pull, carry/core (for example goblet squat, hip hinge or bridge, push-up, row, plank). 3) 2–3 sets of 8–12 reps, stopping with 2–3 reps "in the tank"; add reps or load gradually.
- conflicts/synergies: Needs ≥48 h before training the same muscles hard again. End 2+ hours before bed. Counts for LongevityMax `strength_2x`.
- source: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html

### `zone2_cardio` — Easy cardio (zone 2)
- minutes: 20 / 30 (up to 45)
- anchor: before_work, lunch, after_work, or commute (bike or brisk walk)
- frequency: 2–3× per week
- tier: core
- why: Higher cardiorespiratory fitness is strongly linked to lower long-term mortality; most of the 150 min/week of moderate activity can be easy, conversational effort.
- how: 1) Brisk walk, cycle, row, swim or jog. 2) Keep it at a pace where you can talk but not sing (the CDC talk test). 3) Build from 20 to 30–45 min over weeks.
- conflicts/synergies: Same as LongevityMax `zone2_cardio`. Fine on strength rest days. Moderate cardio in the evening is generally OK for sleep.
- source: https://www.cdc.gov/physical-activity-basics/measuring/index.html

### `daily_steps` — Daily step goal
- minutes: 0 / 0 (accumulated through the day)
- anchor: all day; commute and post-meal walks count
- frequency: daily
- tier: core
- why: More daily steps were linked to lower mortality, with benefits leveling off around 6,000–8,000 steps for adults 60+ and 8,000–10,000 for younger adults.
- how: 1) Find your current average. 2) Add about 1,000 per day each week or two. 3) Use the commute, calls on the move and post-meal walks.
- conflicts/synergies: Shared with LongevityMax and EnergyMax. Never count as a separate time cost.
- source: https://doi.org/10.1016/S2468-2667(21)00302-9

### `mobility_flow` — 5-minute mobility
- minutes: 5 / 8
- anchor: get_ready, work_break or wind_down
- frequency: 3–5× per week
- tier: core
- why: Regular range-of-motion work helps you move comfortably; ACSM recommends flexibility exercise at least 2–3 days a week.
- how: 1) Cat-cow ×8. 2) World's-greatest-stretch or lunge with reach ×4 per side. 3) Thoracic rotations ×6 per side, hip-flexor stretch 30 s per side.
- conflicts/synergies: Gentle version fits SleepMax wind-down. Pairs with `posture_break`.
- source: https://doi.org/10.1249/MSS.0b013e318213fefb

### `posture_break` — Desk posture reset
- minutes: 2 / 3
- anchor: work_break
- frequency: 2–4× per workday
- tier: core
- why: There is no single "correct" posture; changing position often and strengthening the upper back tends to feel better than holding one "perfect" pose.
- how: 1) Stand up, roll shoulders back and down 5×. 2) Chin tucks ×8 and doorway chest stretch 20 s. 3) Change your position when you sit back down.
- conflicts/synergies: Same slot as EnergyMax `movement_snack`; merge. Replaces the retired height/posture program (no height claims).
- source: https://doi.org/10.2519/jospt.2019.0610

### `upper_back_strength` — Upper-back strength
- minutes: 5 / 8
- anchor: after_work or inside a strength session
- frequency: 2–3× per week
- tier: medium
- why: Rows, band pull-aparts and face pulls build the muscles that help you hold an upright, comfortable posture for longer.
- how: 1) Band pull-aparts 2×15. 2) Rows (band, dumbbell or cable) 3×10–12. 3) Prone Y-T raises 2×8.
- conflicts/synergies: Fold into `strength_full_body` on training days; stand-alone on others. Do not schedule on the day after a heavy pulling session.
- source: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html

### `protein_each_meal` — Protein at each meal
- minutes: 0 / 2
- anchor: get_ready, lunch, dinner
- frequency: daily
- tier: core
- why: In a meta-analysis, extra protein during strength training improved muscle and strength gains, with little extra benefit past about 1.6 g per kg body weight per day total.
- how: 1) Include a palm-sized protein portion at each main meal (eggs, yogurt, fish, chicken, beans, tofu). 2) Add a protein snack after training if a meal is far off. 3) No tracking needed.
- conflicts/synergies: Same as EnergyMax `protein_first_meal`. Describe as a habit, not a gram target.
- source: https://bjsm.bmj.com/content/52/6/376

### `post_workout_meal` — Eat after training
- minutes: 0 / 2
- anchor: within ~2 hours after a strength session
- frequency: per strength session
- tier: medium
- why: Spreading protein over the day, including after training, helps people hit their total intake.
- how: 1) Plan training before a usual meal. 2) If not, have a simple protein snack. 3) Include water.
- conflicts/synergies: Late sessions: keep the post-workout meal light if close to bed (SleepMax).
- source: https://bjsm.bmj.com/content/52/6/376

### `vigorous_intervals` — Short interval session
- minutes: 10 / 15
- anchor: before_work, lunch or after_work (never in the last 2 hours before bed)
- frequency: 1× per week (only after 3–4 weeks of consistent training)
- tier: hard
- why: Vigorous effort counts double toward weekly aerobic targets and builds fitness quickly in little time.
- how: 1) Warm up 3–5 min. 2) 4–6 rounds of 30–60 s hard (bike, hill walk, rower) with 1–2 min easy. 3) Cool down 3 min.
- conflicts/synergies: Not the day before a heavy leg strength session. Skip for users with heart conditions unless cleared. Not within 2 hours of bed.
- source: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html

### `stair_or_burst` — Movement burst
- minutes: 1 / 2
- anchor: work_break
- frequency: 1–3× per day
- tier: medium
- why: Short daily bursts of vigorous activity (like fast stairs) were linked to lower mortality in non-exercisers.
- how: 1) Take the stairs fast for 1 min. 2) Or 20 s of fast squats, 3 times. 3) Easy walk to recover.
- conflicts/synergies: Same as EnergyMax `vigorous_burst` and LongevityMax `stair_snack`; count once.
- source: https://doi.org/10.1038/s41591-022-02100-x

### `balance_drill` — Balance practice
- minutes: 2 / 3
- anchor: get_ready (while brushing teeth)
- frequency: 3–5× per week
- tier: medium (core for 60+)
- why: Older adults are advised to include balance training; it is easy to stack on an existing routine.
- how: 1) Stand on one leg for 30 s per side near a counter. 2) Progress to eyes closed or heel-to-toe walks. 3) Hold on if unsteady.
- conflicts/synergies: Stacks with SkinHair AM routine timing.
- source: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html

### `recovery_day` — Rest and recovery day
- minutes: 0 / 15
- anchor: weekend or between strength days
- frequency: at least 1–2× per week
- tier: core
- why: Muscles need about 48 hours between hard sessions for the same groups; rest days keep training sustainable.
- how: 1) No hard training. 2) Easy walk or mobility only. 3) Prioritize sleep (SleepMax).
- conflicts/synergies: Pairs with CalmMax outdoor walk and SleepMax.
- source: https://doi.org/10.1249/MSS.0b013e318213fefb

### `long_walk_weekend` — Weekend long walk
- minutes: 30 / 60
- anchor: weekend
- frequency: 1× per week
- tier: hard
- why: An easy longer session adds aerobic volume with low injury risk.
- how: 1) Hike, long walk or easy bike ride. 2) Conversational pace. 3) Bring a friend (CalmMax connection).
- conflicts/synergies: Counts for LongevityMax, CalmMax outdoor time and social connection.
- source: https://doi.org/10.1038/s41598-019-44097-3

### `training_log` — Quick training log
- minutes: 1 / 2
- anchor: right after each session
- frequency: per session
- tier: medium
- why: Writing down sets, reps and load makes gradual progression (the main driver of strength gains) easy.
- how: 1) Note each move's weight and reps. 2) Tap how hard it felt (1–10). 3) Next time, add 1–2 reps or a small amount of weight if it felt ≤7.
- conflicts/synergies: Feeds plan progression.
- source: https://doi.org/10.1249/MSS.0b013e318213fefb

## What the AI needs to know (intake)
1. `training_experience` (required) — Sets starting volume, exercise choices and progression speed.
   Q: "How would you describe your training right now?" Options: New or returning after a long break | Some training, not consistent | Training regularly
2. `equipment_access` (required) — Picks exercise variants.
   Q: "What can you train with?" Options: Just bodyweight | Bands or a few dumbbells at home | Full gym
3. `health_flags` (required) — Decides whether to require "check with your doctor" and to remove intervals, jumps or heavy lifts.
   Q: "Any of these apply to you?" Options: None | Heart or blood-pressure condition | Current pain or injury | Pregnant or recently gave birth | Prefer not to say (treat as cautious)
4. `sessions_per_week` (optional) — Sets strength frequency (default 2 if not answered).
   Q: "How many workouts a week feels realistic?" Options: 2 | 3 | 4
5. `current_steps` (optional) — Sets the starting step goal.
   Q: "About how much do you walk on a normal day?" Options: Under 4,000 steps | 4,000–7,000 | 7,000–10,000 | 10,000+ | No idea

## Scheduling rules
- Place strength sessions at the user's stored workout time; otherwise before_work, lunch or after_work by free time.
- Same-muscle strength sessions at least 48 h apart (for example Mon/Thu, or Mon/Wed/Fri full body). With 4 sessions, use upper/lower or alternate full-body A/B and never train the same pattern hard on back-to-back days.
- Vigorous sessions (intervals, heavy lifting) end at least 2 hours before bed; moderate cardio and mobility are fine later.
- Do not stack intervals the day before heavy leg strength.
- At least 1 full rest or easy day per week; 2 if the user is new or sleep is short.
- Strength session length by budget share: 20 min (2 rounds, 4 moves), 30 min (3 rounds, 5 moves), 40 min (3 rounds, 6 moves + core/carry).
- Week 1 ramp: 2 strength sessions at about 60% of planned volume (1–2 sets), daily steps baseline, mobility 3×. Week 2: add zone-2 cardio 1–2×. Week 3–4: full volume; add a third strength day if adherence is good. Intervals only after week 4.
- Progression: add reps first, then load; increase weekly volume by no more than about 10%.
- Steps: start from current average and add about 1,000/day every 1–2 weeks to a target of 7,000–10,000.
- Scaling: ~10 min/day → 2× 20-min strength + steps + posture breaks. 20–30 min/day → 3× 30-min strength + 2× zone 2 + mobility. 40+ min/day → 3–4 strength + 2–3 zone 2 + 1 interval + long weekend walk.
- Weekend: good slot for the long walk or a third session; keep at least one weekend day easy.
- Merge duplicates across programs (steps, bursts, zone 2, protein habits) so the user never sees two copies.

## Safety and claims
- No height-increase claims, "fix your posture to grow taller", or bone-lengthening ideas. Posture work is for comfort and strength only.
- No supplements, creatine/protein-powder dosing, pre-workouts, peptides, SARMs, steroids, hormones or other drugs. Protein is described as food habits, never as a gram-per-kg prescription for the user.
- No calorie targets, weight-loss guarantees, body-fat goals, "burn off" framing or before/after promises.
- No training through sharp pain, chest pain, dizziness or unusual breathlessness: tell the user to stop and seek medical advice.
- No rehab programs for injuries; suggest a physical therapist.
- Respect pregnancy, heart, and blood-pressure flags: remove intervals, heavy lifts and breath-holding (Valsalva) cues; add "check with your clinician".
- No extreme challenges (daily max-effort, 2-a-days for beginners, punishment workouts).

## Sources
- https://www.cdc.gov/physical-activity-basics/guidelines/adults.html
- https://www.cdc.gov/physical-activity-basics/measuring/index.html
- https://doi.org/10.1249/MSS.0b013e318213fefb
- https://doi.org/10.1016/S2468-2667(21)00302-9
- https://doi.org/10.1001/jamanetworkopen.2018.3605
- https://bjsm.bmj.com/content/52/6/376
- https://doi.org/10.1038/s41591-022-02100-x
- https://doi.org/10.2519/jospt.2019.0610
- https://pubmed.ncbi.nlm.nih.gov/31451200/
- https://pubmed.ncbi.nlm.nih.gov/30374942/
- https://www.acog.org/womens-health/faqs/exercise-during-pregnancy
- https://doi.org/10.1038/s41598-019-44097-3

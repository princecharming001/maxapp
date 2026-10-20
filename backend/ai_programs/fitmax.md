# FitMax

## What it is
FitMax trains the two adaptations that matter most for health and performance: muscle (progressive strength work plus enough protein switches on muscle protein synthesis) and cardiorespiratory fitness (easy aerobic volume plus short hard intervals raise VO2max, stroke volume and plasma volume). The adaptation happens during recovery, so FitMax also runs the levers that help or blunt it: sleep (one sleepless night cut muscle protein synthesis by about 18%), rest days, fluids and electrolytes for long sessions, heat after training, caffeine timing, keeping cold plunges away from lifting, and a simple readiness signal. It is 2–4 short sessions a week that fit around work and sleep and progress slowly. It is general fitness, not physical therapy or a medical exercise program.

## Who it fits / who should check with a professional first
Fits: beginner to intermediate adults who want more strength, fitness and better recovery in 20–40 minute sessions; people returning after a break.

Check with a professional first (CDC: people with chronic conditions should talk with their doctor about the right type and amount of activity):
- Heart disease, uncontrolled high blood pressure, chest pain, fainting or unusual breathlessness on effort, diabetes on insulin, or a recent surgery or injury: until cleared, no intervals, saunas or cold plunges.
- Pregnancy or recent birth: follow their clinician and ACOG guidance; no intervals, saunas, hot tubs or overheating, and no lying flat for long after the first trimester.
- Current sharp or worsening joint, back or nerve pain: a physical therapist; never program around pain.
- History of eating disorders or compulsive exercise: no body-composition goals; rest days are mandatory.
- Older adults, osteoporosis or balance problems: balance work is core; no jumping or loaded spinal flexion unless cleared.
- Kidney disease: check protein and added-salt advice with their clinician.
- Raynaud's or cold sensitivity: no cold immersion. Under 18: no sauna and no pre-workout caffeine.

## Habit library

### `strength_full_body` — Full-body strength
- minutes: 20 / 30
- kind: action
- lever: movement
- anchor: workout (their workout time; else after_work or lunch)
- frequency: 2–3 times a week (4 for experienced people with 40+ min)
- tier: core
- avoid if: none
- why: In a meta-analysis of 16 cohorts, 30–60 minutes a week of muscle-strengthening work was linked to about 10–20% lower risk of death, heart disease and cancer.
- how: 1) Warm up for 3 minutes (marching, arm circles, bodyweight squats). 2) Do 4–6 moves covering squat, hinge, push, pull (rows or band pull-aparts) and a carry or plank, matched to your equipment. 3) Do 2–3 sets of 8–12 reps, stopping with 2–3 reps left in the tank, breathing out on the effort, and note the weight and reps.
- conflicts/synergies: At least 48 h before training the same muscles hard again. Ends at least 2 h before bed (SleepMax `exercise_timing`). No cold plunge afterwards (`cold_timing`). Same idea as LongevityMax `strength_2x`; schedule one. A pull move every session covers the upper back.
- source: https://pubmed.ncbi.nlm.nih.gov/35228201/

### `zone2_cardio` — Easy aerobic base
- minutes: 20 / 30
- kind: action
- lever: movement
- anchor: workout (or after_work; the long one at the weekend)
- frequency: 2–3 times a week
- tier: core
- avoid if: none
- why: Among 122,007 adults given treadmill tests, the least fit had about 5 times the death risk of the fittest; easy volume builds the base, paired with intervals for the top end.
- how: 1) Brisk walk, cycle, row, swim or jog. 2) Keep a pace where you can talk in full sentences but not sing. 3) Build from 20 to 30–45 minutes; one weekend session can be a 45–60 minute walk, hike or ride.
- conflicts/synergies: Same habit as LongevityMax `zone2_cardio`; CalmMax `move_it_out` that day counts. Fine on strength rest days and in the evening.
- source: https://pubmed.ncbi.nlm.nih.gov/30646252/

### `vigorous_intervals` — 4×4 intervals
- minutes: 15 / 30
- kind: action
- lever: movement
- anchor: workout (never in the last 2 h before bed)
- frequency: 1 time a week (2 for an endurance goal after week 6)
- tier: hard
- avoid if: heart condition or high blood pressure, pregnancy, fainting
- why: In a randomized trial, 4 × 4-minute intervals at 90–95% of max heart rate, 3 times a week for 8 weeks, raised VO2max 7.2%, while easier training matched for work did not.
- how: 1) Warm up easy for 5–10 minutes. 2) Do 4 rounds of 4 minutes hard (only a few words possible) with 3 minutes easy between; beginners start with 4 × 1 minute. 3) Cool down for 5 minutes.
- conflicts/synergies: Not the day before heavy legs. Unlocks after 4 consistent weeks. Same idea as LongevityMax `interval_4x4`; schedule one.
- source: https://pubmed.ncbi.nlm.nih.gov/17414804/

### `daily_steps` — Daily step goal
- minutes: 1 / 10
- kind: action
- lever: movement
- anchor: afternoon (late afternoon, with time left to top up)
- frequency: daily
- tier: core
- avoid if: none
- why: Across 15 cohorts (47,471 adults), death risk fell as steps rose and leveled off around 6,000–8,000 a day at 60+ and 8,000–10,000 for younger adults.
- how: 1) Check today's step count. 2) Short of your target (7,000–10,000 depending on age)? Walk 10–20 min now, outside if you can. 3) Already there? Tick it; post-meal and lunch walks count.
- conflicts/synergies: Same as LongevityMax `daily_steps`; never a separate time cost. EnergyMax `vigorous_burst` and LongevityMax `stair_snack` count here.
- source: https://pubmed.ncbi.nlm.nih.gov/35247352/

### `mobility_flow` — 5-minute mobility
- minutes: 5 / 8
- kind: action
- lever: movement
- anchor: after_work (a gentle version in wind_down)
- frequency: 3–5 times a week
- tier: medium
- avoid if: none
- why: Across 11 trials, strength training improved range of motion as much as stretching, so short mobility work plus full-range lifting covers flexibility.
- how: 1) Cat–cow × 8. 2) Lunge with reach × 4 per side, then thoracic rotations × 6 per side. 3) Hip-flexor stretch for 30 seconds per side, breathing slowly.
- conflicts/synergies: The gentle version fits SleepMax `wind_down`. CalmMax `slow_yoga` counts that day. Good on recovery days.
- source: https://pubmed.ncbi.nlm.nih.gov/33917036/

### `balance_drill` — Balance practice
- minutes: 2 / 3
- kind: action
- lever: movement
- anchor: wake (while brushing teeth)
- frequency: 3–5 times a week
- tier: medium
- avoid if: severe vertigo, acute ankle or knee injury
- why: In the Cochrane review of 39 trials (7,920 older adults), balance and functional exercise cut the rate of falls by 24%.
- how: 1) Stand on one leg for 30 seconds per side with a hand near the counter. 2) Progress to eyes closed or heel-to-toe walking. 3) Hold on whenever you feel unsteady.
- conflicts/synergies: Same idea as LongevityMax `balance_practice`; schedule one. Core at 60+.
- source: https://pubmed.ncbi.nlm.nih.gov/30703272/

### `protein_each_meal` — Protein at each meal
- minutes: 0 / 2
- kind: action
- lever: nutrition
- anchor: lunch and dinner (plus a snack after training when the next meal is 2+ h away)
- frequency: daily
- tier: core
- avoid if: kidney disease
- why: In 49 trials, extra protein during strength training added strength and muscle with no further gain above about 1.6 g per kg a day; spreading it over 3–4 meals is the practical route.
- how: 1) Put a palm-sized protein on the plate at this meal (eggs, Greek yogurt, fish, chicken, tofu, beans, cottage cheese). 2) If you just trained and your next meal is more than about 2 hours away, have a protein snack now. 3) Have water with it.
- conflicts/synergies: Same as LongevityMax `protein_each_meal`; EnergyMax `protein_first_meal` covers breakfast. Food habit only, never a gram target. Late sessions get a small snack (SleepMax `late_meal_buffer`).
- source: https://pubmed.ncbi.nlm.nih.gov/28698222/

### `session_hydration` — Fluids and salt
- minutes: 1 / 2
- kind: action
- lever: hydration
- anchor: workout (sessions over 60 min, or hot or humid days)
- frequency: 1–2 times a week (long or hot sessions only)
- tier: medium
- avoid if: kidney disease, fluid restriction
- why: The ACSM aims to keep sweat losses under 2% of body weight during exercise, because larger water deficits degrade performance; for long sessions electrolyte drinks can beat water.
- how: 1) Drink a glass or two of water before you start, with a salty snack unless you've been told to limit salt. 2) Sip to thirst during the session; past an hour, switch to a drink with electrolytes. 3) Afterwards, drink until your urine is pale, without forcing large volumes.
- conflicts/synergies: Suppmax `electrolytes` stays daytime only, never daily. Applies after sauna sessions too. Never drink so much that you gain weight during exercise.
- source: https://pubmed.ncbi.nlm.nih.gov/17277604/

### `preworkout_caffeine` — Pre-workout coffee
- minutes: 0 / 0
- kind: rule
- lever: caffeine
- anchor: workout (30–60 min before; only if the session starts before the caffeine cutoff)
- frequency: on training days (optional)
- tier: hard
- avoid if: pregnancy, heart condition or high blood pressure, panic attacks, under 18
- why: Caffeine about 60 minutes before exercise consistently improves endurance, strength and power, but a pre-workout-sized dose needs about 13 h before bed to spare sleep.
- how: 1) If you use caffeine for training, have your usual coffee or tea 30–60 minutes before. 2) Skip it when the session falls after your caffeine cutoff. 3) No energy drinks or powders, and nothing on top of your usual daily amount.
- conflicts/synergies: Governed by `caffeine_cutoff` (the stricter wins); counts toward daily caffeine. Evening trainers effectively never get it.
- source: https://pubmed.ncbi.nlm.nih.gov/33388079/

### `cold_timing` — No cold after lifting
- minutes: 0 / 0
- kind: rule
- lever: temperature
- anchor: workout (strength days)
- frequency: on strength days
- tier: medium
- avoid if: none
- why: Cold-water immersion after resistance training blunted muscle growth and strength gains in meta-analyses without hurting endurance gains.
- how: 1) On strength days, skip plunges and long cold showers after the session. 2) Put cold water on rest or cardio-only days, or before training. 3) If it has to be the same day, keep it hours away from lifting.
- conflicts/synergies: Applies to any program's cold habit (FocusMax, EnergyMax, CalmMax `cold_shower_finish`). Cold for soreness after hard cardio or sport is fine for people without heart or cold flags. No cold in the last 2 h before bed.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC11235606/

### `sauna_after_training` — Post-workout sauna
- minutes: 10 / 20
- kind: action
- lever: temperature
- after: strength_full_body
- anchor: workout (right after the session; only with sauna access; ends 1–2 h before bed)
- frequency: 2–3 times a week
- tier: hard
- avoid if: heart condition or high blood pressure, low blood pressure, pregnancy, fainting, epilepsy, under 18
- why: Runners who sat in a hot sauna after training about 4 times a week for 3 weeks ran 32% longer to exhaustion and grew plasma volume 7.1% (a small study).
- how: 1) Drink a glass of water first. 2) Sit for 10–20 minutes (start with 5–10) and leave at once if dizzy, nauseous or your heart pounds. 3) Cool down gradually with a lukewarm shower, then drink to replace the sweat.
- conflicts/synergies: No alcohol before. Not the same evening as SleepMax `warm_shower`. Pairs with `session_hydration`. Heat after lifting has no known muscle-growth penalty, unlike cold. Same lever as LongevityMax `sauna_session` and CalmMax `heat_session`; schedule one.
- source: https://pubmed.ncbi.nlm.nih.gov/16877041/

### `recovery_day` — Rest and recovery day
- minutes: 0 / 0
- kind: rule
- lever: rest
- anchor: weekend (or any day between strength days)
- frequency: 1–2 times a week
- tier: core
- avoid if: none
- why: Trained lifters who took a full week off midway through a 9-week program grew as much muscle as those who trained straight through, so planned rest costs little.
- how: 1) No hard training today. 2) Easy walk or mobility only. 3) Protect tonight's sleep window.
- conflicts/synergies: Pairs with CalmMax `outdoor_walk` and SleepMax. A lighter week (about half the sets) every 6–8 weeks is a scheduling rule.
- source: https://pubmed.ncbi.nlm.nih.gov/38274324/

### `readiness_check` — Readiness check
- minutes: 1 / 1
- kind: checkin
- lever: tracking
- anchor: wake (only for people who wear a tracker)
- frequency: daily
- tier: hard
- avoid if: none
- why: Training guided by HRV improved vagal HRV more than fixed plans, and rolling 7-day averages are more reliable than single readings.
- how: 1) Compare this morning's resting heart rate or HRV with your 7-day average. 2) If resting heart rate is clearly up or HRV clearly down for 2+ days and you feel run-down, swap today's hard session for easy cardio or rest. 3) Otherwise train as planned and ignore one-night dips.
- conflicts/synergies: Same number as SleepMax `sleep_log` (one card). Signs of illness mean rest.
- source: https://pubmed.ncbi.nlm.nih.gov/34639599/

### `training_log` — Quick training log
- minutes: 1 / 2
- kind: checkin
- lever: tracking
- anchor: workout (right after each session)
- frequency: after each session
- tier: medium
- avoid if: none
- why: Muscle growth rose with more weekly sets in trained men, and adding reps or load over time is how that volume grows, so a log makes the progression visible.
- how: 1) Note each move's weight and reps. 2) Rate how hard it felt, 1–10. 3) Next session, add 1–2 reps or a little weight wherever it felt 7 or less.
- conflicts/synergies: Feeds plan progression; no punishment streaks.
- source: https://pubmed.ncbi.nlm.nih.gov/30153194/

## What the AI needs to know (intake)
1. `fitness_goal` (required) — The plan's shape: muscle → 3 strength days, protein, `cold_timing`; endurance → zone 2 plus intervals, `session_hydration`, sauna; fat loss → strength, steps, zone 2; aches → mobility, balance, gentle strength.
   Q: "What's your main fitness goal right now?" Options: Build muscle and strength | Lose fat | Better endurance | Move without aches | General fitness
2. `training_experience` (required) — Starting volume, progression speed and when intervals unlock.
   Q: "How would you describe your training right now?" Options: New or returning after a long break | Some training, not consistent | Training regularly
3. `equipment_access` (required) — Picks exercise variants.
   Q: "What can you train with?" Options: Just bodyweight | Bands or a few dumbbells at home | Full gym
4. `health_flags` (required, multi) — Removes intervals, the sauna, pre-workout caffeine and cold guidance per each habit's avoid-if (shared across programs).
   Q: "Do any of these apply to you?" Options: None of these | Heart or blood-pressure condition | Pregnant or breastfeeding | Pain or injury | Raynaud's or cold sensitivity | Panic attacks, seizures or fainting | Prefer not to say
5. `heat_access` (optional) — Whether `sauna_after_training` appears (shared).
   Q: "Which of these can you use most weeks?" Options: A sauna | A bathtub | Both | Neither
6. `wears_tracker` (optional) — Shows `readiness_check` only to people with a tracker (shared with SleepMax).
   Q: "Do you wear something that tracks your sleep or heart rate at night?" Options: Yes, most nights | Sometimes | No

## Scheduling rules
- Strength, intervals and zone 2 go at their workout time; otherwise after work or at lunch.
- Same-muscle hard sessions at least 48 h apart. With 4 sessions, upper/lower; never the same pattern hard on back-to-back days.
- Hard sessions end at least 2 h before bed (4 h if SleepMax is active or sleep is a goal); moderate cardio and mobility can go later.
- Intervals from week 5, once a week (twice for endurance after week 6), never the day before heavy legs.
- Caffeine before training only when the session starts before the caffeine cutoff (9 h before bed by default; 13 h for large doses).
- Cold water never in the hours after strength sessions; on rest or cardio days, or before training.
- Sauna right after a session, 2–3 times a week, ending 1–2 h before bed; never on drinking days or the same evening as `warm_shower`; ramp from 5–10 min.
- `session_hydration` only on sessions of 60+ min or hot days.
- At least 1 full rest or easy day a week (2 if new, or after a night under 6 h). A lighter week (about half the sets) every 6–8 weeks, or when readiness flags 3+ days.
- Week 1: 2 strength sessions at about 60% volume, the step baseline, mobility 3 times. Week 2: add zone 2. Weeks 3–4: full volume, a third strength day if adherence is good. Sauna from week 2.
- Progression: reps first, then load; weekly volume up no more than about 10%. Steps up about 1,000 a day every 1–2 weeks toward 7,000–10,000 (6,000–8,000 at 60+).
- Time budget: about 10 min a day → 2 × 20-min strength, steps, mobility. 20–30 min → 3 × 30-min strength, 2 zone 2, mobility. 40+ min → 3–4 strength, 2–3 zone 2, 1 interval, a weekend long zone 2, sauna if available.
- Merge duplicates across programs (steps, bursts, zone 2, protein, balance) so they see one copy.

## Safety and claims
- No height-increase claims; posture and mobility work is for comfort only.
- No supplements in FitMax (creatine, protein powder and electrolytes live in Suppmax). No pre-workout powders, energy drinks, peptides, SARMs, steroids or hormones. Caffeine only as their usual coffee or tea; never compute an mg/kg dose for them.
- No calorie targets, body-fat goals, "burn off" framing or before/after promises. Protein is food habits, not a gram-per-kg prescription.
- Stop on chest pain, dizziness, fainting or unusual breathlessness and seek care. No training through sharp pain; no rehab programs.
- Heart, blood-pressure, pregnancy, fainting or epilepsy flags: no intervals, saunas, cold plunges or breath-holding cues. Sauna is also ruled out with unstable angina, a recent heart attack and severe aortic stenosis.
- Heat: leave at any dizziness or nausea; no alcohol. Pregnancy: avoid overheating. Men trying to conceive: frequent sauna temporarily lowers sperm counts (reversible).
- Cold: no immersion with Raynaud's or cold sensitivity; never present ice baths as muscle-building (they blunt it).
- Hydration: don't overdrink (risk of low blood sodium); kidney disease or fluid restriction goes to a clinician.
- Not offered: a strict "anabolic window" (timing fades once total protein is matched), "zone 2 is optimal for mitochondria" claims, contrast baths (soreness only, high risk of bias), posture correction for its own sake, extreme challenges, daily max efforts or punishment workouts.

## Sources
- https://pubmed.ncbi.nlm.nih.gov/35228201/
- https://pubmed.ncbi.nlm.nih.gov/30646252/
- https://pubmed.ncbi.nlm.nih.gov/40560504/
- https://pubmed.ncbi.nlm.nih.gov/17414804/
- https://pubmed.ncbi.nlm.nih.gov/35247352/
- https://pubmed.ncbi.nlm.nih.gov/36482104/
- https://pubmed.ncbi.nlm.nih.gov/33917036/
- https://pubmed.ncbi.nlm.nih.gov/30703272/
- https://pubmed.ncbi.nlm.nih.gov/28698222/
- https://pubmed.ncbi.nlm.nih.gov/24299050/
- https://pubmed.ncbi.nlm.nih.gov/17277604/
- https://pubmed.ncbi.nlm.nih.gov/33388079/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11235606/
- https://pubmed.ncbi.nlm.nih.gov/26174323/
- https://pubmed.ncbi.nlm.nih.gov/26581833/
- https://pubmed.ncbi.nlm.nih.gov/16877041/
- https://pubmed.ncbi.nlm.nih.gov/25705824/
- https://pubmed.ncbi.nlm.nih.gov/11165553/
- https://pubmed.ncbi.nlm.nih.gov/33400856/
- https://pubmed.ncbi.nlm.nih.gov/38274324/
- https://pubmed.ncbi.nlm.nih.gov/34639599/
- https://pubmed.ncbi.nlm.nih.gov/30153194/
- https://www.cdc.gov/physical-activity-basics/guidelines/adults.html
- https://www.acog.org/womens-health/faqs/exercise-during-pregnancy

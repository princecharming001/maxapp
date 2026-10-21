# LongevityMax

## What it is
LongevityMax trains the strongest modifiable predictors of healthspan: aerobic fitness (VO2max; low versus elite fitness carried about five times the risk of death), muscle strength and mass, balance (falls are a major cause of lost healthy years), blood pressure, ApoB and LDL, Lp(a) and glucose, sleep and body-clock regularity, diet quality (fiber and olive oil) and alcohol. Each habit trains the system (cardio, intervals, strength, balance, heat), feeds it (fiber, olive oil, protein), protects it (sleep regularity, alcohol) or measures it (biomarkers, resting heart rate and HRV). It gives no medical advice, never interprets lab values into treatment, and makes no lifespan promises.

## Who it fits / who should check with a professional first
Fits: adults from about 30, with the most value at 40+, who want more healthy years and like measurable markers.

Check with a professional first:
- Known heart disease, chest pain or breathlessness on exertion, an arrhythmia or uncontrolled high blood pressure: get cleared before moderate or vigorous exercise (ACSM pre-exercise screening).
- Diabetes with complications, kidney disease (protein limits), recent surgery, osteoporosis or a fall in the last year.
- Pregnancy: no sauna or intervals; follow the clinician's plan for activity.
- Heavy daily drinking: cutting down needs medical support, because stopping abruptly can be dangerous.
- Digestive conditions (IBD, a history of bowel obstruction): raise fiber only with clinician guidance.
- History of an eating disorder: skip food-rule framing.
- Anyone considering metformin, rapamycin or NAD+ products: not offered here; that is a conversation with their clinician.

## Habit library

### `zone2_cardio` — Conversational cardio
- minutes: 20 / 40
- kind: action
- lever: movement
- anchor: after_work (or weekend; one session a week can be a long walk in a park or on a trail)
- frequency: 3 times a week
- tier: core
- avoid if: breathlessness or dizziness on mild effort
- why: In 122,007 treadmill-tested adults, low fitness carried about 5 times the death risk of elite fitness, worse than smoking or diabetes; 150–299 min a week of moderate activity went with 19–25% lower mortality.
- how: 1) Pick brisk walking, cycling, jogging, rowing or incline walking, outdoors in daylight when you can. 2) Warm up 5 min, then hold a pace where you can talk in full sentences but couldn't sing. 3) Keep that pace for the session and finish with 3 min easy.
- conflicts/synergies: Once unlocked, `interval_4x4` replaces one session a week. Counts toward `daily_steps`. The weekend outdoor session doubles as green time (green space and daylight are linked to lower mortality). Same habit as FitMax `zone2_cardio`; CalmMax `move_it_out` that day counts. With a heart or blood-pressure flag, add a check-with-your-clinician note before the first session.
- source: https://pubmed.ncbi.nlm.nih.gov/30646252/

### `interval_4x4` — 4×4 intervals
- minutes: 25 / 35
- kind: action
- lever: movement
- anchor: weekend (or after_work, on a day without strength training)
- frequency: once a week (twice once comfortable)
- tier: hard
- avoid if: heart disease, arrhythmia, uncontrolled high blood pressure, pregnancy, chest pain or fainting on exertion, fewer than 4 weeks of regular cardio
- why: Four 4-minute bouts at 90–95% of max heart rate, 3 times a week for 8 weeks, raised VO2max by 7.2%; the same total work at moderate intensity did not.
- how: 1) Warm up 10 min easy (walk, bike, row or uphill). 2) Do 4 rounds of 4 min hard, where you can only say a few words, each followed by 3 min easy. 3) Cool down for 5 min.
- conflicts/synergies: Replaces one `zone2_cardio` session. At least 48 h from another hard session and finished at least 2 h before bed. The biggest lever on VO2max. Same idea as FitMax `vigorous_intervals`; schedule one.
- source: https://pubmed.ncbi.nlm.nih.gov/17414804/

### `strength_2x` — Full-body strength
- minutes: 20 / 30
- kind: action
- lever: movement
- anchor: after_work (on non-consecutive days)
- frequency: 2 times a week
- tier: core
- avoid if: recent surgery or hernia, osteoporosis with a prior fracture
- why: Across 16 cohort studies, 30–60 minutes a week of muscle-strengthening went with 10–20% lower all-cause, heart and cancer mortality, with no extra benefit beyond that.
- how: 1) Do 4–6 moves: sit-to-stand or squat, hip hinge, push-up (a wall or bench is fine), a row with a loaded backpack, and a carry. 2) Do 2–3 sets of 6–15 reps, stopping with 1–3 good reps left, breathing out on the effort (no breath holding, no max lifts). 3) Note reps and load; next time add a rep or a little weight.
- conflicts/synergies: Pair with `protein_each_meal`. Keep `cold_shower_finish` (EnergyMax, FocusMax, CalmMax) at least 4 h away. Same idea as FitMax `strength_full_body`; schedule one. Logged loads double as the strength marker (grip strength predicts mortality).
- source: https://pubmed.ncbi.nlm.nih.gov/35228201/

### `daily_steps` — Hit your step floor
- minutes: 1 / 10
- kind: action
- lever: movement
- anchor: afternoon (late afternoon, with time left to top up)
- frequency: daily
- tier: core
- avoid if: none
- why: Across 15 cohorts, the top step group (about 10,900 a day) had 53% lower mortality than the bottom; the benefit leveled off at 6,000–8,000 steps at 60+ and 8,000–10,000 under 60.
- how: 1) Check today's step count. 2) Short of your target (7,000–10,000 depending on age)? Walk 10–20 min now, outside if you can. 3) Already there? Tick it; post-meal and lunch walks count.
- conflicts/synergies: Fed by EnergyMax `post_meal_walk`, `outdoor_lunch` and `slump_reset` and by `zone2_cardio`. Same habit as FitMax `daily_steps`; schedule once.
- source: https://pubmed.ncbi.nlm.nih.gov/35247352/

### `stair_snack` — 1-minute bursts
- minutes: 1 / 2
- kind: action
- lever: movement
- anchor: work_break (spread through the day, at least 1 h apart)
- frequency: daily
- tier: medium
- avoid if: heart disease, arrhythmia, uncontrolled high blood pressure, chest pain or fainting on exertion
- why: In 25,241 non-exercisers wearing trackers, about three 1–2 minute bursts of vigorous daily activity went with 38–40% lower all-cause mortality and 48–49% lower heart mortality.
- how: 1) Take 2–3 flights of stairs at a pace that makes you breathe hard. 2) No stairs? Walk fast uphill, or briskly carrying a heavy bag, for 1 min. 3) Repeat up to 3 times today, spaced out.
- conflicts/synergies: Same mechanism as EnergyMax `vigorous_burst`; one burst counts for both. People this rules out get `move_after_sitting` instead.
- source: https://pubmed.ncbi.nlm.nih.gov/36482104/

### `move_after_sitting` — Hourly walk break
- minutes: 2 / 5
- kind: action
- lever: movement
- anchor: work_break (after each 45–60 min of sitting)
- frequency: weekdays
- tier: core
- avoid if: none
- why: Breaking up sitting with 2–5 minute light walks clearly blunted post-meal glucose and insulin across 7 trials, and long unbroken sitting is linked to higher mortality.
- how: 1) Stand up after each long stretch of sitting. 2) Walk at an easy pace for 2–5 min: a hallway lap, stairs at a gentle pace, a water refill. 3) Sit back down and carry on.
- conflicts/synergies: Same concept group as EnergyMax `movement_snack`, FocusMax `micro_break` and FitMax `posture_break`: one card. The gentle version of `stair_snack` for anyone a health flag rules out of bursts.
- source: https://pubmed.ncbi.nlm.nih.gov/35147898/

### `balance_practice` — One-leg stand
- minutes: 2 / 3
- kind: action
- lever: movement
- anchor: wake (while brushing your teeth, a hand near the counter)
- frequency: daily
- tier: core
- avoid if: severe vertigo, acute ankle or knee injury
- why: Adults 51–75 who couldn't hold a 10-second one-leg stand had 84% higher risk of death over 7 years, and balance training cuts falls by 24% (high-certainty Cochrane evidence).
- how: 1) Stand within reach of the counter. 2) Lift one foot and hold for up to 30 s, then switch; do 2–3 rounds per leg. 3) When it gets easy, try it with eyes closed or slow arm movements, still within reach of the counter.
- conflicts/synergies: Same idea as FitMax `balance_drill`; schedule one. Once a month, log "can I hold 10 s on each leg?" in `vitals_check`. Medium tier under 50, core at 50+.
- source: https://pubmed.ncbi.nlm.nih.gov/35728834/

### `sauna_session` — Finnish sauna
- minutes: 10 / 20
- kind: action
- lever: temperature
- anchor: after_work (after training or in the evening; never after drinking)
- frequency: 3 times a week (building toward 4–7)
- tier: hard
- avoid if: unstable angina, recent heart attack, severe aortic stenosis, uncontrolled high blood pressure, fainting or low blood pressure on standing, pregnancy, fever or acute illness
- why: In 2,315 Finnish men followed about 21 years, 4–7 sessions a week (vs 1) went with 63% lower sudden cardiac death and fewer deaths overall; sessions over 19 minutes did better.
- how: 1) Drink a glass of water before you go in. 2) Sit 10–20 min at a heat you tolerate, starting with 5–10 min; leave at once if you feel dizzy, sick, or your heart races. 3) Cool down gradually, sit for 5 min and drink water.
- conflicts/synergies: Only with sauna access. Never with alcohol that day (raises the risk of low blood pressure, arrhythmia and sudden death). A cold rinse after only with no health flags. Works well after `strength_2x` or `zone2_cardio`. Sauna lowers sperm counts for a while, so men trying to conceive can skip it. Same lever as CalmMax `heat_session`; schedule one.
- source: https://pubmed.ncbi.nlm.nih.gov/25705824/

### `veg_first` — Veg first
- minutes: 1 / 1
- kind: action
- lever: nutrition
- anchor: dinner (and lunch if EnergyMax `lunch_balance` isn't on)
- frequency: daily
- tier: core
- avoid if: insulin or sulfonylurea use
- why: Eating vegetables and protein before carbs cut post-meal glucose by 29–37% in type 2 diabetes, and more than half a tablespoon of olive oil a day went with 19% lower mortality.
- how: 1) Start the meal with the vegetables on your plate. 2) Dress them with a spoon of extra-virgin olive oil instead of butter or a creamy dressing. 3) Eat protein next, and starches and sweets last.
- conflicts/synergies: Merges with EnergyMax `lunch_balance` at lunch. Pairs with `fiber_swap`. In the PREDIMED trial a Mediterranean diet with extra-virgin olive oil cut major heart events (HR 0.69).
- source: https://pubmed.ncbi.nlm.nih.gov/26106234/

### `fiber_swap` — Fiber swap
- minutes: 1 / 2
- kind: action
- lever: nutrition
- anchor: lunch (or whichever meal is most refined)
- frequency: daily
- tier: core
- avoid if: inflammatory bowel disease flare, recent bowel surgery, a prescribed low-fiber diet
- why: Pooled data from 185 cohorts and 58 trials link 25–29 g of fiber a day to 15–30% lower all-cause and heart mortality, type 2 diabetes and colorectal cancer.
- how: 1) At this meal, swap one refined carb for a high-fiber one: beans or lentils, oats, whole-grain bread, berries, or an extra serving of vegetables. 2) Aim for about 8–10 g of fiber at this meal. 3) Drink a glass of water with it.
- conflicts/synergies: Raise by about 5 g a week to avoid bloating. Strengthens the glucose effect of `veg_first` and `lunch_balance`.
- source: https://pubmed.ncbi.nlm.nih.gov/30638909/

### `protein_each_meal` — Protein each meal
- minutes: 1 / 3
- kind: action
- lever: nutrition
- anchor: lunch and dinner
- frequency: daily
- tier: medium
- avoid if: advanced kidney disease
- why: Adults over 65 need at least 1.0–1.2 g of protein per kg a day (1.2+ if active), about 25–30 g per meal, to keep building muscle (PROT-AGE).
- how: 1) Put a palm-plus portion of protein on the plate, about 25–30 g: fish, eggs, tofu, Greek yogurt, legumes, poultry or meat. 2) Eat it alongside the vegetables, before the starch. 3) On strength days, don't skip the meal after the workout.
- conflicts/synergies: Pairs with `strength_2x`. Same habit as FitMax `protein_each_meal`; shares the breakfast card with EnergyMax `protein_first_meal`. Protein powders go to Suppmax. Core tier at 65+.
- source: https://pubmed.ncbi.nlm.nih.gov/23867520/

### `sleep_regularity` — Same wake time
- minutes: 0 / 0
- kind: rule
- lever: sleep
- anchor: wake (within 30 min of their usual wake time, weekends included)
- frequency: daily
- tier: core
- avoid if: none
- why: In 60,977 adults wearing trackers, the most regular sleepers had 20–48% lower all-cause mortality than the least regular, and regularity beat sleep duration as a predictor.
- how: 1) Get up within 30 minutes of your usual wake time, even on weekends. 2) Get outside into daylight soon after. 3) Short on sleep? Keep the wake time and take a short early nap instead of sleeping in.
- conflicts/synergies: Same idea as SleepMax `fixed_wake_time`; schedule once. Protected by `caffeine_cutoff` and `alcohol_awareness`. Shift workers keep a consistent core sleep block on work and off days.
- source: https://pubmed.ncbi.nlm.nih.gov/37738616/

### `alcohol_awareness` — Alcohol cap
- minutes: 0 / 0
- kind: rule
- lever: compound
- anchor: after_work (at their usual drinking moment, often weekend evenings)
- frequency: daily
- tier: core
- avoid if: alcohol dependence or heavy daily drinking
- why: Across 107 cohorts (4.8 million people), low drinking didn't go with longer life than never drinking, and even low intake cut overnight HRV recovery.
- how: 1) Decide now: zero tonight, or a hard cap of one drink (zero if pregnant). 2) Start with water or an alcohol-free drink, and alternate. 3) Finish any drink at least 3 hours before sleep.
- conflicts/synergies: Never on a `sauna_session` day. Protects `sleep_regularity` and shows up in `vitals_check` HRV. Same lever as SleepMax `alcohol_buffer`; schedule one. Heavy daily drinkers get a medical-support note instead of a cap (stopping abruptly can be dangerous).
- source: https://pubmed.ncbi.nlm.nih.gov/37000449/

### `know_your_numbers` — Log your biomarkers
- minutes: 5 / 10
- kind: setup
- lever: tracking
- anchor: weekend (once, refreshed after each checkup)
- frequency: once (refresh yearly)
- tier: core
- avoid if: none
- why: Every 10 mmHg drop in systolic blood pressure cuts major heart events by 20% and all-cause death by 13%, and Lp(a), which is mostly genetic, should be measured once in every adult.
- how: 1) Open your latest lab report or patient portal. 2) Enter what's there: blood pressure, LDL-C or ApoB, HbA1c or fasting glucose, Lp(a), plus vitamin D and ferritin if tested. 3) Tick the ones that are missing so you can ask for them at your next checkup.
- conflicts/synergies: Replaces the old checkup reminder. Feeds Suppmax (vitamin D, ferritin) and the EnergyMax fatigue note. These values are consumer health data and never appear in push, SMS or calendar text.
- source: https://pubmed.ncbi.nlm.nih.gov/26724178/

### `vitals_check` — Resting heart rate
- minutes: 1 / 2
- kind: checkin
- lever: tracking
- anchor: wake (before getting out of bed, the same weekday each week)
- frequency: once a week
- tier: medium
- avoid if: none
- why: Across 46 studies (1.2 million people), every 10 beats per minute higher resting heart rate went with 9% higher all-cause mortality, and a rate over 80 with 45% higher.
- how: 1) Before you get up, lie still for 1 minute. 2) Count your pulse for 30 seconds and double it, or read your wearable's 7-day resting heart rate and HRV. 3) Log it; with a home blood-pressure cuff, sit for 5 min and log one reading too.
- conflicts/synergies: Shows progress from `zone2_cardio` and `interval_4x4` as a trend. Drinking nights show up as lower HRV. Resting heart rate 10+ bpm above baseline for a week: suggest rest or an illness check, not more training.
- source: https://pubmed.ncbi.nlm.nih.gov/26598376/

## What the AI needs to know (intake)
1. `age_band` (required) — Step targets (6,000–8,000 at 60+, 8,000–10,000 under 60), balance and protein priority. Skip if the profile already has age.
   Q: "How old are you?" Options: Under 18 | 18–29 | 30–49 | 50–59 | 60 or older
2. `activity_baseline` (required) — Starting doses for cardio and strength, and when intervals unlock.
   Q: "How active are you in a normal week?" Options: Mostly sitting | Some walking | Exercise 1–2× a week | Exercise 3+ times a week
3. `health_flags` (required, multi) — Gates the sauna, intervals and stair bursts, and adds clearance notes (shared across programs).
   Q: "Do any of these apply to you?" Options: None of these | Heart or blood-pressure condition | Pregnant or breastfeeding | Pain or injury | Raynaud's or cold sensitivity | Panic attacks, seizures or fainting | Prefer not to say
4. `heat_access` (required) — Turns the sauna on or off (shared across programs).
   Q: "Which of these can you use most weeks?" Options: A sauna | A bathtub | Both | Neither
5. `drinks_alcohol` (optional) — The framing of the alcohol rule: zero days, a cap, or a medical-support note (shared with SleepMax).
   Q: "Do you usually have alcohol in the evening?" Options: Rarely or never | 1–2 nights a week | 3+ nights a week | Prefer not to say
6. `known_numbers` (optional, multi) — Pre-fills the biomarker setup and turns on HRV in the weekly check.
   Q: "Which of these do you already know from the last year?" Options: Blood pressure | LDL or ApoB | HbA1c or fasting glucose | Lp(a), ever | Resting heart rate or HRV from a wearable | None

## Scheduling rules
- Weekly template: `strength_2x` on non-consecutive days; `zone2_cardio` 3 times a week with the weekend session as a long outdoor walk; `interval_4x4` replaces one zone-2 session only after 4+ weeks of regular cardio and clear health flags; never two hard sessions on consecutive days.
- `stair_snack` up to 3 bouts a day, at least 1 h apart, only with health flags "None of these"; everyone else gets `move_after_sitting`. A bout also counts as EnergyMax `vigorous_burst`.
- `sauna_session` only with a sauna (`heat_access` A sauna or Both): start at 2–3 sessions a week of 10 min, adding about 2 min a week; hidden on days they drink; never combined with cold for anyone with health flags.
- Morning: `sleep_regularity` and `morning_light` share one wake card; `balance_practice` stacks on tooth-brushing; `vitals_check` on the same weekday each week before getting up.
- Meals: `veg_first` at dinner, and at lunch unless EnergyMax `lunch_balance` is on (one combined card); `protein_each_meal` at lunch and dinner; `fiber_swap` at one meal, raised about 5 g a week.
- Alcohol: the rule appears at their usual drinking moment. "3+ nights a week": lead with the HRV framing and zero-days; heavy daily drinking gets a medical-support note, not a cap.
- `know_your_numbers` in week 1 and after each logged checkup; Lp(a) is asked for once in a lifetime.
- Week 1: `zone2_cardio` 2–3 times, `daily_steps`, `sleep_regularity`, `veg_first`, `know_your_numbers`. Week 2: add `strength_2x`, `balance_practice` and `fiber_swap`. Week 3+: `stair_snack` or `move_after_sitting`, `protein_each_meal`, `vitals_check`, then `sauna_session` and `interval_4x4` if eligible.
- Tiers: core first; medium after 2 weeks at 60%+ adherence; hard only with clear health flags.

## Safety and claims
- Observational vs trial evidence: steps, strength, stair bursts, sauna, olive oil, fiber, sleep regularity, resting heart rate, grip and green space are observational, so copy says "linked to" or "people who… had". Only these are trial-backed and may say "lowered… in trials": blood-pressure lowering, the PREDIMED diet, falls prevention, VO2max gains from intervals, and meal order.
- Never "adds X years", "reverses aging", "lowers your biological age", "detox" or "anti-aging". No epigenetic-clock promotion.
- Pre-exercise screening (ACSM): symptoms or known heart, metabolic or kidney disease means medical clearance before moderate or vigorous exercise. Stop rules: chest pain, fainting, palpitations or unusual breathlessness.
- Sauna: never with unstable angina, a recent heart attack or severe aortic stenosis; never with alcohol; skipped in pregnancy.
- Biomarkers: `know_your_numbers` is for logging and comparing with a clinician only. The app never turns values into treatment decisions or medication changes, and values stay out of outbound messages (privacy gate).
- Out of scope, not offered as tasks: time-restricted eating (no better than calorie restriction alone at 12 months, a lean-mass-loss signal), caloric restriction (no human mortality data, lean-mass and bone loss), cold exposure for longevity (no mortality or healthspan trials; acute inflammation rises), NAD+ precursors (raise NAD+ but no outcome data; supplements go to Suppmax), metformin and rapamycin (prescription only; metformin blunted training gains in older adults), vitamin D or omega-3 for longevity (VITAL found no effect on cancer or heart events; Suppmax handles them), and "zone 2 is uniquely optimal" claims (the talk test is enough).

## Sources
- https://pubmed.ncbi.nlm.nih.gov/30646252/
- https://pubmed.ncbi.nlm.nih.gov/35876019/
- https://pubmed.ncbi.nlm.nih.gov/17414804/
- https://pubmed.ncbi.nlm.nih.gov/33028588/
- https://pubmed.ncbi.nlm.nih.gov/35228201/
- https://pubmed.ncbi.nlm.nih.gov/25982160/
- https://pubmed.ncbi.nlm.nih.gov/35247352/
- https://pubmed.ncbi.nlm.nih.gov/36482104/
- https://pubmed.ncbi.nlm.nih.gov/35147898/
- https://pubmed.ncbi.nlm.nih.gov/25705824/
- https://pubmed.ncbi.nlm.nih.gov/11165553/
- https://pubmed.ncbi.nlm.nih.gov/23411620/
- https://pubmed.ncbi.nlm.nih.gov/26106234/
- https://pubmed.ncbi.nlm.nih.gov/35027106/
- https://pubmed.ncbi.nlm.nih.gov/29897866/
- https://pubmed.ncbi.nlm.nih.gov/30638909/
- https://pubmed.ncbi.nlm.nih.gov/23867520/
- https://pubmed.ncbi.nlm.nih.gov/37738616/
- https://pubmed.ncbi.nlm.nih.gov/39405349/
- https://pubmed.ncbi.nlm.nih.gov/37000449/
- https://pubmed.ncbi.nlm.nih.gov/29549064/
- https://pubmed.ncbi.nlm.nih.gov/26724178/
- https://pubmed.ncbi.nlm.nih.gov/36036785/
- https://pubmed.ncbi.nlm.nih.gov/26598376/
- https://pubmed.ncbi.nlm.nih.gov/35728834/
- https://pubmed.ncbi.nlm.nih.gov/30703272/
- https://pubmed.ncbi.nlm.nih.gov/29982151/
- https://pubmed.ncbi.nlm.nih.gov/26473759/
- https://pubmed.ncbi.nlm.nih.gov/39879231/
- https://pubmed.ncbi.nlm.nih.gov/35443107/
- https://pubmed.ncbi.nlm.nih.gov/32986097/
- https://pubmed.ncbi.nlm.nih.gov/31303390/
- https://pubmed.ncbi.nlm.nih.gov/29599478/
- https://pubmed.ncbi.nlm.nih.gov/30548390/
- https://pubmed.ncbi.nlm.nih.gov/30415629/
- https://pubmed.ncbi.nlm.nih.gov/30415637/

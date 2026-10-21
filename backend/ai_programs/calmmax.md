# CalmMax

## What it is
CalmMax works the body's stress machinery directly. Stress is a physical state: the sympathetic nervous system speeds the heart and breathing, the HPA axis releases cortisol, and the vagus nerve is the brake that slows everything back down. CalmMax pulls physical levers on those systems: exhale-weighted and slow breathing (about 6 breaths a minute) that works the baroreflex and the vagal brake, cold on the face for the dive reflex, a heat dose followed by a cool-down, aerobic training and slow yoga that lower resting heart rate and stress reactivity, daylight and green space by day with dim light at night to keep the cortisol and melatonin rhythm on time, a caffeine ceiling for people whose adrenaline response runs hot, and still rest with muscle release. Progress shows up as slower resting breathing, a lower resting heart rate, higher HRV and a lower 1-to-5 body-stress rating. It is a wellness program, not a treatment for anxiety, depression or any other condition.

## Who it fits / who should check with a professional first
Fits: adults whose stress shows up in the body (fast shallow breathing, tight jaw and shoulders, racing heart, wired-but-tired evenings, low or falling HRV on a wearable) and who want measurable, body-first tools, including people who already use cold, heat or training and want them dosed sensibly.

Check with a professional first:
- Heart disease, heart-rhythm problems, a pacemaker, unstable angina, a recent heart attack or severe aortic stenosis: no cold or heat habits until a cardiologist clears you. Cold shock and the dive reflex pull the heart in opposite directions, and heat drops blood pressure.
- Pregnancy: no sauna, hot tub, hot baths or cold-shower training. Breathing, walking, gentle yoga and NSDR lying on the left side are fine.
- Low blood pressure, fainting, or blood-pressure medicine: heat and cold can drop pressure or slow the heart. No face dips; stand up slowly after heat.
- Raynaud's or hives from cold: no cold habits.
- Panic attacks: no breath holds, go slowly with cold, and keep caffeine low (about half of people with panic disorder had a panic attack after a high caffeine dose in lab studies).
- Asthma or COPD: no breath holds; cold air and water can tighten the airways.
- Epilepsy: never hyperventilation-style breathwork (it can trigger seizures). CalmMax never schedules it.
- Multiple sclerosis or heat intolerance: skip heat.
- Bipolar disorder: no light boxes and no big sleep shifts; ordinary daylight walks are fine.
- Beta-blockers and some other medicines flatten heart rate and HRV, so tracker numbers won't reflect calm. Never change a medicine for this program.
- Anxiety, low mood or poor sleep on most days for 2+ weeks, panic attacks, or stress that stops you working or sleeping: see a GP or mental health professional. CalmMax can run alongside care.
- Any thoughts of self-harm or suicide: stop and contact crisis support now (US: call or text 988; UK: Samaritans 116 123; elsewhere: your local emergency number).

## Habit library

### `physiological_sigh` — Cyclic sighing
- minutes: 1 / 5
- kind: action
- lever: breathing
- anchor: any (at their stress peak; default work_break)
- frequency: daily
- tier: core
- avoid if: none
- why: In a 1-month trial of 108 adults, 5 minutes a day of cyclic sighing gave the biggest daily rise in positive mood and drop in resting breathing rate, beating mindfulness.
- how: 1) Breathe in through the nose, then take a second short sip of air on top to fill the lungs. 2) Breathe out slowly through the mouth until empty, the exhale about twice as long as the inhales. 3) Repeat at an easy pace for 1–5 min; if you feel lightheaded, go back to normal breathing.
- conflicts/synergies: Same slot as `box_breathing`; schedule one, never both. Opener for the first minute of SleepMax `wind_down` and a good reset before FocusMax work. After `cold_face_reset` in a spike (cold first, then sighs).
- source: https://doi.org/10.1016/j.xcrm.2022.100895

### `box_breathing` — Box breathing
- minutes: 2 / 4
- kind: action
- lever: breathing
- anchor: any (just before a known stressor: a hard meeting, a drive, a presentation)
- frequency: 3 times a week
- tier: medium
- avoid if: panic attacks, asthma, copd
- why: In a lab stress test with 30 adults, box-style breathing (equal inhale, hold, exhale, hold) produced lower physiological arousal than long-exhale breathing.
- how: 1) Breathe in through the nose for a count of 4. 2) Hold gently for 4, breathe out for 4, hold for 4. 3) Repeat for 2–4 min; drop to counts of 3, or leave out the holds, if your chest feels tight.
- conflicts/synergies: Alternative to `physiological_sigh` in the same slot. Holds stay at 4 counts and are never extended. Never paired with the dip version of `cold_face_reset`.
- source: https://doi.org/10.1007/s10484-020-09485-w

### `slow_belly_breathing` — Resonance breathing (6 a minute)
- minutes: 5 / 10
- kind: action
- lever: breathing
- anchor: wind_down (or after_work)
- frequency: daily
- tier: core
- avoid if: none
- why: Across 223 studies, breathing near 6 breaths a minute raised vagal HRV during and after practice, and HRV-biofeedback training at this pace cut stress with a large effect (g = 0.83).
- how: 1) Sit or lie down with one hand on your belly and breathe through your nose so the belly, not the chest, rises. 2) Breathe in for about 4 seconds and out for about 6, with no holds. 3) Keep going for 5–10 min; hum softly on the out-breath if you like, and stop if dizzy.
- conflicts/synergies: Sits inside SleepMax `wind_down` (count once). If their watch or ring has a breathing pacer, follow it at the same pace. The default for anyone whose health answer rules out `box_breathing`.
- source: https://doi.org/10.1016/j.neubiorev.2022.104711

### `cold_face_reset` — Cold-water face reset
- minutes: 1 / 2
- kind: action
- lever: temperature
- anchor: work_break (during a stress spike; scheduled on peak days)
- frequency: 3 times a week (plus on demand, max 2 a day)
- tier: medium
- avoid if: heart rhythm condition, heart condition, fainting, low blood pressure, raynaud's, hives from cold
- why: Cold water on the face triggers the dive reflex: cold face immersion raised vagal HRV in adults even while they kept breathing, and cold on the side of the neck lowered heart rate.
- how: 1) Run the tap as cold as it goes and soak a cloth, or fill the sink. 2) Hold the cold cloth over your forehead, eyes and cheeks, then on the sides of your neck, for 30–60 s while breathing out slowly; if short breath holds feel fine, dip your face for 10–15 s instead. 3) Repeat 2–3 times, dry off, and finish with three slow sighs.
- conflicts/synergies: The spike tool next to `physiological_sigh`. Cloth only (no dip) for people with panic attacks or asthma. Never in the same slot as `cold_shower_finish`. Fine after FitMax sessions.
- source: https://doi.org/10.2196/10257

### `cold_shower_finish` — Cold shower finish
- minutes: 1 / 2
- kind: action
- lever: temperature
- anchor: get_ready (end of the morning shower)
- frequency: 3 times a week
- tier: hard
- avoid if: heart condition, heart rhythm condition, pregnancy, low blood pressure, fainting, raynaud's, hives from cold, uncontrolled high blood pressure
- why: In a trial of 3,018 adults, ending showers with 30–90 s of cold for 30 days cut sick-leave days by 29%, and a 2025 meta-analysis found lower stress 12 hours after cold immersion.
- how: 1) Finish your normal warm shower, then turn it to cool for 15–30 s; over 2–3 weeks work up to properly cold for 30–90 s. 2) Breathe out long and slow through the first gasp (the cold-shock reflex fades within about a minute) and keep your face out of the stream at first. 3) Step out, dry off and move around to rewarm; stop if you feel chest pain, a pounding or irregular heartbeat, or dizziness.
- conflicts/synergies: Mornings only, never in the last 2 hours before bed. Same habit as FocusMax and EnergyMax `cold_shower_finish`; schedule once. Pairs with `morning_light` (cold, then outside). Keep cold in the morning on `heat_session` days. Skip on a day they feel ill.
- source: https://doi.org/10.1371/journal.pone.0161749

### `heat_session` — Sauna or hot bath
- minutes: 15 / 20
- kind: action
- lever: temperature
- anchor: after_work (finish at least 1 hour before bed)
- frequency: 2 times a week
- tier: hard
- avoid if: pregnancy, heart condition, recent heart attack, low blood pressure, fainting, multiple sclerosis, fever
- why: In a small sham-controlled trial, one whole-body heating session improved mood scores for 6 weeks, and twice-weekly 40°C baths improved them in a second trial.
- how: 1) Sauna: 10–15 min at a heat you can breathe comfortably in. Bath: water about 40°C (hot but not stinging), 15–20 min, shoulders under. 2) Drink a glass of water before and after; no alcohol before or during. 3) Get up slowly (blood pressure dips after heat), sit a few minutes to cool down, and get out at once if you feel dizzy, sick or your heart races.
- conflicts/synergies: A 40–42.5°C bath 1–2 hours before bed also shortens time to fall asleep, so it serves SleepMax too; it ends before SleepMax `wind_down`. Never on an evening they drink (SleepMax `alcohol_buffer`). Same lever as LongevityMax `sauna_session`; schedule one. After `move_it_out` on the same day, not before.
- source: https://doi.org/10.1001/jamapsychiatry.2016.1031

### `body_scan` — NSDR / yoga nidra
- minutes: 10 / 15
- kind: action
- lever: rest
- anchor: afternoon (or pre_bed)
- frequency: 3 times a week
- tier: medium
- avoid if: none
- why: In a trial of 362 adults, 11 minutes of daily yoga nidra for 2 months lowered stress and total cortisol with a healthier daily cortisol slope.
- how: 1) Lie on your back (on your left side if pregnant) with headphones in and eyes closed. 2) Play a 10–20 min yoga nidra or NSDR audio, letting each body part go heavy as it is named and breathing slowly through your nose. 3) Stay still for a minute after it ends, then sit up slowly.
- conflicts/synergies: Same as FocusMax `nsdr_break` (schedule once). Can replace a nap under SleepMax `nap_rule`. Before bed it sits inside SleepMax `wind_down` as audio only, screen face-down. One rest habit a day: not on the same day as `pmr_release`. Never while driving.
- source: https://doi.org/10.1002/smi.70049

### `pmr_release` — Muscle release
- minutes: 5 / 10
- kind: action
- lever: rest
- anchor: wind_down (or after_work)
- frequency: 3 times a week
- tier: medium
- avoid if: recent muscle or joint injury
- why: In a trial of 60 adults, progressive muscle relaxation gave a steady fall in skin-conductance and heart-rate arousal, and across 27 studies relaxation training cut anxiety (d = 0.51).
- how: 1) Sit or lie down and, starting with your feet, tense one muscle group at about half effort for 5 s while breathing in. 2) Let it go all at once as you breathe out, and feel it soften for 10–15 s. 3) Work up through calves, thighs, glutes, hands, arms, shoulders, jaw and face, skipping anything that hurts.
- conflicts/synergies: Alternative to `body_scan` (one rest habit a day). Fits inside SleepMax `wind_down`. Good on FitMax strength days and after `move_it_out`.
- source: https://doi.org/10.1155/2021/5924040

### `slow_yoga` — Slow yoga flow
- minutes: 10 / 20
- kind: action
- lever: movement
- anchor: after_work (or wake)
- frequency: 2 times a week
- tier: medium
- avoid if: recent back or joint injury
- why: Across 42 studies, yoga postures lowered evening and waking cortisol, resting heart rate and blood pressure and raised HRV compared with active controls.
- how: 1) On a mat or carpet, move slowly through 6–8 gentle poses (cat-cow, child's pose, low lunge, standing forward fold, seated twist, lying knee hug), holding each for 5 slow breaths. 2) Breathe through your nose with the exhale a little longer than the inhale. 3) Finish lying still for 2 min; skip any pose that pinches, and keep your head above your heart if you have glaucoma or high blood pressure.
- conflicts/synergies: Counts as FitMax `mobility_flow` that day. Indoor swap for `outdoor_walk` on extreme-heat or poor-air days. In pregnancy, a prenatal sequence (no deep twists, no lying flat after mid-pregnancy).
- source: https://doi.org/10.1016/j.psyneuen.2017.08.008

### `move_it_out` — Aerobic stress burn
- minutes: 20 / 30
- kind: action
- lever: movement
- anchor: after_work (hard sessions finish 2+ hours before bed)
- frequency: 3 times a week
- tier: core
- avoid if: dizziness or breathlessness on mild effort
- why: An overview of 97 reviews (128,119 people) found physical activity reduced anxiety and distress, more at higher intensity; even one session lowers in-the-moment anxiety a little.
- how: 1) Pick brisk walking, cycling, running, rowing or swimming. 2) Warm up for 5 min, then go 15–25 min at a pace where you can only talk in short sentences, adding a few harder minutes if you feel good. 3) Cool down for 3–5 min with easy movement and a few long exhales.
- conflicts/synergies: FitMax or LongevityMax `zone2_cardio` that day counts (schedule once). Bound by SleepMax `exercise_timing`. Outdoors in daylight it also counts toward `outdoor_walk`. On a 4–5 stress check-in, keep it easy. With a heart or blood-pressure flag, moderate effort only and a check-with-your-clinician note.
- source: https://doi.org/10.1136/bjsports-2022-106195

### `outdoor_walk` — Daylight nature walk
- minutes: 10 / 20
- kind: action
- lever: light
- anchor: lunch, after_work or weekend (in daylight)
- frequency: 4 times a week (about 120 min a week outdoors in total)
- tier: core
- avoid if: none
- why: Time in a nature spot lowered salivary cortisol by 21% per hour beyond its normal daily fall, with the best return per minute at 20–30 minutes.
- how: 1) Head for the greenest place within reach: a park, a tree-lined street or water. 2) Walk or sit for 10–30 min with your phone in your pocket, sunglasses off if comfortable and safe, never looking at the sun. 3) Look around at trees, sky and water and breathe through your nose.
- conflicts/synergies: Same as LongevityMax `nature_time`, FocusMax `walk_to_think` and EnergyMax `outdoor_lunch` (schedule once). Within 60 min of waking it also counts as `morning_light`. An outdoor `move_it_out` counts. On extreme-heat or poor-air days, swap for `slow_yoga` indoors.
- source: https://doi.org/10.3389/fpsyg.2019.00722

### `screen_free_evening` — Screen-free evening
- minutes: 1 / 2
- kind: action
- lever: light
- anchor: pre_bed (the last 60 min before bed)
- frequency: daily
- tier: core
- avoid if: none
- why: Ordinary evening room light (about 25 lux) was enough for half the maximum melatonin suppression, and more night-time light went with higher rates of anxiety and depression.
- how: 1) Switch off the overhead lights and use one or two low lamps (warm bulbs if you have them). 2) Put the phone on its charger across the room or outside the bedroom, with screens off. 3) Swap in a paper book, a stretch, or slow music or audio at low volume.
- conflicts/synergies: Same as SleepMax `screens_off` (schedule once), at or before the start of SleepMax `wind_down`, never after it. Slow music here is the CalmMax music lever (slow tempo and pauses lower heart rate, blood pressure and breathing).
- source: https://doi.org/10.1073/pnas.1901824116

### `caffeine_ceiling` — Caffeine ceiling
- minutes: 0 / 0
- kind: rule
- lever: caffeine
- anchor: breakfast (with the first coffee or tea)
- frequency: daily
- tier: core
- avoid if: none
- why: In a double-blind study of 102 adults, 50 mg of caffeine didn't raise anxiety, 150 mg did in sensitive people and 450 mg in most; a 2024 meta-analysis found the sharpest rise above 400 mg.
- how: 1) Keep each serving to about one regular cup of coffee (80–100 mg), or have tea or half-caf instead. 2) Cap the day at about 2 cups if 2+ cups make you jittery, or at 1 cup if even one does; skip energy drinks, pre-workout and caffeine pills. 3) If you're above your cap now, cut by about half a cup every 3–4 days to avoid withdrawal headaches.
- conflicts/synergies: Works with `caffeine_cutoff` from SleepMax or EnergyMax (that one sets the time, this one the amount; both apply). FocusMax `caffeine_for_focus` fits inside the cap. FitMax pre-workout drinks count toward it.
- source: https://doi.org/10.1038/npp.2008.17

### `stress_checkin` — Stress check-in
- minutes: 1 / 1
- kind: checkin
- lever: tracking
- anchor: wake (before coffee)
- frequency: daily for the first 2 weeks, then 3 times a week
- tier: medium
- avoid if: none
- why: Wearable HRV shows stress physiology people miss: in 4,098 adults even low alcohol intake cut overnight HRV recovery, and a 1-to-5 stress rating tracks longer validated scales.
- how: 1) Rate how wound-up your body feels right now, from 1 (calm) to 5 (wired). 2) If you wear a tracker, note last night's HRV and resting heart rate against your own 7-day average. 3) Tick one likely driver: short sleep, late caffeine, alcohol, hard training, illness or late screens.
- conflicts/synergies: Merge with SleepMax `sleep_log` and EnergyMax `energy_check_in` into one morning card. A 4–5 rating, or HRV clearly below the 7-day average, swaps that day's hard habits (`cold_shower_finish`, `heat_session`, a hard `move_it_out`) for `slow_belly_breathing` or `body_scan`. Never a diagnosis; beta-blockers flatten the numbers.
- source: https://doi.org/10.2196/mental.9519

## What the AI needs to know (intake)
1. `stress_peak_time` (required) — Places the main breathing reset and decides whether the cold face reset is offered as a spike tool.
   Q: "When does stress hit you hardest?" Options: Mornings | During the workday | Late afternoon or after work | Evenings and night | Sudden spikes any time
2. `health_flags` (required, multi) — Gates every cold, heat and breath-hold habit (shared across programs).
   Q: "Do any of these apply to you?" Options: None of these | Heart or blood-pressure condition | Pregnant or breastfeeding | Pain or injury | Raynaud's or cold sensitivity | Panic attacks, seizures or fainting | Prefer not to say
3. `cold_tolerance` (required) — Picks the cold lever: shower finish plus face reset, face reset only, or no cold (shared across programs).
   Q: "How do you feel about cold water?" Options: Up for a cold finish to my shower | Willing to try 30 seconds | Cold on my face is my limit | Not for me | I already do cold showers or plunges
4. `heat_access` (required) — Whether a heat session is scheduled, and sauna or bath (shared across programs).
   Q: "Which of these can you use most weeks?" Options: A sauna | A bathtub | Both | Neither
5. `caffeine_jitters` (required) — Turns on the caffeine ceiling and sets it at 2 cups or 1.
   Q: "How does caffeine affect you?" Options: I don't have caffeine | No noticeable effect | Jittery or on edge after 2+ cups | Jittery even after 1 cup

## Scheduling rules
- Safety first (from `health_flags`; every matching gate applies):
  - Heart or blood-pressure condition: no `cold_face_reset`, `cold_shower_finish` or `heat_session`; `move_it_out` at moderate effort with a check-with-your-clinician note.
  - Pregnant or breastfeeding: no `heat_session` or `cold_shower_finish`; `body_scan` on the left side; `slow_yoga` in its prenatal version.
  - Raynaud's or cold sensitivity: no cold habits.
  - Panic attacks, seizures or fainting: no `box_breathing`; `cold_face_reset` as a cloth only; no cold shower.
  - Prefer not to say: treat as cautious (no cold, heat or breath holds).
- Cold, from `cold_tolerance`: up for it or willing to try → `cold_face_reset` plus `cold_shower_finish` (from week 4, starting at 15–30 s); face is my limit → `cold_face_reset` only; not for me → no cold; already do cold showers or plunges → don't add one, show the cold safety notes once (never alone in open water, no breath holds in water, out within a few minutes, rewarm by moving).
- Heat, from `heat_access`: sauna or both → the sauna version; bathtub → the bath version (about 40°C); neither → no `heat_session`. Heat ends at least 1 hour before bed and never on a day they drink alcohol.
- Placement by `stress_peak_time`: mornings → `physiological_sigh` at breakfast; during the workday → the sigh at a work break with `cold_face_reset` as the spike tool; late afternoon or after work → the sigh or `slow_belly_breathing` after work, with `move_it_out` in the same slot on its days; evenings and night → `slow_belly_breathing` and `pmr_release` or `body_scan` at the wind-down, plus `screen_free_evening`; sudden spikes → the sigh and `cold_face_reset` on demand, plus one scheduled sigh a day.
- Caffeine: `caffeine_ceiling` only when `caffeine_jitters` says jittery (2-cup or 1-cup cap), or the shared `caffeine_pattern` is "4+ or energy drinks" (2-cup cap, cut down gradually).
- Per day: at most 2 scheduled breathing tasks (`physiological_sigh` and `box_breathing` never share a slot), one rest habit (`body_scan` or `pmr_release`), one temperature habit per slot (cold in the morning, heat in the evening), `cold_shower_finish` never within 2 hours of bed.
- `move_it_out` 3 times a week; vigorous sessions end 2+ hours before bed (SleepMax `exercise_timing`). FitMax or LongevityMax cardio that day counts.
- `outdoor_walk` in daylight only; about 120 min a week of outdoor time across all programs.
- `screen_free_evening` is the same rule as SleepMax `screens_off`: schedule once, at or before the start of the wind-down.
- `stress_checkin` joins the merged morning card. Three days in a row of 4–5, or HRV clearly below the 7-day average: swap hard habits for gentle ones. Two weeks of mostly 4–5: suggest talking to a GP.
- Alcohol: CalmMax never schedules, suggests or frames alcohol as a way to unwind. If the shared `drinks_alcohol` is "3+ nights a week", SleepMax `alcohol_buffer` carries it (HRV-recovery framing); no CalmMax copy.
- Week ramp (next step only at 70%+ adherence): week 1 → `physiological_sigh` daily, `outdoor_walk` 2–3 times, `screen_free_evening`, `caffeine_ceiling` if on, `stress_checkin`; week 2 → add `slow_belly_breathing` and `move_it_out`; week 3 → add one of `body_scan`, `pmr_release` or `slow_yoga`, plus `cold_face_reset` if eligible; week 4+ → add `cold_shower_finish` and `heat_session` if eligible.
- Time budget: about 5 min → the sigh, rules and the check-in; 10–20 min → add resonance breathing or a walk; 20–40 min → add `move_it_out`, `slow_yoga` or NSDR. At most 4 visible CalmMax tasks a day; rules don't count.
- Saturdays and Sundays: stretch `outdoor_walk` into a 30–60 min nature block, and put `heat_session` there if they have access.

## Safety and claims
- CalmMax is not therapy and not a treatment. Never diagnose anxiety, panic disorder, depression, PTSD, burnout or any heart condition. Never promise outcomes like "lowers cortisol 21%" or "fixes your HRV"; say "studies found" and "many people find".
- Crisis: if they mention self-harm, suicide, abuse or feeling unsafe, stop the plan and give crisis resources (US 988 call or text; UK Samaritans 116 123; local emergency number).
- Breathing: no hyperventilation or Wim Hof-style breathing, no "tummo", no breath holds longer than about 5 seconds, never breath holds in or near water, and no NSDR or eyes-closed practice while driving.
- Cold: only `cold_shower_finish` and `cold_face_reset` are ever scheduled. No ice baths, plunges or open-water swims. Cold shock (gasping, a heart-rate and blood-pressure spike) plus the dive reflex can cause arrhythmias in vulnerable people.
- Heat: 10–15 min sauna or 15–20 min bath, with water and no alcohol. Never with unstable angina, a recent heart attack or severe aortic stenosis. Skipped in pregnancy (early-pregnancy hot-tub use carried 2.8 times the neural-tube-defect risk in a US study).
- Caffeine: never add caffeine or suggest stimulants; never advise stopping prescribed stimulants; always cut down gradually.
- Compounds: L-theanine, magnesium, ashwagandha and oral lavender oil live only in Suppmax. Never suggest CBD, kava, alcohol, sleeping pills or anxiety medicines, and never suggest changing psychiatric or blood-pressure medication.
- Claims not to make: "cold plunges boost dopamine 250%" (that was a full hour at 14°C), "NSDR raises dopamine 65%" (one tiny PET study), "humming calms you via nitric oxide" (untested), "massage lowers cortisol" (it doesn't, measurably), "reset your vagus nerve", "adrenal fatigue".
- Not offered: grounding (small, unblinded, industry-linked studies), crystals (no mechanism, no trials), binaural beats (brain-wave effects inconsistent), "60 bpm magic music" (only slower tempo is established), chewing gum (mixed replication), lavender inhalation (low quality, needs buying), weighted blankets (thin evidence, needs buying, unsafe for children).
- No guilt or shame framing; every habit can be skipped.

## Sources
- https://doi.org/10.1016/j.xcrm.2022.100895
- https://doi.org/10.1038/s41598-022-27247-y
- https://doi.org/10.1016/j.neubiorev.2022.104711
- https://doi.org/10.3389/fpsyg.2014.00756
- https://doi.org/10.1007/s10484-014-9253-x
- https://doi.org/10.1007/s10484-020-09485-w
- https://doi.org/10.1016/j.jtcme.2017.02.003
- https://doi.org/10.2196/10257
- https://doi.org/10.1113/jphysiol.2012.229864
- https://doi.org/10.1371/journal.pone.0161749
- https://doi.org/10.1371/journal.pone.0317615
- https://doi.org/10.1001/jamapsychiatry.2016.1031
- https://doi.org/10.1186/s12906-017-1676-5
- https://doi.org/10.1016/j.smrv.2019.04.008
- https://doi.org/10.1016/s0002-9343(00)00671-9
- https://doi.org/10.1002/smi.70049
- https://doi.org/10.1111/aphw.12366
- https://doi.org/10.1155/2021/5924040
- https://doi.org/10.1016/j.psyneuen.2017.08.008
- https://doi.org/10.1136/bjsports-2022-106195
- https://doi.org/10.3389/fpsyg.2019.00722
- https://doi.org/10.1016/j.jad.2021.08.056
- https://doi.org/10.1073/pnas.1901824116
- https://doi.org/10.1038/npp.2008.17
- https://doi.org/10.3389/fpsyg.2024.1270246
- https://doi.org/10.1016/j.genhosppsych.2021.11.005
- https://doi.org/10.2196/mental.9519
- https://doi.org/10.1080/17437199.2019.1627897
- https://doi.org/10.1037/0033-2909.130.1.3
- https://doi.org/10.1176/ajp.151.2.264
- https://doi.org/10.1016/j.brainres.2017.12.037
- https://doi.org/10.1155/2012/291541
- https://doi.org/10.1371/journal.pone.0286023

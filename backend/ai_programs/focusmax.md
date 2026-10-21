# FocusMax

## What it is
FocusMax works on the body that does the thinking. Attention rides on arousal chemistry (adenosine building through the day, noradrenaline and dopamine), the body clock, blood flow to the brain, blood sugar after meals, hydration, and the light, air, temperature and sound around you. FocusMax times caffeine against adenosine and sleep, uses daylight to set the clock and lift alertness, uses short bouts of movement to raise brain blood flow before hard thinking, breaks up long sitting, keeps water up and lunch from deepening the afternoon dip, and adds rest (NSDR or a short nap), a cold finish to the shower and fresh air as optional levers. Every habit is a physical input with study evidence behind it. The effects are real but modest, none of them replaces enough sleep, and FocusMax is not a treatment for ADHD or any medical cause of poor concentration.

## Who it fits / who should check with a professional first
Fits: healthy adults and students who want sharper, steadier attention in the hours they need it; people who lean on caffeine or crash in the afternoon; anyone who sits most of the day.

Check with a professional first:
- Heart or blood-pressure condition, heart rhythm problems, pregnancy or breastfeeding, Raynaud's, seizures or fainting: the shared health question removes cold water, hard bursts and caffeine habits as needed. Ask a clinician before adding them back.
- Panic attacks or an anxiety disorder: high caffeine doses (400–750 mg) triggered a panic attack in about half of people with panic disorder in lab studies. Caffeine habits stay off; use light, movement and CalmMax breathing instead.
- Attention problems since childhood that affect work, school or relationships (possible ADHD): suggest an assessment if the user asks. Never comment on, start, stop or change stimulant or other medication.
- Heavy daytime sleepiness despite enough time in bed, loud snoring or gasping, or nodding off while driving: possible sleep apnea or another sleep disorder; see a clinician before relying on naps or caffeine.
- New or worsening brain fog, memory problems or trouble concentrating, especially after an illness or a medication change: see a GP (thyroid, anemia, depression, post-viral illness and medication side effects are common causes).
- Stimulant medication, fluvoxamine or other drugs that interact with caffeine or green tea: check with a pharmacist.
- Under 18: no caffeine or green tea habits.
- History of an eating disorder: skip the lunch habit and any meal rules.

## Habit library

### `morning_light` — Morning outdoor light
- minutes: 5 / 10
- kind: action
- lever: light
- anchor: wake (within 60 min of waking; an outdoor commute or walk counts)
- frequency: daily
- tier: core
- avoid if: none
- why: Brighter white light raised self-rated alertness in most of 68 studies, and outdoor daylight beats indoor light many times over, even on cloudy days.
- how: 1) Step outside within an hour of waking and stay 5–10 min, longer when it's overcast. 2) Face the open sky with your eyes open (sunglasses off if it's comfortable and safe), and never look straight at the sun. 3) Walk, drink your water or coffee, or take the outdoor part of your commute while you're out there.
- conflicts/synergies: Same habit as SleepMax and EnergyMax `morning_light`; schedule once. Pairs with `caffeine_for_focus` (coffee outside) and `cold_shower_finish` (light straight after the shower). On days they can't get out, `focus_space_setup` (a window seat) is the fallback.
- source: https://doi.org/10.1371/journal.pbio.3001571

### `caffeine_for_focus` — Focus caffeine
- minutes: 1 / 2
- kind: action
- lever: caffeine
- anchor: before_work (about 30 min before their focus window; with or after breakfast)
- frequency: weekdays (only for people who have caffeine)
- tier: core
- avoid if: pregnancy or breastfeeding, panic attacks, heart rhythm problems, under 18, stimulant medication or fluvoxamine
- why: About 40–300 mg of caffeine reliably improves alertness, vigilance and reaction time; in daily users a steady usual dose works better than adding more.
- how: 1) Have your usual coffee or tea about 30 min before the work you most need to be sharp for, with food and a glass of water. 2) Keep it to one serving: a mug of brewed coffee is roughly 80–100 mg, and cans, pods and pre-workouts list it on the label. 3) Stay under 200 mg at one time and 400 mg across the whole day.
- conflicts/synergies: Bound by `caffeine_cutoff`; the strictest cutoff across programs wins. Same cup as EnergyMax `delay_first_coffee`. Suppmax `caffeine_theanine` attaches to this cup. `green_tea_afternoon` and a caffeine nap count toward the same daily total.
- source: https://doi.org/10.1016/j.neubiorev.2016.09.001

### `caffeine_cutoff` — Caffeine cutoff
- minutes: 0 / 0
- kind: rule
- lever: caffeine
- anchor: afternoon (about 9 h before usual bedtime, 13 h for energy drinks and pre-workouts)
- frequency: daily
- tier: core
- avoid if: none
- why: Caffeine cut total sleep by 45 min across trials; a coffee needs about 9 h before bed and a pre-workout about 13 h, and lost sleep is the biggest drag on next-day attention.
- how: 1) Have your last caffeine about 9 hours before your usual bedtime (13 for an energy drink or pre-workout). 2) After that, switch to decaf, herbal tea or water. 3) Count the hidden caffeine too: cola, matcha, dark chocolate, some pain relievers.
- conflicts/synergies: Same rule as SleepMax and EnergyMax `caffeine_cutoff`; schedule once and the strictest wins. Limits `caffeine_for_focus`, `green_tea_afternoon` and a caffeine nap.
- source: https://doi.org/10.1016/j.smrv.2023.101764

### `green_tea_afternoon` — Afternoon green tea
- minutes: 2 / 5
- kind: action
- lever: caffeine
- anchor: afternoon (early afternoon or with lunch, always before the caffeine cutoff)
- frequency: 3–5 times a week
- tier: medium
- avoid if: pregnancy or breastfeeding, panic attacks, iron-deficiency anemia, nadolol, under 18
- why: Tea pairs a smaller caffeine dose with natural L-theanine; across 11 trials the pair moderately improved alertness and attention-switching for about 2 hours.
- how: 1) Brew a cup of green tea for 2–3 min in water just off the boil, or whisk one serving of matcha as the tin directs. 2) Drink it as your afternoon caffeine instead of more coffee, away from an iron-rich meal. 3) Finish it before your caffeine cutoff.
- conflicts/synergies: Counts toward the daily caffeine total with `caffeine_for_focus` and is bound by `caffeine_cutoff`. Use it in place of Suppmax `caffeine_theanine` in the afternoon, since tea already brings theanine. Tea as a drink only: green-tea extract pills are not part of this habit.
- source: https://doi.org/10.1111/nure.12120

### `move_before_focus` — Move before focus
- minutes: 5 / 10
- kind: action
- lever: movement
- anchor: before_work (in the 30 min before their focus window; also works after lunch)
- frequency: weekdays
- tier: core
- avoid if: dizziness or breathlessness on mild effort
- why: Across 40 studies one bout of moderate aerobic exercise sped up executive-function tasks afterwards (g = 0.35), with the biggest effect within about 30 minutes.
- how: 1) Walk briskly, climb stairs or cycle for 5–10 min at a pace where you can talk but not sing. 2) If you're fit and flagged no health conditions, add 3–5 faster bursts of 20–30 s with easy recovery between. 3) Let your breathing settle for a minute or two, then start the hard task within about half an hour.
- conflicts/synergies: Same lever as EnergyMax `vigorous_burst` and FitMax `stair_or_burst`; keep one when both land near the start of work. Counts toward `daily_steps`. Done outdoors, it doubles as `morning_light`. Skip it when a FitMax or LongevityMax workout already falls in the 2 hours before.
- source: https://doi.org/10.1111/psyp.12736

### `micro_break` — Micro-break
- minutes: 2 / 5
- kind: action
- lever: movement
- anchor: work_break (every 30–60 min of sitting, at least every 90 min)
- frequency: weekdays (2–6 per workday)
- tier: core
- avoid if: none
- why: In desk workers sitting for 4 hours, 2-min light walks every 30 min prevented the fall in brain blood flow seen with unbroken sitting.
- how: 1) Stand up and walk for 2–5 min: stairs, a lap of the floor, a water refill. 2) Look at something at least 6 m away for 20 s and blink fully a few times. 3) Leave the phone in your pocket so your eyes rest too, not just your legs.
- conflicts/synergies: Same concept group as EnergyMax `movement_snack`, FitMax `posture_break` and LongevityMax `move_after_sitting`: one task. The natural slot for `hydrate_to_focus` refills and `fresh_air_flush`.
- source: https://doi.org/10.1152/japplphysiol.00310.2018

### `hydrate_to_focus` — Water to focus
- minutes: 1 / 1
- kind: action
- lever: hydration
- anchor: before_work (as work starts; refills ride on `micro_break`)
- frequency: weekdays
- tier: core
- avoid if: a doctor-set fluid limit, low blood sodium
- why: Losing more than 2% of body weight in fluid impaired attention and coordination across 33 studies, and 500 ml of water sped reaction times in thirsty adults.
- how: 1) Drink a large glass of water (about 300–500 ml) as you start work. 2) Keep a full glass or bottle within reach and sip whenever you notice thirst. 3) Refill at each break; pale-straw urine means you're on track.
- conflicts/synergies: Same lever as EnergyMax `water_on_waking` and `water_bottle_refill`; count it once and never stack fluid targets. Electrolytes on sweaty days live in Suppmax. Keep big drinks out of the last hour before bed (SleepMax).
- source: https://doi.org/10.1249/MSS.0000000000001682

### `protein_first_lunch` — Protein-first lunch
- minutes: 0 / 2
- kind: action
- lever: nutrition
- anchor: lunch
- frequency: weekdays
- tier: medium
- avoid if: eating disorder history, diabetes treated with insulin or sulfonylureas
- why: After a short night, a heavy 922 kcal lunch caused more afternoon lapses than a 305 kcal one, and big carbohydrate loads raised fatigue within the hour across 31 studies.
- how: 1) Build the plate around a palm or two of protein and plenty of vegetables, with a modest portion of starch. 2) Eat the protein and vegetables first and the starch last. 3) Stop at comfortably satisfied, not stuffed.
- conflicts/synergies: Same lever as EnergyMax `lunch_balance` and LongevityMax `veg_first`; one lunch task. Pairs with `walk_to_think` or EnergyMax `post_meal_walk` straight after. Keep the hardest thinking out of the first 30–60 min after lunch when they have a choice.
- source: https://doi.org/10.1016/j.physbeh.2011.11.025

### `walk_to_think` — Daylight walk
- minutes: 10 / 15
- kind: action
- lever: movement
- anchor: lunch or afternoon (into the post-lunch dip, or whenever a hard problem stalls)
- frequency: 3 times a week
- tier: medium
- avoid if: none
- why: Walking raised creative idea output by about 60% compared with sitting, and daylight after lunch reduced afternoon sleepiness for at least an hour.
- how: 1) Head outside, toward trees, a park or water if there is one nearby. 2) Walk at an easy-to-brisk pace for 10–15 min with no podcast, letting your mind wander over whatever you're stuck on. 3) Look up at distant views rather than down at your phone.
- conflicts/synergies: Same concept group as CalmMax `outdoor_walk` and LongevityMax `nature_time`; EnergyMax `post_meal_walk` can be the same walk. Doubles as afternoon light and counts toward `daily_steps`. On smoke or high-pollution days, walk indoors near windows.
- source: https://doi.org/10.1037/a0036577

### `nsdr_break` — NSDR / yoga nidra
- minutes: 10 / 20
- kind: action
- lever: rest
- anchor: afternoon (early afternoon or lunch; the pick when napping isn't possible)
- frequency: 3–5 times a week
- tier: medium
- avoid if: distress or flashbacks during body-focused meditation, psychosis
- why: In a 2-month trial of 362 adults, 11 min of daily yoga nidra lowered stress, and 10 min of quiet eyes-closed rest after learning improved recall a week later.
- how: 1) Lie down or recline somewhere quiet, eyes closed, headphones in. 2) Play a 10–20 min guided yoga nidra or body-scan track and follow the voice through your body and breath. 3) When it ends, lie still for a minute, sit up slowly, and get some light before you start again.
- conflicts/synergies: Same lever as CalmMax `body_scan`. Pick this or `power_nap` on a given day, never both. Fine on days with no caffeine.
- source: https://doi.org/10.1002/smi.70049

### `power_nap` — 10–20 minute nap
- minutes: 10 / 20
- kind: action
- lever: sleep
- anchor: afternoon (early afternoon, at least 7 h before bed)
- frequency: on short-sleep days (up to 5 times a week)
- tier: hard
- avoid if: insomnia, suspected sleep apnea, falling asleep without meaning to during the day
- why: After a 5-hour night, a 10-min nap improved alertness and performance at once for up to 155 min, while a 30-min nap caused grogginess first.
- how: 1) Lie down or recline somewhere dim and quiet. 2) Rest with your eyes closed for 10–20 min; it still counts if you only doze. 3) Get up when the time is up, then step into bright light or splash cold water on your face. If caffeine is in your plan and you're before the cutoff, a coffee right before you lie down (a caffeine nap) kicks in as you wake.
- conflicts/synergies: Follows SleepMax `nap_rule` (no naps within 7 h of bed, none for people who struggle to fall asleep). Pick this or `nsdr_break` on a given day. The caffeine version spends the day's caffeine budget and must sit before `caffeine_cutoff`.
- source: https://doi.org/10.1093/sleep/29.6.831

### `cold_shower_finish` — Cold shower finish
- minutes: 1 / 2
- kind: action
- lever: temperature
- anchor: get_ready (end of the morning shower)
- frequency: 3 times a week (build to daily if they like it)
- tier: hard
- avoid if: heart condition or high blood pressure, heart rhythm problems, raynaud's or cold sensitivity, cold urticaria, pregnancy, epilepsy or fainting, sickle cell disease, peripheral neuropathy
- why: Cold water is a strong noradrenaline trigger, and in a 3,018-person trial ending showers with 30–90 s of cold for a month cut sickness-absence days by 29%.
- how: 1) Finish your usual warm shower, then switch to cold for 30 s, building toward 60–90 s over a few weeks. 2) Breathe slowly through the first gasp with long exhales and never hold your breath; step out if you feel dizzy or your chest feels tight. 3) Dry off and warm up with movement or clothes before you sit down to work.
- conflicts/synergies: Keep it 4–6 h away from a FitMax strength session when muscle growth is the goal (cold right after lifting blunts gains). Keep it brief: long cold exposure impairs working memory until you've rewarmed. Never combine it with breath-hold rounds. Pairs with `morning_light` straight after. Same lever as EnergyMax and CalmMax cold habits; schedule one.
- source: https://doi.org/10.1371/journal.pone.0161749

### `fresh_air_flush` — Fresh air
- minutes: 1 / 5
- kind: action
- lever: air
- anchor: work_break (as work starts and every 1–2 h)
- frequency: weekdays
- tier: medium
- avoid if: smoke or high outdoor pollution, pollen allergy on high-pollen days
- why: Office cognitive scores were 101% higher with boosted ventilation than in a conventional office, and raising CO2 from 600 to 1,000 ppm lowered 6 of 9 decision scores.
- how: 1) Open windows or a door wide for 5–10 min; two openings on different walls clear the room fastest. 2) If you have a CO2 monitor, keep it below about 1,000 ppm and air out whenever it climbs past that. 3) Close up once the air feels fresh, or leave a window cracked if the weather allows.
- conflicts/synergies: Run it during `micro_break`. On bad-air days rely on the building's ventilation or a purifier. SleepMax `bedroom_setup` pulls the same lever at night.
- source: https://doi.org/10.1289/ehp.1510037

### `focus_space_setup` — Set up your desk
- minutes: 10 / 15
- kind: setup
- lever: light
- anchor: any (once, on a workday in week 1; revisit when the seasons change)
- frequency: once (week 1)
- tier: core
- avoid if: none
- why: Office workers with windows got 173% more daytime light and slept 46 min longer, and office task performance peaks around 22 °C and is about 9% lower at 30 °C.
- how: 1) Move your desk or chair so you face or sit beside a window, within a few metres of it, and keep the blinds open during the day. 2) Set the room to about 21–24 °C, toward the warmer end if you run cold. 3) If people talk near you, use earplugs or headphones you already own, and keep music lyric-free while you read or write.
- conflicts/synergies: Gives `morning_light` a fallback on days they can't get out; the extra daytime light also helps SleepMax. Default to quiet, not noise: steady white or pink noise slightly hurt people without ADHD. Pairs with `fresh_air_flush`.
- source: https://doi.org/10.5664/jcsm.3780

## What the AI needs to know (intake)
The profile already has wake and bed times (so night length), work hours, meals, workouts and minutes per day. Ask only these:

1. `caffeine_pattern` (required) — Whether any caffeine habits appear (none → light, movement and cold carry the plan), and the 13-hour cutoff for energy drinks.
   Q: "How much caffeine do you have on a typical day?" Options: None | 1 cup | 2–3 cups | 4+ or energy drinks
2. `focus_window` (required) — Where caffeine, the movement primer and water land; an afternoon window moves caffeine to green tea at lunch and the primer after lunch.
   Q: "When do you most need to be sharp?" Options: Start of my workday | Late morning | Afternoon | Evening | It changes day to day
3. `health_flags` (required, multi) — Removes cold water, hard bursts and caffeine habits for the people they're wrong for (shared across programs).
   Q: "Do any of these apply to you?" Options: None of these | Heart or blood-pressure condition | Pregnant or breastfeeding | Pain or injury | Raynaud's or cold sensitivity | Panic attacks, seizures or fainting | Prefer not to say
4. `cold_tolerance` (optional) — Whether `cold_shower_finish` is offered and at what starting length (shared across programs).
   Q: "How do you feel about cold water?" Options: Up for it | Willing to try 30 seconds | Not for me
5. `rest_spot` (optional) — Whether daytime rest is a nap, NSDR or neither, and on workdays or only days off.
   Q: "Could you lie down or recline for 15 minutes during the day?" Options: Yes, at work | Only at home or on days off | No

## Scheduling rules
- Order around the focus window: `hydrate_to_focus` as work starts, `caffeine_for_focus` about 30 min before the focus window, `move_before_focus` in the 30 min before it, then the work. `micro_break` every 30–60 min of sitting after that, with `fresh_air_flush` riding on a break every 1–2 h.
- `morning_light` within 60 min of waking every day, shared with SleepMax and EnergyMax. With `cold_shower_finish` on, light comes straight after the shower.
- Caffeine habits only when `caffeine_pattern` isn't None. With no caffeine, light, movement, cold (if tolerated) and CalmMax `physiological_sigh` carry the plan.
- Caffeine limits: no more than 200 mg at one time and 400 mg a day across every caffeine habit. Cutoff 9 h before bed for coffee, tea and matcha, 13 h for energy drinks and pre-workouts; never place a caffeine habit after it. No fixed "wait 90 minutes after waking" rule.
- `focus_window` Afternoon: caffeine moves to late morning or lunch (`green_tea_afternoon` for tea drinkers), the movement primer goes after lunch, and `walk_to_think` replaces the morning primer on those days.
- Lunch: `protein_first_lunch` at lunch, then `walk_to_think` or EnergyMax `post_meal_walk` in the hour after.
- Daytime rest: a night under 7 h (from their wake and bed times) plus somewhere to lie down → `power_nap` early afternoon, at least 7 h before bed. Otherwise `nsdr_break` 3–5 times a week. Never both on one day. No naps for people with sleep-onset trouble (SleepMax `nap_rule`).
- A night under 6 h: SleepMax comes first; say plainly that no focus lever makes up for steady short sleep.
- Cold only when `cold_tolerance` isn't "Not for me" and the health flags are clear: 3 times a week at 30 s, morning only, never in the 4–6 h after a FitMax strength session when muscle growth is the goal.
- Hard bursts (step 2 of `move_before_focus`) only with health flags "None of these"; everyone else keeps the brisk-walk version.
- Week 1 ramp: `morning_light`, `hydrate_to_focus`, `caffeine_for_focus` (caffeine users), `caffeine_cutoff`, `micro_break`, and `focus_space_setup` once. Week 2: add `move_before_focus`, `protein_first_lunch` and `fresh_air_flush`. Week 3+: add `walk_to_think`, `nsdr_break` or `power_nap`, `green_tea_afternoon`, and `cold_shower_finish` if tolerated.
- Scaling: about 5 min → light, water, caffeine timing, the cutoff and one or two micro-breaks. 10–20 min → add the movement primer and fresh air. 20+ min → add the walk, NSDR or a nap, and the cold finish.
- Weekends and days off: keep `morning_light`, `caffeine_cutoff` and water; the rest run on workdays unless they work or study weekends.

## Safety and claims
- Never recommend nicotine in any form, prescription stimulants, modafinil, racetams, psychedelic microdosing, "nootropic stacks" or green-tea extract pills. Never comment on, start, stop or change stimulant or other medication. Supplements (L-theanine, creatine, omega-3) only come through Suppmax, at the serving on the label.
- Nicotine is excluded on purpose: its small short-term attention effect comes with addiction, tolerance (withdrawal itself worsens attention), raised heart rate and blood pressure, and harm in pregnancy and to the developing brain.
- Caffeine: the FDA cites 400 mg a day as not generally linked to problems in healthy adults; EFSA puts single doses up to 200 mg at no concern, and 200 mg a day in pregnancy. No caffeine habits under 18, in pregnancy or with panic attacks. Interactions (fluvoxamine, stimulant medication) go to a pharmacist.
- Cold water: the cold-shock gasp, a blood-pressure spike and heart-rhythm disturbances are real risks. Never alone in open water, never with breath-holding, stop at dizziness or chest tightness. The shared health question gates it.
- FocusMax never schedules cyclic hyperventilation or breath-hold rounds: low CO2 cuts brain blood flow, slowed reaction times in lab tests and can cause blackouts. Calming breathing lives in CalmMax.
- Movement: stop at chest pain, unusual breathlessness or dizziness and see a clinician. Hard bursts only for people with no health flags.
- Naps: heavy daytime sleepiness despite enough sleep is a reason to see a clinician (sleep apnea, narcolepsy), not a reason for more naps or caffeine.
- Water: no fixed "litres a day" targets; respect fluid limits a doctor set.
- Food: no calorie counting or restriction language. Skip meal habits for an eating-disorder history; people on insulin or sulfonylureas check with their care team before changing meals.
- Claims: "may help you feel more alert", "supported attention in studies", effects small to moderate. No "boost IQ", "raise dopamine", "rewire your brain", "limitless" or "flow state" promises. NSDR "may help you feel rested".
- Don't diagnose ADHD or any other condition. Persistent or new concentration problems go to a GP.
- If the user describes burnout, hopelessness or thoughts of self-harm, stop coaching and point to professional help (in the US, call or text 988).
- Excluded as unsupported: grounding/earthing, binaural beats (5 of 14 studies supported entrainment, 8 contradicted it), blue-light glasses for focus (Cochrane: probably no difference), "dopamine detox", consumer brain stimulation, pink or brown noise for people without ADHD, and strict caffeine-delay rules.

## Sources
- https://doi.org/10.1093/sleep/26.2.117
- https://doi.org/10.1016/j.neubiorev.2016.09.001
- https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much
- https://doi.org/10.2903/j.efsa.2015.4102
- https://doi.org/10.1016/j.smrv.2023.101764
- https://doi.org/10.1111/nure.12120
- https://doi.org/10.3945/ajcn.113.058248
- https://doi.org/10.1111/psyp.12736
- https://doi.org/10.1152/japplphysiol.00310.2018
- https://doi.org/10.1016/j.clae.2022.101744
- https://doi.org/10.1249/MSS.0000000000001682
- https://doi.org/10.1016/j.physbeh.2011.11.025
- https://doi.org/10.1037/a0036577
- https://doi.org/10.1080/10937404.2018.1505571
- https://doi.org/10.1016/j.bbr.2017.09.016
- https://doi.org/10.1371/journal.pbio.3001571
- https://doi.org/10.5664/jcsm.3780
- https://doi.org/10.1002/smi.70049
- https://doi.org/10.1093/sleep/29.6.831
- https://doi.org/10.1371/journal.pone.0161749
- https://doi.org/10.1113/ep087602
- https://doi.org/10.1289/ehp.1510037
- https://doi.org/10.1289/ehp.1104789
- https://escholarship.org/uc/item/45g4n3rv
- https://doi.org/10.1037/a0023987
- https://doi.org/10.1016/j.jaac.2023.12.014
- https://doi.org/10.1016/j.xcrm.2022.100895
- https://doi.org/10.1007/s00213-010-1848-1
- https://doi.org/10.1002/14651858.CD013244.pub2
- https://doi.org/10.1371/journal.pone.0286023

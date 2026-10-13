# Peptidemax

## What it is
Peptidemax keeps the peptide protocol you already have organized: dose reminders at the times your prescriber or clinic set, injection-site rotation, safe mixing and fridge storage, a short side-effect log, on/off cycle tracking, bloodwork and prescriber check-ins, and refills planned before you run out. Some protocols also come with support habits, like protein and strength training to protect muscle on a GLP-1. The app never recommends a peptide, never suggests or calculates a dose, and never explains where or how to get one. The program does not sync with the user's other programs, because getting a peptide is a separate medical process (a prescription, a clinic, or otherwise). Education about peptides by goal lives in the course and in the "Peptides by goal" section below, and it is information only.

## Who it fits / who should check with a professional first
Fits: adults (18+) who already use a peptide (for example semaglutide or tirzepatide for weight, tesamorelin, bremelanotide, or a clinic protocol) and want reminders and tracking that follow their prescriber's instructions. Also fits people who are only considering peptides and want the course content. For them, the only task is a "talk to a clinician" check-in, never a protocol.

Check with a professional first (the app should suggest this, not diagnose):
- Anyone using a peptide without a licensed clinician (self-sourced, "research use only", or bought online). The app still organizes tracking, but it adds a clear prompt to involve a clinician and to use a licensed US pharmacy.
- Pregnant, trying to conceive, or breastfeeding. Most peptides have no safety data in pregnancy, and GLP-1 labels advise stopping well before a planned pregnancy (Wegovy's label says at least 2 months). Tirzepatide can make oral birth control less reliable for a while after starting and after each dose increase. Tell the prescriber.
- A personal or family history of medullary thyroid cancer or MEN 2, past pancreatitis, gallbladder disease, diabetic eye disease, or kidney problems, for GLP-1 drugs.
- A history of cancer, for growth-hormone-axis peptides (CJC-1295, ipamorelin, sermorelin, tesamorelin, MK-677), because they raise GH and IGF-1. Also anyone with diabetes, since these can raise blood sugar.
- Anyone on insulin or a sulfonylurea who starts a GLP-1 (higher risk of low blood sugar), or taking many medicines.
- An eating disorder now or in the past, or a very low body weight. Do not run a weight-focused protocol through the app. Suggest a clinician.
- Competitive athletes tested under WADA rules. Many peptides are banned at all times (see the table below). Check Global DRO or your federation before using anything.
- Under 18: excluded. The program does not open for minors.

## Habit library

### `protocol_dose` — Dose reminder (your prescriber's instructions)
- minutes: 1 / 3
- anchor: the time of day the user said their prescriber set (else a consistent time they choose, e.g. with breakfast or before bed)
- frequency: exactly as the user stated (e.g. once a week on Sunday, daily, 5 on / 2 off). Never inferred.
- tier: core
- programs: none
- primary for: none
- why: The same day and time each week or day makes missed or doubled doses less likely.
- how: 1) One reminder per peptide, titled "<peptide> dose" (the planner files each one as `custom_dose_<peptide>`). 2) The "how" is the user's own words for what their prescriber said. The app never writes, rounds or changes an amount. 3) If you missed a dose, follow your label or ask your prescriber; do not double up.
- conflicts/synergies: Pairs with `site_rotation` and `side_effect_log` on dose days. If two peptides share a time, keep them as two reminders 5 min apart so each one is ticked off separately.
- source: https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215256s011lbl.pdf

### `site_rotation` — Rotate your injection site
- minutes: 1 / 1
- anchor: with each injectable dose reminder
- frequency: every injection day
- tier: core
- programs: none
- primary for: none
- why: Injecting the same spot again and again can cause lumps, bruising and skin changes, and may affect absorption. Labels for injectable peptides say to rotate sites.
- how: 1) Use the areas your prescriber or label allows (often belly, thigh, upper arm). 2) Move to a new spot each time, at least a couple of fingers away from the last. 3) Log the site so next time is obvious.
- conflicts/synergies: Folds into the dose reminder as a second step; it is not a separate time slot.
- source: https://medlineplus.gov/ency/patientinstructions/000430.htm

### `injection_hygiene` — Clean injection steps
- minutes: 1 / 2
- anchor: with each injectable dose reminder
- frequency: every injection day (as a checklist, then less prominent after week 2)
- tier: core
- programs: none
- primary for: none
- why: Clean hands, a fresh needle and an alcohol-wiped site and vial top lower the risk of skin and blood infections.
- how: 1) Wash your hands. 2) Wipe the vial top and the skin with alcohol and let them dry. 3) Use a new needle or pen needle every time. Never share pens, needles or vials.
- conflicts/synergies: Merge with `site_rotation` into one short checklist on dose days.
- source: https://medlineplus.gov/ency/patientinstructions/000430.htm

### `reconstitution_check` — Mixing day check
- minutes: 3 / 5
- anchor: the day a new vial is mixed (only if the user's product comes as a powder)
- frequency: per new vial, as the user's pharmacy or prescriber instructions say
- tier: medium
- programs: none
- primary for: none
- why: Powdered peptides have to be mixed exactly as the pharmacy label says, and the mixed vial has a limited shelf life. Mistakes here change how much is in every dose.
- how: 1) Follow only the pharmacy label or your prescriber's written steps for the liquid and volume. The app never calculates these. 2) Write the mix date on the vial. 3) Set the discard date from the label.
- conflicts/synergies: Triggers `cold_chain_check` discard date. Skip entirely for pre-filled pens.
- source: https://www.fda.gov/drugs/postmarket-drug-safety-information-patients-and-providers/fdas-concerns-unapproved-glp-1-drugs-used-weight-loss

### `cold_chain_check` — Storage and discard dates
- minutes: 1 / 2
- anchor: weekend (weekly check) plus travel days
- frequency: 1×/week
- tier: core
- programs: none
- primary for: none
- why: Many peptides must stay refrigerated and must not freeze, and opened pens and mixed vials expire. Heat, freezing or old product can mean it no longer works as expected.
- how: 1) Check the fridge spot: not in the door, not against the back wall where it can freeze. 2) Look at the open or mix date and the label's discard date. 3) Travelling: follow the label's room-temperature limits and use an insulated case.
- conflicts/synergies: Pairs with `refill_planning` (an expired vial can mean an early refill).
- source: https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215256s011lbl.pdf

### `sharps_disposal` — Sharps container check
- minutes: 1 / 2
- anchor: weekend
- frequency: 1×/week (and set up once in week 1)
- tier: medium
- programs: none
- primary for: none
- why: Used needles should go straight into an FDA-cleared sharps container (or a heavy-duty plastic household container if none is available), not loose in the trash.
- how: 1) Keep the container near where you inject. 2) When it is about three-quarters full, seal it. 3) Check your local rules for drop-off or mail-back.
- conflicts/synergies: None. One-time setup is a good week-1 win.
- source: https://www.fda.gov/medical-devices/safely-using-sharps-needles-and-syringes-home-work-and-travel/best-way-get-rid-used-needles-and-other-sharps

### `side_effect_log` — 30-second side-effect log
- minutes: 1 / 1
- anchor: evening of each dose day and the day after
- frequency: on dose days and the day after for the first 4 weeks and after any dose change, then 2×/week
- tier: core
- programs: none
- primary for: none
- why: A short log helps you and your prescriber see patterns (nausea after a dose increase, a site that keeps reacting) and spot warning signs early.
- how: 1) Rate how you feel 1–5. 2) Tick any of: nausea, vomiting, constipation, diarrhea, site redness, headache, dizziness, low mood, other. 3) Severe belly pain, signs of an allergic reaction, or a hot, spreading, painful site: stop logging and get care now.
- conflicts/synergies: Feeds `weekly_protocol_review` and `prescriber_followup`. Never present the log as a diagnosis.
- source: https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215256s011lbl.pdf

### `cycle_review` — On/off cycle tracker
- minutes: 2 / 3
- anchor: weekend, on the day a cycle phase starts or ends
- frequency: only if the user said their prescriber set on/off cycles; at each phase change
- tier: medium
- programs: none
- primary for: none
- why: Some clinic protocols run in cycles (for example 5 days on, 2 off, or a number of weeks on then a break). Tracking the phase keeps reminders off on break days.
- how: 1) Check which phase you are in and when it ends. 2) Confirm the reminders match (no dose reminders on off days). 3) Unsure when a cycle should end? Ask your prescriber; the app never sets cycle lengths.
- conflicts/synergies: Controls the days of `protocol_dose`. Not shown for continuous protocols like weekly GLP-1s.
- source: https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks

### `bloodwork_checkin` — Bloodwork reminder
- minutes: 2 / 5
- anchor: a weekday morning (many tests are done fasting; follow your clinic's instructions)
- frequency: as the prescriber set; if none was stated, a monthly "ask about labs" reminder
- tier: medium
- programs: none
- primary for: none
- why: Prescribers often check labs before and during peptide use (for example blood sugar, kidney function, or IGF-1 on growth-hormone-axis peptides). Booking ahead keeps it from slipping.
- how: 1) Book the draw your prescriber ordered. 2) Note any fasting instructions they gave. 3) Save results and bring questions to `prescriber_followup`.
- conflicts/synergies: Pairs with `prescriber_followup`. The app never reads or interprets lab results as a diagnosis.
- source: https://pubmed.ncbi.nlm.nih.gov/40450457/

### `prescriber_followup` — Prescriber check-in
- minutes: 5 / 10
- anchor: a weekday break or after work
- frequency: monthly, or as the prescriber set. Week 1 only: becomes "Confirm your protocol with your prescriber" if the peptide, schedule or instructions are unclear, or if the user is self-sourcing.
- tier: core
- programs: none
- primary for: none
- why: Dose changes, side effects and stopping are decisions for a licensed clinician. A standing check-in keeps the protocol supervised.
- how: 1) Bring your side-effect log and any lab results. 2) Ask the questions on your list (the course has a starter list). 3) Update the plan in the chat only with what your prescriber said.
- conflicts/synergies: Pairs with `bloodwork_checkin` and `refill_planning`.
- source: https://www.fda.gov/drugs/postmarket-drug-safety-information-patients-and-providers/fdas-concerns-unapproved-glp-1-drugs-used-weight-loss

### `refill_planning` — Refill before you run out
- minutes: 2 / 3
- anchor: weekday daytime (pharmacy hours)
- frequency: 1×/month or 7–10 days before the supply the user mentioned runs out
- tier: medium
- programs: none
- primary for: none
- why: Running out leads to missed doses, and restarting after a gap may need the prescriber's input (for GLP-1s, restarting at the old dose after a long gap can bring back stomach side effects).
- how: 1) Check how many doses or pens are left. 2) Request the refill from your prescriber and a licensed pharmacy. 3) Missed more than your label allows? Ask your prescriber before restarting.
- conflicts/synergies: Pairs with `cold_chain_check`. Never suggest another source when there is a supply gap.
- source: https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215256s011lbl.pdf

### `weekly_protocol_review` — Weekly protocol review
- minutes: 3 / 5
- anchor: weekend
- frequency: 1×/week
- tier: core
- programs: none
- primary for: none
- why: Five minutes a week to check doses taken, side effects and upcoming labs or refills catches problems while they are small.
- how: 1) Doses on time this week? 2) Any side effect getting worse or not settling? Flag it for your prescriber. 3) Anything coming up: labs, refill, cycle change, travel?
- conflicts/synergies: Hosts `cycle_review` and `cold_chain_check` on the same day when possible.
- source: https://pubmed.ncbi.nlm.nih.gov/40450457/

### `protein_at_meals` — Protein at each meal
- minutes: 0 / 0 (a meal rule plus a reminder)
- anchor: meals (breakfast, lunch, dinner)
- frequency: daily (only for GLP-1 or other weight-loss protocols, or if the user asks)
- tier: core
- programs: none
- primary for: none
- why: When appetite drops on a GLP-1, protein often drops too. A good share of weight lost can be lean mass, and a 2025 joint nutrition advisory lists enough protein plus strength training as priorities.
- how: 1) Eat the protein part of the meal first. 2) Aim for a palm-sized portion (or a protein-rich option) at each meal. 3) Small appetite? Smaller, more frequent protein-rich snacks. Specific targets are for your clinician or dietitian.
- conflicts/synergies: Pairs with `resistance_training`. Do not frame as calorie restriction or fasting.
- source: https://pubmed.ncbi.nlm.nih.gov/40450457/

### `resistance_training` — Strength training to keep muscle
- minutes: 20 / 30
- anchor: the user's usual workout time
- frequency: 2–3×/week, non-consecutive days (only for GLP-1 or other weight-loss protocols, or if the user asks)
- tier: core
- programs: none
- primary for: none
- why: Strength training is the main lever for keeping muscle while losing weight, and the 2025 joint advisory recommends it alongside GLP-1 therapy.
- how: 1) Two or three short sessions of major-muscle moves (squat or sit-to-stand, push, pull, hinge). 2) Add a little weight or reps over the weeks. 3) Feeling faint or very low energy? Go easier and tell your prescriber.
- conflicts/synergies: If the user also runs Fitmax, do not schedule a second strength session. Credit the Fitmax sessions here. Keep hard sessions away from the hours right after a dose if the user reports nausea then.
- source: https://pubmed.ncbi.nlm.nih.gov/40450457/

### `hydration_fiber` — Water and fiber for GI comfort
- minutes: 1 / 2
- anchor: breakfast and mid-afternoon
- frequency: daily (only for GLP-1 or other protocols where the user reports GI effects, or if the user asks)
- tier: medium
- programs: none
- primary for: none
- why: Nausea, vomiting, diarrhea and constipation are the most common GLP-1 side effects. Dehydration from them is linked to kidney problems, and fluid plus fiber helps with constipation.
- how: 1) Keep a water bottle in sight and sip through the day, more if you have vomiting or diarrhea. 2) Add fiber slowly through vegetables, fruit, beans or whole grains. 3) Smaller meals, stop when full, and go easy on greasy food.
- conflicts/synergies: Same lever as Energymax hydration. If both are on, count it once. Ongoing vomiting or no fluids staying down: contact a clinician.
- source: https://pubmed.ncbi.nlm.nih.gov/40450457/

## Peptides by goal (information only)
This section is for the course and for answering questions. It is not a recommendation, and it never includes doses. "Approved" means FDA-approved for a specific use. Compounded and "research use only" products are not FDA-reviewed for safety, quality or effectiveness. Status checked October 2026.

### How the regulation works (plain words)
- **FDA-approved**: tested in human trials and approved for a specific use, made to checked quality standards (semaglutide, tirzepatide, liraglutide, tesamorelin, bremelanotide, setmelanotide, elamipretide).
- **Compounded**: a licensed pharmacy makes it for a prescription. It can only use ingredients that qualify: parts of approved drugs, USP monograph substances, or ones on FDA's "bulks list" (Category 1 while the list is being built). Compounded products are not FDA-approved.
- **Category 2**: in 2023 FDA placed many popular peptides (BPC-157, TB-500, CJC-1295, ipamorelin, AOD-9604, GHK-Cu injectable, MOTS-c, epitalon, selank, semax, melanotan II and others) in Category 2, "significant safety risks", mostly over immune reactions (immunogenicity), impurities and missing human safety data. That meant pharmacies should not compound them.
- **2024**: several were removed from Category 2 after nominators withdrew them (including CJC-1295, AOD-9604, selank). FDA's advisory committee (PCAC) then voted against adding ipamorelin (Oct 29, 2024) and CJC-1295 (Dec 4, 2024) to the bulks list, and FDA proposed not to add AOD-9604.
- **April 2026**: FDA removed 12 more from Category 2 after nominations were withdrawn: BPC-157, TB-500, MOTS-c, epitalon, semax, KPV, DSIP (emideltide), LL-37, dihexa, PEG-MGF, melanotan II and injectable GHK-Cu (effective about April 22, 2026). Removal does not make them legal to compound. They are in a gap: not flagged as significant risks, but not cleared either.
- **July 23–24, 2026**: the PCAC voted narrowly to recommend BPC-157, KPV, TB-500, MOTS-c, epitalon and semax for the 503A bulks list, against the unanimous recommendation of FDA's own scientists. It rejected DSIP. The vote is advisory. FDA has to propose and finalize a rule, which can take a year. As of October 2026 no final FDA decision was found. GHK-Cu, LL-37, dihexa, melanotan II and PEG-MGF go to the PCAC before the end of February 2027.
- **"Research use only" / "not for human consumption"** sellers: FDA treats these as unapproved drugs when marketed for people. It sent warning letters to peptide sellers in 2026. Tests of gray-market products have found wrong amounts, low purity and bacterial endotoxin.
- **GLP-1 compounding**: tirzepatide (Dec 2024) and semaglutide (Feb 2025) came off the FDA shortage list, ending mass compounding of copies. In 2026 FDA sent warning letters to telehealth sellers and proposed (April 30, 2026) to bar outsourcing facilities from compounding semaglutide, tirzepatide and liraglutide from bulk powder. That proposal was still pending when last checked.

### Weight and metabolic (no weight program; supports: Fitmax strength, protein, hydration)
| Peptide | What people use it for | Evidence | FDA status (Oct 2026) | Key risks | WADA |
|---|---|---|---|---|---|
| Semaglutide (Wegovy, Ozempic, Rybelsus; Wegovy pill) | Weight loss, type 2 diabetes, heart risk | Strong: large human RCTs (STEP, SELECT) | Approved. Wegovy injection for weight, heart-risk reduction and MASH (2025); Wegovy pill approved Dec 2025 | Nausea, vomiting, diarrhea, constipation; pancreatitis; gallbladder disease; low blood sugar with insulin/sulfonylureas; kidney injury from dehydration; boxed warning for thyroid C-cell tumors (MTC/MEN 2 history); lean-mass loss. NAION (an eye nerve problem) is listed as a very rare effect in the EU, UK, Canada and Australia; not on the US label as of mid-2026 | Not prohibited |
| Tirzepatide (Zepbound, Mounjaro) | Weight loss, diabetes, sleep apnea with obesity | Strong: large RCTs (SURMOUNT, SURPASS) | Approved (Zepbound for weight and for obstructive sleep apnea) | Same GI, pancreatitis, gallbladder and thyroid warnings as above; can reduce oral birth control reliability after starting and after dose increases | Not prohibited |
| Liraglutide (Saxenda, Victoza; generics) | Weight, diabetes | Strong: RCTs | Approved; generics available | GLP-1 class risks; daily injection | Not prohibited |
| Setmelanotide (Imcivree) | Rare genetic obesity only | RCT-level in those conditions | Approved for specific genetic forms | Skin darkening, nausea, injection-site reactions, mood changes | Not named |
| Retatrutide | Weight loss ("reta") | Strong phase 3 results (TRIUMPH) but not yet reviewed | Investigational. Not approved anywhere; Lilly plans to file in Q1 2027. Anything sold now is unapproved; FDA warning letters and Lilly lawsuits in 2026; poison-center exposures rose in 2026 | Unknown real contents; GLP-1 class risks plus unknown dose | Not named; unapproved drugs fall under S0 |
| AOD-9604 | Fat loss (a growth-hormone fragment) | Human obesity trials did not show meaningful weight loss | Not approved. Removed from Category 2 (2024); FDA proposed not to add it to the bulks list | Immune reactions, impurities, limited safety data | Prohibited (S2, GH fragments) |
| MOTS-c | Metabolism, insulin sensitivity, "exercise mimetic" | Animal only (an analog had early human trials) | Not approved. Removed from Category 2 April 2026; PCAC voted 7–5 to recommend (July 2026); FDA decision pending | Immune reactions; no human exposure data per FDA | Prohibited (S4, AMPK activators) |
| Orforglipron (Foundayo) | Weight | RCTs | Approved ~April 2026. A pill, not a peptide; listed so users are not confused | GLP-1 class effects | Not prohibited |

### Recovery and training (Fitmax)
| Peptide | What people use it for | Evidence | FDA status (Oct 2026) | Key risks | WADA |
|---|---|---|---|---|---|
| BPC-157 | Tendon, ligament, gut healing | Mostly animal. A 2025 systematic review found 35 animal studies and 1 small human study; other human data are tiny pilots (2–12 people) without controls | Not approved. Category 2 (2023) → removed April 2026 → PCAC voted 8–6 to recommend (for ulcerative colitis) in July 2026 against FDA staff; FDA decision pending. Not on the bulks list yet | Immune reactions, impurities, unknown long-term effects; gray-market contamination; injection infections | Prohibited at all times (S0, named) |
| TB-500 (thymosin beta-4 fragment) | Injury recovery, flexibility | Animal only for the fragment; FDA noted no human exposure data. Full-length thymosin beta-4 has had small human trials (eye, wound) | Not approved. Removed from Category 2 April 2026; PCAC voted to recommend (July 2026); FDA questioned what form people actually receive | Immune reactions, unknown contents | Prohibited (S2, named) |
| CJC-1295 | Raise growth hormone for recovery, body composition | Small human studies (hormone levels) only | Not approved. Removed from Category 2 (2024); PCAC voted against bulks list (Dec 2024). Not compoundable | Raises GH/IGF-1; flushing, water retention, faster heart rate, blood sugar; FDA cited serious events | Prohibited (S2, named) |
| Ipamorelin | Same, often paired with CJC-1295 | Limited human data; a phase 2 trial for gut recovery after surgery did not meet its goal | Not approved. Still Category 2 for outsourcing facilities; PCAC voted against bulks list (Oct 2024) | Immune reactions; FDA cited deaths and serious events with IV use | Prohibited (S2, named) |
| Tesamorelin (Egrifta SV / WR) | Belly (visceral) fat; off-label body composition | RCTs, but only in HIV-associated lipodystrophy | Approved only for excess belly fat in adults with HIV and lipodystrophy (Egrifta WR approved March 2025). Other uses are off-label | Joint pain, swelling, injection-site reactions, raised blood sugar, IGF-1 rise | Prohibited (S2, named) |
| GHRP-2, GHRP-6, hexarelin | GH release | Limited | Not approved. GHRP-2 and GHRP-6 are Category 2 | Immune reactions, cortisol and blood sugar effects | Prohibited (S2) |

### Sleep and the GH axis (Sleepmax)
| Peptide | What people use it for | Evidence | FDA status (Oct 2026) | Key risks | WADA |
|---|---|---|---|---|---|
| Sermorelin | "GH optimization", sleep quality | Older human studies in GH deficiency; little good data in healthy adults | Was FDA-approved (Geref, 1997) and withdrawn in 2008 for business reasons, not safety. Widely compounded; its exact bulks-list status is disputed, so ask the pharmacist | Flushing, headache, injection-site reactions; GH/IGF-1 effects | Prohibited (S2, named) |
| CJC-1295 / ipamorelin | Deeper sleep, recovery | See above. No good human trials for sleep | See above | See above | Prohibited |
| DSIP (emideltide) | Sleep | Weak, old, mixed human data | Not approved. PCAC rejected it (July 2026) | Unknown | Not named |
| Epitalon | Sleep, "melatonin", aging | Small studies, mostly from one Russian group; low quality | Not approved. Removed from Category 2 April 2026; PCAC voted to recommend (for insomnia); FDA decision pending | Immune reactions, impurities; no safety data for injection | Not named; unapproved drugs fall under S0 |
| MK-677 (ibutamoren) | GH, sleep | Some human trials | Not a peptide (a pill). Category 2: possible heart failure | Blood sugar rise, water retention, appetite | Prohibited (S2, named) |

Note for Sleepmax users: no peptide replaces the sleep basics, and GH-axis peptides can raise blood sugar. Sleep problems lasting months need a clinician.

### Skin and hair (Skin & Hair)
| Peptide | What people use it for | Evidence | FDA status (Oct 2026) | Key risks | WADA |
|---|---|---|---|---|---|
| GHK-Cu (topical) | Skin firmness, fine lines, hair | Small cosmetic studies and lab data; modest | Sold as a cosmetic ingredient in creams and serums (cosmetics are not FDA-approved) | Irritation; generally low risk on skin | Not named |
| GHK-Cu (injectable) | Same, "systemic" | No good human data for injection | Not approved. Injectable removed from Category 2 April 2026; PCAC review before end of Feb 2027. Not compoundable now | Immune reactions, impurities, injection risks | Not named |
| Melanotan II | Tanning, libido | No approved use; case reports only | Not approved. Removed from Category 2 April 2026; PCAC review before end of Feb 2027 | Case reports of melanoma and new or changing moles, brain swelling (PRES), priapism, nausea | Not named; unapproved drugs fall under S0 |
| Bremelanotide (Vyleesi) | Low sexual desire in premenopausal women | RCTs | Approved (2019) for premenopausal women with HSDD only; not approved for men | Nausea (common), flushing, headache, a short rise in blood pressure, skin darkening | Not named |
| Collagen peptides (oral) | Skin, joints | Mixed, modest | A food supplement, not a drug; outside this program | Low | Not prohibited |

### Longevity, energy and cognition (Longevitymax, Energymax, Focusmax, Calmmax)
| Peptide | What people use it for | Evidence | FDA status (Oct 2026) | Key risks | WADA |
|---|---|---|---|---|---|
| Epitalon | "Telomeres", lifespan | See above (low quality) | See above | See above | See above |
| MOTS-c | Energy, metabolic aging | Animal only | See above | See above | Prohibited (S4) |
| Elamipretide / SS-31 (Forzinity) | Mitochondria, energy | RCT in Barth syndrome only | Approved (accelerated, Sept 2025) only for Barth syndrome, a rare genetic disease. Gray-market "SS-31" for energy is unapproved use | Injection-site reactions; unknown in healthy people | Not named |
| Semax | Focus, memory | Approved in Russia for stroke and other uses; little Western trial data | Not approved in the US. Removed from Category 2 April 2026; PCAC voted to recommend (reported 8–5, July 2026); FDA decision pending | Immune reactions; limited safety data | Not named |
| Selank | Anxiety, calm focus | Approved in Russia; small trials | Not approved in the US. Removed from Category 2 (2024); not on the bulks list | Immune reactions; limited safety data | Not named |
| Dihexa | Memory | Animal only | Not approved. Removed from Category 2 April 2026; PCAC review by Feb 2027 | Unknown; growth-factor activity raises theoretical cancer concerns | Not named |
| Thymosin alpha-1 | Immunity | Approved abroad for some infections | Not approved in the US; reviewed by PCAC Dec 2024 | Immune effects; limited data in healthy people | Not named |
| NAD+ | "Energy", aging | Mixed | Not a peptide; outside this program | — | — |

### How the course should phrase it
"If you run Fitmax, these are what people ask about, and here's the evidence": name the peptide, say what the evidence is (human trials vs animal only), say the FDA status, name the main risks, add the WADA line for athletes, and end with "talk to a licensed clinician". Never "you should try", never a dose, never a source.

## What the AI needs to know (intake)
The general profile already has wake/bed, work hours, meals, workout time and minutes/day. Ask only these, in order (3 max):

1. `peptide_supervision` (required, safety first) — Decides whether the plan adds a "confirm your protocol with a clinician" task and a clear caution.
   Q: "Who set up your peptide plan?" Options: A licensed clinician prescribes it | A clinic or telehealth oversees it | I'm sourcing it myself | I'm only considering peptides
   - "I'm sourcing it myself": still build tracking, add `prescriber_followup` titled "Confirm your protocol with a clinician" in week 1, and say plainly that research-grade products are not FDA-reviewed and that a clinician and a licensed pharmacy are safer. No judgment, no sourcing talk.
   - "I'm only considering peptides": no dose reminders. Plan = one `prescriber_followup` ("talk to a clinician about your goal") plus the course. Stop intake.
2. `peptide_protocol` (required) — Each peptide and the schedule the prescriber gave, in the user's words. Sets one `protocol_dose` reminder per peptide and decides whether `cycle_review`, `reconstitution_check` and the GLP-1 supports apply.
   Q: "Which peptide(s) do you use, and how often did your prescriber say to take each one?" Free text, with tap starters: Once a week | Daily | 5 on / 2 off | Other schedule
   - Record the name and frequency as stated. Do not ask for, store or repeat an amount. If the user volunteers one, keep it in their own words in the reminder "how" only. Never check, round or comment on it.
   - Missing a frequency, or the answer is unclear: ask once more simply, or schedule "Confirm your protocol with your prescriber" and hold the dose reminder until it is confirmed.
3. `injection_window` (optional) — Places reminders on days and times that fit their week. Skip it if the prescriber already fixed the day and time.
   Q: "When is it easiest to do your doses?" Options: Mornings | Evenings | Weekend day | Whatever my prescriber said

## Scheduling rules
- Dose reminders exactly per the user-stated frequency. Never invent, stretch, compress or "optimize" a schedule. Weekly → the same weekday and time each week. Daily → the same time each day. On/off cycles → reminders on "on" days only, tracked by `cycle_review`.
- One reminder per peptide, titled "<name> dose". If two land together, put them 5 min apart.
- If any part of the protocol is unclear (which peptide, how often, on/off), do not guess. Schedule `prescriber_followup` as "Confirm your protocol with your prescriber" in week 1 and leave that peptide's reminder out until the user confirms in chat.
- Pick a consistent time from the user's answer or day shape (e.g. with breakfast, or after dinner). Do not place injections in work hours or during the commute.
- Fasting or meal timing around a dose: only if the user says their prescriber told them so. Never add it otherwise.
- Site rotation and hygiene ride along on the dose reminder as checklist steps (no extra time slot).
- `side_effect_log`: evening of dose days and the day after, more often for the first 4 weeks and after any prescriber dose change, then 2×/week.
- `bloodwork_checkin` and `prescriber_followup`: per the prescriber, or monthly if they did not say. Never more often than weekly.
- `weekly_protocol_review`: one weekend slot, combined with `cold_chain_check` (and `cycle_review` when cycles apply).
- `refill_planning`: 7–10 days before the supply the user mentioned runs out, else monthly.
- `reconstitution_check`: only if the user's product is mixed from powder. Never for pre-filled pens.
- GLP-1 or weight protocols only: add `protein_at_meals`, `resistance_training` (2–3×/week, non-consecutive; credit Fitmax sessions instead of doubling) and `hydration_fiber` when GI effects are reported.
- Keep visible tasks small: cap at 4 visible tasks per day for this program, not counting dose reminders. Rules like `protein_at_meals` do not count against the time budget.
- Week 1: dose reminders + `site_rotation`/`injection_hygiene` (folded in) + `side_effect_log` + `sharps_disposal` setup + `weekly_protocol_review`. Add supports and bloodwork/refill reminders from week 2.
- This program never syncs with or pulls habits from other programs. Other programs never add peptide tasks.

## Safety and claims
- Never recommend a peptide, never suggest, calculate, convert, round or change a dose or mixing volume, and never explain how or where to get peptides (no vendors, no "research chem" sites, no ways around a prescription). If asked, say the app only organizes the protocol a clinician gave, and point to a licensed clinician.
- Encourage a licensed clinician and a licensed US pharmacy, and FDA-approved products where they exist (for example approved semaglutide or tirzepatide instead of copies). Say plainly that compounded and research-chemical products are not FDA-reviewed for safety, quality or effectiveness, and that "research use only" products have been found with wrong amounts and contamination.
- Emergency signs (tell the user to seek urgent care or call 911): severe belly pain that will not go away, with or without vomiting, sometimes spreading to the back (possible pancreatitis); pain in the upper right belly, fever, or yellow skin or eyes (gallbladder); swelling of the face, lips or throat, trouble breathing, a widespread rash or fainting (allergic reaction); an injection site that is hot, spreading red, very painful, pus-filled, or comes with fever (infection); sudden vision loss; signs of very low blood sugar; can't keep fluids down.
- No outcome promises ("you'll lose X", "heal your tendon", "reverse aging"). Use "studied for", "approved for", "evidence is limited to animals".
- Under 18: excluded.
- Pregnancy, trying to conceive, or breastfeeding: tell the prescriber; most peptides have no safety data, and GLP-1 labels advise stopping ahead of a planned pregnancy. Tirzepatide can reduce oral birth control reliability.
- Competitive athletes: many peptides are banned at all times by WADA (BPC-157 under S0; TB-500, CJC-1295, ipamorelin, tesamorelin, sermorelin, AOD-9604 under S2; MOTS-c under S4). Point to Global DRO or their anti-doping body.
- Never interpret lab results or side effects as a diagnosis. Do not suggest stopping or changing any medication; that is the prescriber's call.
- Eating disorder history or very low body weight: no weight-focused supports. Suggest a clinician.
- Self-harm or low mood (GLP-1 labels say to watch for suicidal thoughts): US 988, UK Samaritans 116 123.

## Sources
- https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks
- https://www.orrick.com/en/Insights/2026/04/FDA-Announces-Removal-of-12-Peptides-from-Category-2-and-Schedules-PCAC-Meetings
- https://www.frierlevitt.com/articles/fda-peptides-do-not-compound-list-update-2026/
- https://abcnews.com/Health/fda-advisers-narrowly-vote-add-6-peptides-drug/story?id=135064915
- https://www.ajmc.com/view/fda-panel-backs-6-peptides-for-compounding
- https://www.healio.com/news/primary-care/20260724/fda-committee-recommends-looser-restrictions-for-several-peptides
- https://www.reedsmith.com/de/perspectives/2024/10/fda-certain-peptide-bulk-drug-substances-category-2-503a-bulks-pcac
- https://projectbiohacking.beehiiv.com/p/cjc-1295-ipamorelin-pcac-vote-503a-status
- https://www.wada-ama.org/en/prohibited-list
- https://www.fda.gov/drugs/postmarket-drug-safety-information-patients-and-providers/fdas-concerns-unapproved-glp-1-drugs-used-weight-loss
- https://www.orrick.com/en/Insights/2026/05/FDA-Moves-to-Shut-the-Door-on-Large-Scale-Compounding-of-GLP1-Drugs
- https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215256s011lbl.pdf
- https://www.biospace.com/fda/novos-wegovy-pill-wins-obesity-approval-securing-lead-in-oral-glp-1-race
- https://www.healio.com/news/endocrinology/20260401/fda-approves-orforglipron-an-oral-glp1-for-adults-with-obesity
- https://doi.org/10.1056/NEJMoa2032183
- https://doi.org/10.1056/NEJMoa2206038
- https://www.tctmd.com/news/eye-condition-very-rare-side-effect-semaglutide-ema-says
- https://www.gov.uk/government/news/mhra-updates-guidance-for-semaglutide-prescribers-and-patients
- https://www.hcplive.com/view/retatrutide-meets-phase-3-weight-loss-endpoints-in-2-obesity-trials
- https://www.healio.com/news/endocrinology/20260814/eli-lilly-files-lawsuits-against-six-companies-for-allegedly-selling-retatrutide
- https://www.afslaw.com/perspectives/alerts/ruo-ined-five-peptide-vendors-learn-research-use-only-not-legal-strategy
- https://jmir.org/2024/1/e65440
- https://pubmed.ncbi.nlm.nih.gov/40756949/
- https://doi.org/10.1210/jc.2005-1536
- https://doi.org/10.1016/j.cmet.2015.02.009
- https://doi.org/10.3390/ijms19071987
- https://theratech.gcs-web.com/news-releases/news-release-details/theratechnologies-receives-fda-approval-egrifta-wrtm-tesamorelin
- https://www.fda.gov/news-events/press-announcements/fda-approves-new-treatment-hypoactive-sexual-desire-disorder-premenopausal-women
- https://www.fda.gov/news-events/press-announcements/fda-grants-accelerated-approval-first-treatment-barth-syndrome
- https://pubmed.ncbi.nlm.nih.gov/40450457/
- https://medlineplus.gov/ency/patientinstructions/000430.htm
- https://www.fda.gov/medical-devices/safely-using-sharps-needles-and-syringes-home-work-and-travel/best-way-get-rid-used-needles-and-other-sharps

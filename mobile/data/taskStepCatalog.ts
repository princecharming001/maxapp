export type TaskProduct = { label: string; url: string };
export type TaskStep   = { instruction: string; tip?: string };
export type TaskDetail = { steps: TaskStep[]; products?: TaskProduct[] };

export function getTaskDetail(catalogId?: string): TaskDetail | null {
    if (!catalogId) return null;
    return TASK_STEP_CATALOG[catalogId] ?? null;
}

export const TASK_STEP_CATALOG: Record<string, TaskDetail> = {

    // ─── SKINMAX ──────────────────────────────────────────────────────────────

    'skin.am_routine': {
        steps: [
            { instruction: 'Rinse your face with lukewarm water, or use a gentle cleanser if you wore SPF or sweat overnight.' },
            { instruction: 'Apply your vitamin C serum and let it absorb for 30 seconds.', tip: 'A pea-sized amount is enough for your whole face. Less is more.' },
            { instruction: 'Apply moisturizer while your skin is still slightly damp — it locks in hydration.' },
            { instruction: 'Finish with SPF 30+ all over your face and neck. This is the highest-leverage step in any skincare routine.', tip: 'Reapply every 2 hours if you\'re outdoors.' },
        ],
        products: [
            { label: 'CeraVe Hydrating Cleanser',    url: 'https://www.amazon.com/dp/B01N7T7JKJ' },
            { label: 'EltaMD UV Clear SPF 46',        url: 'https://www.amazon.com/dp/B002MSN3QQ' },
            { label: 'CeraVe Moisturizing Cream',     url: 'https://www.amazon.com/dp/B00TTD9BRC' },
        ],
    },

    'skin.pm_routine': {
        steps: [
            { instruction: 'Use a gentle cleanser to remove SPF, oil, and pollution from the day. If you wore makeup, double-cleanse with a cleansing balm first.' },
            { instruction: 'Pat skin dry, then wait 60 seconds before applying any actives.', tip: 'Applying to dry skin reduces irritation from retinoids and acids.' },
            { instruction: 'Apply your targeted treatment (retinol, niacinamide, peptides, etc.) and wait 30 seconds to absorb.' },
            { instruction: 'Seal everything with a slightly richer moisturizer than your AM routine — night is when skin repairs.' },
        ],
        products: [
            { label: 'CeraVe Hydrating Cleanser', url: 'https://www.amazon.com/dp/B01N7T7JKJ' },
            { label: 'La Roche-Posay Effaclar',   url: 'https://www.amazon.com/dp/B00NQV1K3A' },
        ],
    },

    'skin.spf': {
        steps: [
            { instruction: 'Apply SPF to your face, ears, and neck — the three zones that age fastest.' },
            { instruction: 'Use roughly a quarter-teaspoon (two finger-lengths) to get the protection the bottle advertises.', tip: 'Most people under-apply SPF by 70%, cutting stated protection in half.' },
            { instruction: 'Allow 2–3 minutes to dry before going outside or applying makeup.' },
        ],
        products: [
            { label: 'EltaMD UV Clear SPF 46',          url: 'https://www.amazon.com/dp/B002MSN3QQ' },
            { label: 'La Roche-Posay Anthelios SPF 60', url: 'https://www.amazon.com/dp/B07B3RN6QS' },
        ],
    },

    'skin.facial_massage': {
        steps: [
            { instruction: 'Apply a facial oil or serum so the tool glides without pulling on your skin.' },
            { instruction: 'Start at your neck, using upward strokes 3–5 times per section to encourage lymph drainage.' },
            { instruction: 'Move to your jaw: scrape outward along the jawline, then up toward the ears. Repeat 5× per side.' },
            { instruction: 'Finish along your cheekbones and forehead, always moving upward and outward.', tip: 'Keep your gua sha in the fridge — the cold amplifies the depuffing effect.' },
        ],
        products: [
            { label: 'Mount Lai Gua Sha Tool', url: 'https://www.amazon.com/dp/B07RD2TRPD' },
        ],
    },

    'skin.weekly_exfoliation': {
        steps: [
            { instruction: 'Cleanse your face first and pat dry completely — acids work best on clean, dry skin.' },
            { instruction: 'Apply a thin layer of your chemical exfoliant (AHA, BHA, or PHA) to your face, avoiding eyes and lips.' },
            { instruction: 'Leave on for the time specified on the product (usually 5–10 minutes). Do not scrub.', tip: 'Start with once a week and build up. Over-exfoliation causes more damage than under-exfoliation.' },
            { instruction: 'Rinse thoroughly with water, then apply moisturizer immediately. Always use SPF the next morning.' },
        ],
        products: [
            { label: 'Paula\'s Choice 2% BHA Exfoliant', url: 'https://www.amazon.com/dp/B00949CTQQ' },
        ],
    },

    'skin.pillowcase_change': {
        steps: [
            { instruction: 'Swap your pillowcase for a fresh one. Oils, sweat, and product buildup accumulate quickly.' },
            { instruction: 'If you don\'t have a spare, flip it to the clean side — buys you a few more days.', tip: 'Satin or silk pillowcases cause less friction, reducing creases and hair breakage overnight.' },
        ],
        products: [
            { label: 'Bedsure Satin Pillowcase',      url: 'https://www.amazon.com/dp/B07CSQXZZ5' },
            { label: 'Blissy Silk Pillowcase (Queen)', url: 'https://www.amazon.com/dp/B07KRTG97V' },
        ],
    },

    'skin.hydration_water': {
        steps: [
            { instruction: 'Fill a large water bottle (at least 750ml) first thing in the morning and drink half before breakfast.' },
            { instruction: 'Refill and keep it visible at your desk or wherever you spend most of your day.', tip: 'If water tastes boring, add a slice of lemon or cucumber — you\'ll drink significantly more.' },
            { instruction: 'Check the color of your urine: pale yellow means well-hydrated. Anything darker, drink more.' },
        ],
    },

    'skin.diet_anti_inflammatory': {
        steps: [
            { instruction: 'Replace one processed or high-sugar meal today with a whole-food option: eggs, fish, leafy greens, berries, or nuts.' },
            { instruction: 'Cook with extra-virgin olive oil instead of seed oils (canola, sunflower, vegetable).', tip: 'Omega-6 heavy seed oils spike inflammation markers. Olive oil, avocado oil, and butter are better alternatives.' },
            { instruction: 'Eat at least one serving of fatty fish, walnuts, or flaxseed this week for omega-3s — the most studied anti-inflammatory nutrient.' },
        ],
    },

    'skin.zinc_supp': {
        steps: [
            { instruction: 'Take your zinc supplement with food — it can cause nausea on an empty stomach.' },
            { instruction: 'If your supplement includes collagen, take it at any meal. Most collagen peptides are tasteless and mix into any drink.', tip: 'Zinc and collagen work synergistically. Zinc regulates sebum; collagen supports skin structure.' },
        ],
        products: [
            { label: 'Garden of Life Zinc 30mg',          url: 'https://www.amazon.com/dp/B07L9HHQP3' },
            { label: 'Vital Proteins Collagen Peptides', url: 'https://www.amazon.com/dp/B0171F9X5J' },
        ],
    },

    'skin.progress_photo': {
        steps: [
            { instruction: 'Go to the same spot with the same lighting you used last time. Natural morning light facing a window is ideal.' },
            { instruction: 'Take a straight-on shot and a 3/4 angle from both sides. Consistent angles let you see actual changes.', tip: 'Tie your hair back and keep a neutral expression to isolate skin changes.' },
            { instruction: 'Save the photos and compare with last week\'s. Small weekly changes add up to dramatic results over months.' },
        ],
    },

    // ─── HAIRMAX ──────────────────────────────────────────────────────────────

    'hair.shampoo_wash': {
        steps: [
            { instruction: 'Wet hair thoroughly with warm (not hot) water. Hot water strips the scalp\'s natural oils.' },
            { instruction: 'Apply a quarter-sized amount of shampoo to your scalp — not the lengths. The scalp is what needs cleaning.' },
            { instruction: 'Massage your scalp with your fingertips (not nails) for 60 seconds using small circular motions.', tip: 'This massage also stimulates blood flow to hair follicles — a real benefit, not just habit.' },
            { instruction: 'Rinse fully. Apply conditioner to mid-lengths and ends only, leave 1–2 minutes, then rinse.' },
        ],
        products: [
            { label: 'Nizoral Anti-Dandruff Shampoo',   url: 'https://www.amazon.com/dp/B00AINMFAC' },
            { label: 'Pura d\'Or Original Gold Label',  url: 'https://www.amazon.com/dp/B00BKNFLQ4' },
        ],
    },

    'hair.ketoconazole_wash': {
        steps: [
            { instruction: 'Wet hair thoroughly with warm water.' },
            { instruction: 'Apply a coin-sized amount of ketoconazole shampoo directly to your scalp.' },
            { instruction: 'Massage in for 60 seconds, then let it sit for 3–5 minutes before rinsing.', tip: 'Only 2–3× per week — daily use is counterproductive and dries the scalp.' },
            { instruction: 'Rinse fully. Apply a conditioner to your lengths only (not scalp) to prevent dryness.' },
        ],
        products: [
            { label: 'Nizoral A-D Anti-Dandruff Shampoo', url: 'https://www.amazon.com/dp/B00AINMFAC' },
        ],
    },

    'hair.scalp_massage': {
        steps: [
            { instruction: 'With dry or slightly damp hair, use your fingertips to apply gentle but firm pressure to your scalp.' },
            { instruction: 'Work in sections: start at the back of your head, then sides, then top. Use small circular motions for 60 seconds per zone.' },
            { instruction: 'You can also use a scalp massager tool — it reaches more follicles than fingertips alone.', tip: 'Research shows 4 minutes daily over 24 weeks leads to measurable increases in hair thickness.' },
        ],
        products: [
            { label: 'HEETA Scalp Massager', url: 'https://www.amazon.com/dp/B07FSTF5HC' },
        ],
    },

    'hair.minoxidil_am': {
        steps: [
            { instruction: 'Ensure your hair and scalp are completely dry — minoxidil absorbs poorly into wet hair.' },
            { instruction: 'Apply 1ml (the full dropper or the prescribed pump dose) directly to the thinning areas of your scalp, not to your hair.' },
            { instruction: 'Spread with your fingertips and gently massage in. Wash your hands immediately after.', tip: 'Consistency is everything. Skipping 2+ days in a row can cause a temporary shed as follicles re-adjust.' },
            { instruction: 'Wait at least 4 hours before washing your hair. Ideally, apply in the morning and wash in the evening.' },
        ],
        products: [
            { label: 'Kirkland Minoxidil 5% (6-month)', url: 'https://www.amazon.com/dp/B01LPYIJL8' },
        ],
    },

    'hair.minoxidil_pm': {
        steps: [
            { instruction: 'Apply minoxidil to a dry scalp at least 30 minutes before you sleep — it stains pillowcases if applied immediately before bed.' },
            { instruction: 'Use 1ml to the thinning areas. Spread and massage gently with fingertips.' },
            { instruction: 'Wash your hands immediately after application.', tip: 'If you miss a PM dose, don\'t double-dose in the morning — just resume your regular schedule.' },
        ],
        products: [
            { label: 'Kirkland Minoxidil 5% (6-month)', url: 'https://www.amazon.com/dp/B01LPYIJL8' },
        ],
    },

    'hair.microneedle_pm': {
        steps: [
            { instruction: 'Ensure your scalp is clean and dry. Use the dermaroller only on clean skin to avoid introducing bacteria.' },
            { instruction: 'Divide your scalp into sections. Roll horizontally, vertically, and diagonally over each thinning area 4–5 times with light pressure.', tip: 'Use a 0.5–0.75mm needle size for the scalp. Anything longer requires medical guidance.' },
            { instruction: 'Apply minoxidil directly after microneedling while the microchannels are open — absorption increases by up to 4×.' },
            { instruction: 'Let the scalp rest for 48–72 hours before microneedling again. Once or twice a week is optimal.' },
        ],
        products: [
            { label: 'Derma Roller 0.5mm for Scalp', url: 'https://www.amazon.com/dp/B0055OD5M2' },
            { label: 'Kirkland Minoxidil 5%',         url: 'https://www.amazon.com/dp/B01LPYIJL8' },
        ],
    },

    'hair.finasteride_reminder': {
        steps: [
            { instruction: 'Take your finasteride at the same time each day — consistency matters more than timing.' },
            { instruction: 'You can take it with or without food. If you experience nausea, take it with a meal.', tip: 'Results take 3–6 months to show and can take 12 months to fully evaluate. Don\'t stop too early.' },
        ],
    },

    'hair.leavein': {
        steps: [
            { instruction: 'Apply your leave-in conditioner to damp hair after washing, not soaking wet hair.' },
            { instruction: 'Focus on the mid-lengths and ends — the areas most prone to breakage and dryness. Avoid the scalp.', tip: 'Apply when hair is 60–70% dry for best absorption without weighing it down.' },
            { instruction: 'Scrunch in or comb through with a wide-tooth comb. Air dry or blow dry on low heat.' },
        ],
        products: [
            { label: 'It\'s a 10 Miracle Leave-In Product', url: 'https://www.amazon.com/dp/B000BVIWWC' },
        ],
    },

    'hair.heat_protect': {
        steps: [
            { instruction: 'Apply heat protectant to damp or towel-dried hair before any hot tool use.' },
            { instruction: 'Distribute evenly from mid-lengths to ends. Don\'t skip the back sections.', tip: 'Most heat damage is invisible for months before it shows up as breakage. Prevention is always easier than repair.' },
            { instruction: 'Allow the protectant to dry partially before using your hot tool. Using it while hair is dripping reduces effectiveness.' },
        ],
        products: [
            { label: 'CHI 44 Iron Guard Thermal Protectant', url: 'https://www.amazon.com/dp/B003LNXJKK' },
        ],
    },

    'hair.beard_trim': {
        steps: [
            { instruction: 'Start with a clean, dry beard — wet hair looks longer and you\'ll over-trim.' },
            { instruction: 'Set your clipper to your desired guard length and trim the bulk evenly, going against the grain.' },
            { instruction: 'Switch to no-guard or scissors for your neckline: the neckline should sit two finger-widths above your Adam\'s apple.', tip: 'A clean neckline is the single biggest upgrade most people overlook in beard grooming.' },
            { instruction: 'Define your cheek line — either natural or carved slightly lower for a sharper look. Apply beard oil to finish.' },
        ],
        products: [
            { label: 'Wahl Stainless Steel Clipper Kit', url: 'https://www.amazon.com/dp/B003JM5S4S' },
            { label: 'Honest Amish Classic Beard Oil',   url: 'https://www.amazon.com/dp/B00M3RCZF8' },
        ],
    },

    'hair.deep_condition': {
        steps: [
            { instruction: 'After shampooing, squeeze out excess water and apply a generous amount of deep conditioning mask from roots to ends.' },
            { instruction: 'Comb through with a wide-tooth comb to ensure even distribution, then twist or clip your hair up.' },
            { instruction: 'Leave on for 15–30 minutes. Applying heat (a warm towel or shower cap) dramatically increases penetration.', tip: 'The goal is to temporarily fill gaps in the hair shaft — think of it as a weekly repair session.' },
            { instruction: 'Rinse with cool water to seal the cuticle and maximize shine.' },
        ],
        products: [
            { label: 'Briogeo Don\'t Despair, Repair! Mask', url: 'https://www.amazon.com/dp/B01N7L4H3L' },
        ],
    },

    'hair.progress_photo': {
        steps: [
            { instruction: 'Stand under consistent lighting in the same spot each time. Overhead lighting in a bathroom works well.' },
            { instruction: 'Take a top-down photo, a front shot, and both side profiles with hair in its natural resting state.', tip: 'The top-down photo is the most diagnostic — hairline and crown changes are clearest from above.' },
            { instruction: 'Compare with last month\'s photos. Hair growth is slow — monthly comparisons show real change better than weekly.' },
        ],
    },

    // ─── FITMAX ───────────────────────────────────────────────────────────────

    'fit.workout_session': {
        steps: [
            { instruction: 'Spend 5 minutes on a dynamic warm-up: arm circles, leg swings, hip rotations, and light cardio to raise your heart rate.' },
            { instruction: 'Complete your planned workout. Follow progressive overload: add small amounts of weight or reps each week.' },
            { instruction: 'Hit protein within 30–60 minutes post-workout — muscle protein synthesis peaks in this window.', tip: 'The best workout is the one you actually do. Consistency beats intensity every time.' },
            { instruction: 'Log your weights and reps. Progress compounds — a training log turns months into visible data.' },
        ],
        products: [
            { label: 'Optimum Nutrition Gold Standard Whey', url: 'https://www.amazon.com/dp/B000QSNYGI' },
        ],
    },

    'fit.mobility_warmup': {
        steps: [
            { instruction: 'Start with 90/90 hip stretches: sit on the floor with both knees at 90°, alternate leaning forward over each knee for 30 seconds per side.' },
            { instruction: 'Add thoracic rotations: hands behind your head, rotate your upper spine left and right 10× per side.' },
            { instruction: 'Finish with leg swings: hold a wall, swing each leg forward and back 10 times, then across the body 10 times.', tip: 'Mobility warm-ups before lifting reduce injury risk and improve your range of motion over time.' },
        ],
    },

    'fit.daily_steps': {
        steps: [
            { instruction: 'Check your step count from yesterday. If you\'re below target, identify one gap in the day you can fill with a walk.' },
            { instruction: 'Built-in wins: take stairs over elevators, park further away, walk during phone calls, and take a 10-minute walk after meals.', tip: 'Post-meal walks also improve blood sugar regulation — 10 minutes after eating is the most effective window.' },
            { instruction: 'Set a movement reminder if needed. Most step goals are achieved through accumulation, not dedicated walks.' },
        ],
    },

    'fit.cardio_liss': {
        steps: [
            { instruction: 'Choose your LISS modality: incline walk, cycling, rowing, elliptical, or swimming. The "best" one is the one you\'ll do consistently.' },
            { instruction: 'Maintain Zone 2 intensity: you should be able to hold a conversation, but your breathing should be elevated. Target 120–140 bpm.', tip: 'Zone 2 cardio improves mitochondrial density — the foundation of all athletic performance and longevity.' },
            { instruction: 'Hold this intensity for 30–60 minutes. No need to sprint. Slow and steady is the mechanism here.' },
        ],
    },

    'fit.am_nutrition': {
        steps: [
            { instruction: 'Eat within 1–2 hours of waking. Delaying breakfast past 3 hours increases cortisol and can impair muscle retention.' },
            { instruction: 'Lead with protein: eggs, Greek yogurt, cottage cheese, or a protein shake. Target 30–40g to blunt hunger and kickstart muscle protein synthesis.', tip: 'A high-protein breakfast reduces total daily calorie intake by ~400 calories on average — without any other effort.' },
            { instruction: 'Add whole carbs and healthy fat to balance: oats, fruit, avocado, or nuts.' },
        ],
    },

    'fit.protein_check': {
        steps: [
            { instruction: 'Calculate your protein for the day: target 0.7–1g per pound of bodyweight (1.6–2.2g/kg) for muscle building or maintenance.' },
            { instruction: 'Count what you\'ve had so far. If you\'re behind, plan a high-protein meal or supplement to close the gap.', tip: 'Spreading protein across 3–4 meals (25–40g each) is more effective for muscle protein synthesis than one large dose.' },
            { instruction: 'If needed, use a protein shake to hit your target — the source doesn\'t matter as much as the total.' },
        ],
        products: [
            { label: 'Optimum Nutrition Gold Standard Whey', url: 'https://www.amazon.com/dp/B000QSNYGI' },
            { label: 'Orgain Organic Plant-Based Protein',   url: 'https://www.amazon.com/dp/B00JEKYNZA' },
        ],
    },

    'fit.creatine': {
        steps: [
            { instruction: 'Mix 5g of creatine monohydrate into any liquid — it\'s tasteless and dissolves easily in water, juice, or a shake.' },
            { instruction: 'Timing doesn\'t matter much: pre-workout, post-workout, or any time of day works. What matters is taking it daily.', tip: 'Creatine is one of the most studied sports supplements in history. No loading phase needed — just 5g/day consistently.' },
        ],
        products: [
            { label: 'NOW Sports Creatine Monohydrate', url: 'https://www.amazon.com/dp/B0019LRY8A' },
        ],
    },

    'fit.hydration_check': {
        steps: [
            { instruction: 'Check your water intake since waking up. You should be at roughly half your daily goal by noon.' },
            { instruction: 'Your daily target: bodyweight in pounds ÷ 2 = ounces of water. (E.g., 180 lbs → 90 oz / ~2.6L).', tip: 'Add 16–20 oz per hour of exercise. Sweat loss is higher than most people assume.' },
            { instruction: 'If you\'re behind, drink 16 oz now and set a reminder for another glass in 90 minutes.' },
        ],
    },

    'fit.stretch_pm': {
        steps: [
            { instruction: 'Start with a hip flexor stretch: step one foot forward into a lunge, lower your back knee to the floor, and lean forward. Hold 60 seconds per side.' },
            { instruction: 'Add a seated hamstring stretch: sit with legs extended, reach toward your toes and hold for 60 seconds.' },
            { instruction: 'Finish with a thoracic extension over a foam roller or rolled-up towel for 2 minutes.', tip: 'PM stretching after muscles are warm from the day is more effective than AM stretching. This is the best time to build real flexibility.' },
        ],
        products: [
            { label: 'TriggerPoint GRID Foam Roller', url: 'https://www.amazon.com/dp/B0040EGNIU' },
        ],
    },

    'fit.sleep_cue': {
        steps: [
            { instruction: 'Set a wind-down alarm 45 minutes before your target sleep time. When it goes off, stop screens.' },
            { instruction: 'Dim lights in your space. Light below 50 lux (bedside lamp level) supports melatonin production.', tip: 'The hour before sleep is as important as the sleep itself. Treat it as a transition, not a cutoff.' },
            { instruction: 'Do a non-stimulating activity: read, stretch, journal, or meditate. This cues your brain that sleep is coming.' },
        ],
    },

    'fit.weekly_weighin': {
        steps: [
            { instruction: 'Weigh yourself first thing in the morning, after using the bathroom and before eating or drinking. This is the most consistent baseline.' },
            { instruction: 'Record the number without judgment. Weight fluctuates 2–5 lbs daily due to water, food, and hormones — single readings are noise.', tip: 'Look at 7-day rolling averages, not individual weigh-ins. Weekly trends are the only signal that matters.' },
            { instruction: 'Log it alongside your training notes. Bodyweight combined with strength metrics tells a much clearer story than weight alone.' },
        ],
    },

    'fit.monthly_photo': {
        steps: [
            { instruction: 'Same protocol every month: same spot, same lighting, same time of day. Consistency makes changes visible.' },
            { instruction: 'Take a front, side, and back photo in the same clothing (or no shirt) with the same pose.' },
            { instruction: 'Compare with last month side-by-side. Monthly changes are often too subtle to notice without direct comparison.', tip: 'Physique changes happen slowly — most people underestimate their progress because they see themselves every day.' },
        ],
    },

    // ─── HEIGHTMAX ────────────────────────────────────────────────────────────

    'height.am_mobility': {
        steps: [
            { instruction: 'Start with cat-cow stretches: get on all fours, arch your back up (cat) and then let it sag down (cow). Do 10 slow cycles.' },
            { instruction: 'Move to a child\'s pose: kneel, sit back on your heels, reach arms forward and hold for 60 seconds to decompress the lumbar spine.' },
            { instruction: 'Finish with standing thoracic rotations: feet shoulder-width apart, rotate your upper body left and right 10× per side.', tip: 'You lose 1–2cm of height overnight as spinal discs compress. This routine helps re-hydrate them in the morning.' },
        ],
    },

    'height.desk_reset_midday': {
        steps: [
            { instruction: 'Stand up from your desk. Roll your shoulders back and down, then draw your chin back (not down) until you feel a gentle stretch at the base of your skull.' },
            { instruction: 'Place your back against a wall. Heels, calves, glutes, upper back, and the back of your head should all touch the wall. Hold 30 seconds.' },
            { instruction: 'Set your chair or monitor height so your screen is at eye level and your elbows form a 90° angle. Slouching is partly environmental.', tip: 'Every 45–60 minutes at a desk causes measurable spinal compression. A midday reset counteracts this.' },
        ],
    },

    'height.pm_decompression': {
        steps: [
            { instruction: 'Lie on your back on a firm surface (yoga mat or floor). Draw both knees to your chest and rock gently side to side for 60 seconds.' },
            { instruction: 'Extend one leg, keep the other knee to your chest and gently press the knee further in. Hold 30 seconds per side.' },
            { instruction: 'Finish with legs extended, arms wide, focusing on a long, relaxed exhale to release spinal tension.', tip: 'Spinal discs re-expand during sleep — PM decompression accelerates this and can improve posture measurably over months.' },
        ],
    },

    'height.dead_hang': {
        steps: [
            { instruction: 'Grip an overhead bar with hands shoulder-width apart, palms facing away. Use a step if needed — jumping to grab creates unsafe torque.' },
            { instruction: 'Let your body hang completely relaxed. Allow gravity to create traction through your entire spine. Breathe deeply.', tip: 'Engage your shoulder blades down and back slightly — this protects the rotator cuff during longer hangs.' },
            { instruction: 'Start with 20–30 second holds and build to 60 seconds. 3–5 sets throughout the day is the protocol most used in research.' },
        ],
    },

    'height.wall_posture': {
        steps: [
            { instruction: 'Stand with your back flat against a wall. Your heels, calves, glutes, upper back, and the back of your head should all contact the wall.' },
            { instruction: 'Tuck your chin back (not down) and feel the back of your neck lengthen. Hold this position for 60–120 seconds.', tip: 'This position is your anatomically "tall" posture. Practice it until it becomes your default standing stance.' },
            { instruction: 'Walk away from the wall and try to maintain the same height and alignment for the next 5 minutes. Muscle memory builds with repetition.' },
        ],
    },

    'height.chin_tucks': {
        steps: [
            { instruction: 'Sit or stand tall. Without tilting your head down, draw your chin straight back — as if making a double chin.' },
            { instruction: 'You should feel a stretch at the base of your skull and the back of your neck. Hold 5 seconds, release. Repeat 10 times.', tip: 'This counteracts forward head posture — one of the most common causes of lost height. 1 inch of forward head = 10 lbs of extra load on the spine.' },
            { instruction: 'Do 2–3 sets, 3× per day. Can be done anywhere: at your desk, in the car, watching TV.' },
        ],
    },

    'height.face_pulls': {
        steps: [
            { instruction: 'Attach a rope handle to a cable machine or resistance band at face height. Grip both ends of the rope with palms facing in.' },
            { instruction: 'Pull the rope toward your face, leading with your elbows. At the end of the movement, spread the rope apart so your hands move past your ears.', tip: 'Face pulls are the single best exercise for shoulder health and counteracting the forward-rounded posture that hunching creates.' },
            { instruction: 'Control the return slowly. Do 3 sets of 15–20 reps with light weight — this is a corrective exercise, not a strength move.' },
        ],
        products: [
            { label: 'Fit Simplify Resistance Loop Bands', url: 'https://www.amazon.com/dp/B01AVDVHTI' },
        ],
    },

    'height.glute_bridge': {
        steps: [
            { instruction: 'Lie on your back, knees bent, feet flat on the floor hip-width apart. Arms at your sides.' },
            { instruction: 'Push through your heels and lift your hips until your body forms a straight line from shoulders to knees. Squeeze your glutes at the top.', tip: 'Weak glutes are the primary driver of anterior pelvic tilt — the most common posture issue that literally makes you shorter by 1–2 inches.' },
            { instruction: 'Hold 2 seconds at the top, lower slowly. Do 3 sets of 15–20 reps. Can be done with no equipment anywhere.' },
        ],
    },

    'height.sunlight_am': {
        steps: [
            { instruction: 'Go outside within 30 minutes of waking. Even on cloudy days, outdoor light is 10–50× brighter than indoor light.' },
            { instruction: 'Get at least 5–10 minutes of direct (or near-direct) sunlight on your skin and eyes (no sunglasses for this brief window).', tip: 'AM sunlight sets your circadian anchor — it determines when melatonin rises at night. This is the most evidence-backed thing you can do for sleep quality.' },
            { instruction: 'Pair it with a short walk. The combination of morning light + movement is one of the most powerful free performance tools available.' },
        ],
    },

    'height.protein_check': {
        steps: [
            { instruction: 'Check your protein intake for the day. For height and posture goals, adequate protein supports the muscle tissue that holds your spine upright.' },
            { instruction: 'Target at least 0.7g per pound of bodyweight. If you\'re short on protein, add a shake, eggs, Greek yogurt, or chicken.', tip: 'Collagen protein (found in bone broth or collagen peptides) is especially beneficial for connective tissue, ligaments, and cartilage.' },
        ],
        products: [
            { label: 'Vital Proteins Collagen Peptides', url: 'https://www.amazon.com/dp/B0171F9X5J' },
        ],
    },

    'height.sleep_extend': {
        steps: [
            { instruction: 'Set an earlier bedtime target — even 30 minutes earlier than usual. Sleep is when your spine fully decompresses and growth hormone is released.' },
            { instruction: 'Avoid screens for 30–45 minutes before bed. Dim overhead lights and switch to warm lamps.', tip: 'Growth hormone peaks in the first 90-minute deep sleep cycle — going to bed earlier maximizes this cycle\'s depth, not just its length.' },
            { instruction: 'Aim for a cool room (65–68°F / 18–20°C). Temperature is one of the most underrated sleep quality variables.' },
        ],
    },

    // ─── BONEMAX ──────────────────────────────────────────────────────────────

    'bone.mewing_am': {
        steps: [
            { instruction: 'Close your mouth naturally and bring your back teeth into light contact (not clenched). Lips should be sealed.' },
            { instruction: 'Place the entire body of your tongue flat on the roof of your mouth — not just the tip. Your tongue should fill the entire palate.', tip: 'The seal comes from suction, not muscle force. It should feel effortless after a few weeks of practice.' },
            { instruction: 'Breathe through your nose. Maintain this position as your default resting state whenever you\'re not speaking or eating.' },
        ],
    },

    'bone.mewing_midday': {
        steps: [
            { instruction: 'Check your current tongue posture. Is your tongue resting on the roof of your mouth, or has it dropped down?' },
            { instruction: 'Reset: close your lips, bring teeth into light contact, and re-engage full tongue-to-palate contact.' },
            { instruction: 'Breathe through your nose and hold for as long as comfortable. Use this midday check as a habit anchor (e.g., every time you get a notification).', tip: 'Tongue posture is corrected through frequency, not duration of single sessions. Many short check-ins beat rare long holds.' },
        ],
    },

    'bone.mewing_night': {
        steps: [
            { instruction: 'Before sleep, consciously set your tongue posture: full tongue on palate, lips sealed, teeth in light contact or slightly apart.' },
            { instruction: 'This is your last posture cue before sleep — the hours of resting tongue position during sleep compound over years.', tip: 'Nasal breathing during sleep is tightly linked to proper tongue posture. If you wake with a dry mouth, you\'re mouth-breathing.' },
            { instruction: 'Sleep on your back or side. Stomach sleeping rotates the neck and compresses the jaw asymmetrically.' },
        ],
    },

    'bone.masseter': {
        steps: [
            { instruction: 'Warm up with 10 slow jaw circles — open wide, rotate left and right. This prevents cramping.' },
            { instruction: 'Use a jaw trainer or mastic gum: chew slowly and deliberately, engaging both sides equally. Focus on controlled reps rather than speed.', tip: 'Unilateral chewing over time creates facial asymmetry. Always consciously work both sides equally.' },
            { instruction: 'Do 3 sets of 20–30 chews. Rest between sets. Your masseters are a muscle — train them like one, with progressive resistance.' },
        ],
        products: [
            { label: 'Jawliner 3.0 Jaw Trainer',    url: 'https://www.amazon.com/dp/B08KGCFLHM' },
            { label: 'Mastic Gum (Chios)',            url: 'https://www.amazon.com/dp/B07FWZT5GY' },
        ],
    },

    'bone.fascia_am': {
        steps: [
            { instruction: 'With clean hands, apply a facial oil or balm to your face to reduce friction.' },
            { instruction: 'Use your knuckles or a gua sha tool to apply gentle upward and outward pressure along your jawline, cheekbones, and forehead for 3–5 minutes.' },
            { instruction: 'Finish with gentle pressure at your brow bone and temples, holding for 5 seconds per spot.', tip: 'AM facial massage is primarily for lymphatic drainage and depuffing — overnight fluid accumulates in the face. Not a structural change, but compounds with other habits.' },
        ],
        products: [
            { label: 'Mount Lai Gua Sha Tool', url: 'https://www.amazon.com/dp/B07RD2TRPD' },
        ],
    },

    'bone.fascia_pm': {
        steps: [
            { instruction: 'Apply facial oil or serum to clean, dry skin.' },
            { instruction: 'Work the temporalis muscle (temples): press firmly with your fingertips in small circles for 60 seconds per side.', tip: 'The temporalis is often chronically tight in people who clench or grind — releasing it reduces jaw tension and facial puffiness.' },
            { instruction: 'Finish with slow pressure along the zygomatic arch (cheekbone) and the angle of your jaw. 3 minutes total.' },
        ],
    },

    'bone.nasal_check': {
        steps: [
            { instruction: 'Take a conscious breath right now. Are you breathing through your nose or your mouth?' },
            { instruction: 'If mouth-breathing, close your lips, place your tongue on your palate, and shift to nasal breathing.', tip: 'Nasal breathing produces nitric oxide, filters and humidifies air, and supports the structural development of the midface over time. Mouth-breathing does the opposite.' },
            { instruction: 'If nasal congestion is the barrier, try nasal strips at night. Salt-water rinses (neti pot) clear congestion better than most decongestants for chronic cases.' },
        ],
        products: [
            { label: 'Breathe Right Nasal Strips (Large)', url: 'https://www.amazon.com/dp/B001KY4JTI' },
        ],
    },

    'bone.neck_workout': {
        steps: [
            { instruction: 'Sit upright. Place your palm against your forehead and apply gentle resistance as you push your head forward. Hold 5 seconds, repeat 10×.' },
            { instruction: 'Repeat for the back of your head (extension), then each side (lateral flexion). This is an isometric neck workout — no equipment needed.', tip: 'Neck strength supports posture, improves head position, and over years can contribute to a more defined neck-jaw angle.' },
            { instruction: 'For weighted neck work (advanced), a neck harness with a 5–10 lb plate adds real stimulus. Start unweighted and progress slowly over weeks.' },
        ],
        products: [
            { label: 'Yes4All Neck Harness Weight Lifting', url: 'https://www.amazon.com/dp/B07B4Q9T4X' },
        ],
    },

    'bone.chin_tucks': {
        steps: [
            { instruction: 'Sit or stand with your spine tall. Look straight ahead.' },
            { instruction: 'Without tilting your head down, slide your chin straight back — as if you\'re trying to make a double chin. You\'ll feel a stretch at the base of your skull.' },
            { instruction: 'Hold 5 seconds, release. Do 10–15 reps. Aim for 2–3 sets, multiple times per day.', tip: 'Chin tucks are the most studied and proven exercise for reversing forward head posture. Every inch of forward head adds ~10 lbs of load on the cervical spine.' },
        ],
    },

    'bone.vitd_k2': {
        steps: [
            { instruction: 'Take your vitamin D3 and K2 supplements with a meal containing fat — both are fat-soluble and absorb significantly better with dietary fat.' },
            { instruction: 'Vitamin D3 dose: most people are deficient. 2,000–5,000 IU daily is a common maintenance range. K2 (MK-7 form): 100–200mcg daily.', tip: 'K2 is critical alongside D3 — it directs calcium into bones and teeth instead of arteries. Don\'t take high-dose D3 without K2.' },
        ],
        products: [
            { label: 'Sports Research Vitamin D3 + K2', url: 'https://www.amazon.com/dp/B01J2EUKGQ' },
        ],
    },

    'bone.magnesium_pm': {
        steps: [
            { instruction: 'Take magnesium glycinate or magnesium threonate 30–60 minutes before bed. These forms are the most bioavailable and least likely to cause digestive issues.', tip: 'Magnesium oxide (the cheap version) absorbs poorly. Glycinate or threonate is worth the price difference.' },
            { instruction: 'Dose: 200–400mg elemental magnesium is the standard range. Start lower if you\'re new to it.' },
            { instruction: 'Note any changes in sleep depth and quality over the first 2 weeks. Magnesium\'s sleep effects are often felt before its structural benefits.' },
        ],
        products: [
            { label: 'Doctor\'s Best High Absorption Magnesium', url: 'https://www.amazon.com/dp/B000BD0RT0' },
        ],
    },

    'bone.progress_photo': {
        steps: [
            { instruction: 'Take a front-facing photo in the same lighting, at the same distance, with a neutral expression.' },
            { instruction: 'Take a profile photo from both sides — structural changes often appear more clearly from the side.', tip: 'Use a consistent distance from the camera (e.g., 3 feet). Changes in facial structure are subtle — controlled comparisons make them visible.' },
            { instruction: 'Save and compare month over month, not week over week. Bone and soft tissue remodeling works on longer timescales.' },
        ],
    },

    // ─── SHARED ───────────────────────────────────────────────────────────────

    'progress_photo': {
        steps: [
            { instruction: 'Find the same spot with the same lighting you\'ve used before. Consistency in setup makes changes visible.' },
            { instruction: 'Take your standard angles: front, both profiles, and any specific angle relevant to your goal.', tip: 'Monthly comparisons reveal progress that\'s invisible week-to-week. The camera is more honest than the mirror.' },
            { instruction: 'Save and label with today\'s date. Archive them somewhere you won\'t accidentally delete them.' },
        ],
    },
};

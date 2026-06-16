/**
 * COLORINGMAX course content — the first creator course.
 *
 * Source: "Clay's Coloring Guide" (Coloring Max for brown/tan skin).
 * Authored by the creator "Clay". See ../courseContent.ts for the schema.
 *
 * Core framework (preserved verbatim in spirit): brighten, don't lighten —
 * make your natural coloring look cleaner, brighter, and more intentional
 * across skin, lips, eyes, teeth, hair, facial hair, and light. Never about
 * becoming lighter; always about raising the quality of the tone you have.
 *
 * NB: strings use double quotes throughout because the copy is full of
 * apostrophes/contractions — avoids escaping noise in 43 lessons of content.
 */
import type { CourseModule } from "../courseContent";

export const COLORINGMAX_COURSE: CourseModule = {
    maxxId: "coloringmax",
    title: "Coloring Max",
    subtitle: "Brighten, don't lighten. Make your natural coloring look intentional.",
    icon: "color-palette-outline",
    creator: {
        name: "Clay",
        handle: "clay",
        verified: true,
        tagline: "Coloring & contrast for brown/tan skin",
    },
    accent: "#BC7A3C",
    accentSoft: "rgba(188, 122, 60, 0.10)",
    accentMid: "rgba(188, 122, 60, 0.20)",
    caption: "9 chapters · 43 lessons · built for brown/tan skin",
    chapters: [
        /* ── Ch 1 ──────────────────────────────────────────────────── */
        {
            id: "mindset",
            number: 1,
            title: "The Coloring Mindset",
            subtitle: "Your face is color, not just bone. Start by changing the goal.",
            icon: "color-palette-outline",
            sections: [
                {
                    id: "color-not-bone",
                    number: "1.1",
                    title: "Color, Not Just Bone",
                    subtitle: "Looks aren't only structure. Your face also has color to maximize.",
                    icon: "sparkles-outline",
                    eta: "2 min",
                    bullets: [
                        "Bones set structure — coloring sets glow, health, and contrast",
                        "Skin, lips, eyes, teeth, hair, facial hair, and light all read as color",
                        "These pillars work together, not one at a time",
                        "Unlike bone, your coloring can change quickly",
                    ],
                    body:
                        "Your face is not just bones. There are also colors. A huge part of how " +
                        "attractive a face reads comes from its coloring — and unlike bone, you can " +
                        "move coloring quickly. This course maxes it on purpose.",
                },
                {
                    id: "seven-pillars",
                    number: "1.2",
                    title: "The Seven Pillars",
                    subtitle: "Seven levers control your coloring. Move them together for harmony.",
                    icon: "list-outline",
                    eta: "2 min",
                    bullets: [
                        "Skin tone — glow, evenness, complexion quality",
                        "Lips — rosy tone, a health signal, softness",
                        "Eyes — contrast, brightness, an 'alive' look",
                        "Teeth — white contrast with the eyes and skin",
                        "Hair — frame, color gradient, face harmony",
                        "Facial hair — structure, contrast, masculine framing",
                        "Sun & light — golden tone, photo appeal, angularity",
                    ],
                },
                {
                    id: "brighten-dont-lighten",
                    number: "1.3",
                    title: "Brighten, Don't Lighten",
                    subtitle: "The one rule. Don't chase lighter skin — chase cleaner, brighter skin.",
                    icon: "bulb-outline",
                    eta: "2 min",
                    bullets: [
                        "Lightening = covering or changing your real complexion",
                        "Brightening = enhancing the complexion you already have",
                        "Goal: even tone, less hyperpigmentation, a healthy glow",
                        "Never try to look paler than you are",
                    ],
                    body:
                        "Most brown/tan guys think the problem is that their skin is 'too dark.' It " +
                        "almost never is. The real problem is evenness, dullness, dark circles, beard " +
                        "shadow, or bad lighting — all fixable without touching your tone.",
                },
                {
                    id: "whats-actually-wrong",
                    number: "1.4",
                    title: "What's Actually Wrong",
                    subtitle: "The problem is rarely your tone. It's one of these seven fixables.",
                    icon: "search-outline",
                    eta: "2 min",
                    bullets: [
                        "Uneven skin tone or patchiness",
                        "Hyperpigmentation and dark spots",
                        "Dullness and tired-looking skin",
                        "Dark circles under the eyes",
                        "Beard shadow dulling the face",
                        "Bad lighting or a too-light product shade",
                    ],
                },
                {
                    id: "day-1-baseline",
                    number: "1.5",
                    title: "Day 1: Baseline Selfie",
                    subtitle: "Today's task: one natural-light selfie and four honest questions.",
                    icon: "camera-outline",
                    eta: "3 min",
                    bullets: [
                        "Take one selfie in natural light — no filters",
                        "Is my skin uneven, or actually 'too dark'?",
                        "Do I have dark circles or hyperpigmentation?",
                        "Is beard shadow making my face look dull?",
                        "Am I using any product that's too light for me?",
                    ],
                },
            ],
        },

        /* ── Ch 2 ──────────────────────────────────────────────────── */
        {
            id: "skin-baseline",
            number: 2,
            title: "Skin — The Baseline",
            subtitle: "Skin sets everything. Fix the canvas before the details.",
            icon: "sparkles-outline",
            sections: [
                {
                    id: "skin-is-canvas",
                    number: "2.1",
                    title: "Skin Is the Canvas",
                    subtitle: "If skin is dull, patchy, or uneven, every other feature looks worse.",
                    icon: "square-outline",
                    eta: "2 min",
                    bullets: [
                        "Skin tone and texture are the foundation of coloring",
                        "Dull or patchy skin drags down lips, eyes, and hair",
                        "Fix skin first — everything else gets easier",
                        "This is a quality game, not a color game",
                    ],
                },
                {
                    id: "bright-skin-targets",
                    number: "2.2",
                    title: "What Bright Skin Looks Like",
                    subtitle: "Six targets to aim for. None of them is 'lighter.'",
                    icon: "star-outline",
                    eta: "2 min",
                    bullets: [
                        "Bright skin",
                        "Even tone",
                        "Radiant texture",
                        "Healthy glow",
                        "Less under-eye darkness",
                        "Less hyperpigmentation",
                    ],
                },
                {
                    id: "centella-law",
                    number: "2.3",
                    title: "Centella — Brightening Law",
                    subtitle: "The core ingredient for evening and brightening brown/tan skin.",
                    icon: "leaf-outline",
                    eta: "2 min",
                    bullets: [
                        "Centella Asiatica evens and brightens skin tone",
                        "Treat it as your main brightening basic",
                        "Consistency beats intensity — use it daily",
                        "Build the rest of your routine around it",
                    ],
                    body:
                        "Centella (cica) is framed as your main 'skin brightening law' — it calms, " +
                        "evens, and brightens without bleaching anything. Get this one habit locked " +
                        "before chasing anything fancier.",
                },
                {
                    id: "other-brighteners",
                    number: "2.4",
                    title: "Other Brightening Options",
                    subtitle: "Test alternatives, keep what your skin actually responds to.",
                    icon: "flask-outline",
                    eta: "2 min",
                    bullets: [
                        "Vitamin C can boost brightness — test it against Centella",
                        "Keep whichever one your skin responds to",
                        "Alpha arbutin and glutathione are possible add-ons",
                        "These are extras, not the basics — don't overcomplicate",
                    ],
                },
                {
                    id: "skin-baseline-7day",
                    number: "2.5",
                    title: "The 7-Day Skin Baseline",
                    subtitle: "Score skin quality every morning for a week. Judge quality, not color.",
                    icon: "stats-chart-outline",
                    eta: "3 min",
                    bullets: [
                        "Each morning rate 1–5: skin evenness",
                        "Rate 1–5: glow",
                        "Rate 1–5: dark circles",
                        "Rate 1–5: hyperpigmentation",
                        "Rate 1–5: overall coloring",
                        "Rule: never judge your skin color — only skin quality",
                    ],
                },
            ],
        },

        /* ── Ch 3 ──────────────────────────────────────────────────── */
        {
            id: "light-golden",
            number: 3,
            title: "Light — Golden Coloring",
            subtitle: "For brown/tan skin the sun isn't the enemy. Uneven and burnt are.",
            icon: "sunny-outline",
            sections: [
                {
                    id: "sun-not-enemy",
                    number: "3.1",
                    title: "The Sun Isn't the Enemy",
                    subtitle: "The issue was never being darker. It's being uneven, dull, or burnt.",
                    icon: "partly-sunny-outline",
                    eta: "2 min",
                    bullets: [
                        "For brown/tan skin, sun isn't automatically bad",
                        "Darker is not the problem",
                        "Uneven, dull, or burnt skin is the problem",
                        "Even your skin first, then use light to your advantage",
                    ],
                },
                {
                    id: "what-golden-light-does",
                    number: "3.2",
                    title: "What Golden Light Does",
                    subtitle: "Once skin is even, the right light upgrades the whole face.",
                    icon: "aperture-outline",
                    eta: "2 min",
                    bullets: [
                        "Golden tone and a caramelized glow",
                        "Better photos",
                        "Stronger angularity and facial harmony",
                        "A natural squint that sharpens the eyes",
                        "Blemishes look less obvious in warm light",
                    ],
                },
                {
                    id: "use-sun-strategically",
                    number: "3.3",
                    title: "Use Sun Strategically",
                    subtitle: "Strategic, not reckless. Protect the skin while you use the light.",
                    icon: "shield-checkmark-outline",
                    eta: "2 min",
                    bullets: [
                        "Avoid burning — always",
                        "Use SPF",
                        "Don't overdo exposure",
                        "Favor golden hour or soft sunlight for photos",
                        "Pair sun with brightening and skin-evening habits",
                    ],
                },
                {
                    id: "golden-hour-test",
                    number: "3.4",
                    title: "The Golden Hour Test",
                    subtitle: "Two photos, one comparison. Let the light prove the point.",
                    icon: "camera-outline",
                    eta: "2 min",
                    bullets: [
                        "Photo 1: indoor artificial light",
                        "Photo 2: outdoor soft sunlight or golden hour",
                        "Does skin look warmer?",
                        "Do blemishes look less obvious?",
                        "Does the face look more angular, with better eye/teeth contrast?",
                    ],
                },
            ],
        },

        /* ── Ch 4 ──────────────────────────────────────────────────── */
        {
            id: "lips",
            number: 4,
            title: "Lips",
            subtitle: "Lips add color. Dead, gray lips make the whole face look unwell.",
            icon: "happy-outline",
            sections: [
                {
                    id: "lips-health-signal",
                    number: "4.1",
                    title: "Lips Carry a Health Signal",
                    subtitle: "Dead, chapped, gray, or dull lips make the whole face read unhealthy.",
                    icon: "pulse-outline",
                    eta: "1 min",
                    bullets: [
                        "Lips are part of your facial coloring",
                        "Chapped or gray lips dull the whole face",
                        "Healthy lips quietly add color and life",
                        "Small effort here, visible payoff",
                    ],
                },
                {
                    id: "ideal-lip",
                    number: "4.2",
                    title: "The Ideal Lip",
                    subtitle: "Five traits to aim for — healthy, not chapped.",
                    icon: "checkmark-circle-outline",
                    eta: "1 min",
                    bullets: [
                        "Smooth",
                        "Full",
                        "Not chapped",
                        "Slightly rosy",
                        "Hydrated",
                    ],
                },
                {
                    id: "lip-protocol",
                    number: "4.3",
                    title: "The Lip Protocol",
                    subtitle: "A 30-second routine to revive dull lips. Gentle is the whole point.",
                    icon: "list-outline",
                    eta: "2 min",
                    bullets: [
                        "Take a towel, paper towel, or cloth",
                        "Gently rub lips to remove dead skin",
                        "Do not rub hard",
                        "Apply tinted lip balm",
                        "Reapply whenever lips feel dry",
                    ],
                },
                {
                    id: "daily-lip-task",
                    number: "4.4",
                    title: "Your Daily Lip Task",
                    subtitle: "Morning adds color, night repairs. Build a subtle rosy tone.",
                    icon: "time-outline",
                    eta: "1 min",
                    bullets: [
                        "Morning: gently exfoliate if needed",
                        "Morning: apply tinted lip balm",
                        "Night: apply a regular or hydrating balm",
                        "Goal: a subtle, healthy pink tone in the face",
                    ],
                },
            ],
        },

        /* ── Ch 5 ──────────────────────────────────────────────────── */
        {
            id: "eyes-teeth-contrast",
            number: 5,
            title: "Eyes, Teeth & Contrast",
            subtitle: "Eyes and teeth are your biggest contrast levers. Use them.",
            icon: "eye-outline",
            sections: [
                {
                    id: "eyes-drive-contrast",
                    number: "5.1",
                    title: "Eyes Drive Contrast",
                    subtitle: "Eyes are one of the biggest coloring and contrast levers you have.",
                    icon: "eye-outline",
                    eta: "2 min",
                    bullets: [
                        "Bright eyes make the whole face look alive",
                        "Contrast between eyes and skin reads as health",
                        "Tired, dull eyes flatten the whole face",
                        "Less under-eye darkness instantly lifts the face",
                    ],
                },
                {
                    id: "white-eyes-teeth",
                    number: "5.2",
                    title: "White Eyes + White Teeth",
                    subtitle: "Clean sclera and clean teeth are a strong, instant health signal.",
                    icon: "happy-outline",
                    eta: "1 min",
                    bullets: [
                        "White eyes + white teeth = strong health signal",
                        "It makes the rest of the face look cleaner",
                        "Brighter, clearer eyes amplify the signal",
                        "Keep teeth clean and bright for the contrast",
                    ],
                },
                {
                    id: "eye-goals",
                    number: "5.3",
                    title: "Eye Goals",
                    subtitle: "Four targets for the eye area. Brightness and contrast over everything.",
                    icon: "star-outline",
                    eta: "1 min",
                    bullets: [
                        "Clear eyes",
                        "Bright sclera",
                        "Less tired under-eye area",
                        "Better contrast between eyes and skin",
                    ],
                },
                {
                    id: "contacts-brown-skin",
                    number: "5.4",
                    title: "Contacts for Brown Skin",
                    subtitle: "If you go colored, stay natural. The right shades add contrast quietly.",
                    icon: "aperture-outline",
                    eta: "2 min",
                    bullets: [
                        "Darker green — natural contrast on brown skin",
                        "Brown — safe, blends with your palette",
                        "Light brown — a subtle lift in contrast",
                        "Pick natural shades that don't look uncanny",
                    ],
                },
                {
                    id: "contact-safety",
                    number: "5.5",
                    title: "Contact Safety",
                    subtitle: "Treat contacts seriously — or skip them.",
                    icon: "shield-checkmark-outline",
                    eta: "1 min",
                    bullets: [
                        "Use proper contact hygiene",
                        "Do not sleep in them",
                        "Do not share them",
                        "Ideally get a proper fitting or prescription",
                    ],
                },
                {
                    id: "eye-contrast-check",
                    number: "5.6",
                    title: "Eye Contrast Check",
                    subtitle: "Four questions to score your eyes, contrast, and teeth together.",
                    icon: "help-circle-outline",
                    eta: "2 min",
                    bullets: [
                        "Are my eyes bright or tired?",
                        "Are dark circles hurting my contrast?",
                        "Would natural brown, light brown, or green contacts help?",
                        "Do my teeth and eyes both look clean and bright?",
                    ],
                },
            ],
        },

        /* ── Ch 6 ──────────────────────────────────────────────────── */
        {
            id: "hair-gradient",
            number: 6,
            title: "Hair — The Brown Gradient",
            subtitle: "Hair frames the face and sets contrast against your skin.",
            icon: "cut-outline",
            sections: [
                {
                    id: "hair-frames-face",
                    number: "6.1",
                    title: "Hair Frames the Face",
                    subtitle: "Hair creates contrast against your skin — it's part of your coloring.",
                    icon: "cut-outline",
                    eta: "1 min",
                    bullets: [
                        "Hair frames and shapes the whole face",
                        "It sets contrast against your skin tone",
                        "Both color and shape matter",
                        "Treat hair as a coloring lever, not an afterthought",
                    ],
                },
                {
                    id: "complement-dont-clash",
                    number: "6.2",
                    title: "Complement, Don't Clash",
                    subtitle: "Brown/tan skin looks best when hair color completes the palette.",
                    icon: "color-palette-outline",
                    eta: "1 min",
                    bullets: [
                        "Brown/tan skin looks best with a complementary hair color",
                        "Random bright or blonde highlights clash",
                        "Aim for harmony across skin, eyes, and hair",
                        "Subtle variation beats loud contrast",
                    ],
                },
                {
                    id: "mocha-highlights",
                    number: "6.3",
                    title: "Mocha Brown Highlights",
                    subtitle: "The brown gradient: connect brown skin, brown eyes, and brown hair.",
                    icon: "sparkles-outline",
                    eta: "2 min",
                    bullets: [
                        "Mocha brown highlights create a brown gradient",
                        "They connect brown skin, eyes, and hair",
                        "More harmonious than random bright highlights",
                        "Adds color variation without clashing",
                    ],
                },
                {
                    id: "shape-and-layers",
                    number: "6.4",
                    title: "Shape & Layers",
                    subtitle: "Wavy or straight hair? Grow it out and layer it for shape.",
                    icon: "options-outline",
                    eta: "2 min",
                    bullets: [
                        "If wavy or moderately straight, grow it out if you can",
                        "Get it layered",
                        "Layers add shape, volume, and definition",
                        "Long hair without layers can look messy",
                    ],
                },
                {
                    id: "hair-audit",
                    number: "6.5",
                    title: "Your Hair Audit",
                    subtitle: "Four questions on whether your hair is helping or hurting.",
                    icon: "help-circle-outline",
                    eta: "1 min",
                    bullets: [
                        "Is my hair helping frame my face?",
                        "Does my hair look flat or layered?",
                        "Would mocha brown highlights fit my skin and eyes?",
                        "Does my hair color create harmony or clash?",
                    ],
                },
            ],
        },

        /* ── Ch 7 ──────────────────────────────────────────────────── */
        {
            id: "facial-hair-brows",
            number: 7,
            title: "Facial Hair & Brows",
            subtitle: "Facial hair can sharpen contrast — or ruin it. Make it intentional.",
            icon: "man-outline",
            sections: [
                {
                    id: "intentional-not-random",
                    number: "7.1",
                    title: "Intentional, Not Random",
                    subtitle: "Facial hair either improves contrast or dulls the whole face.",
                    icon: "man-outline",
                    eta: "1 min",
                    bullets: [
                        "Facial hair can improve or ruin your coloring",
                        "There's no one-size-fits-all look",
                        "The right choice depends on your face",
                        "Random, messy growth almost always hurts",
                    ],
                },
                {
                    id: "pick-your-look",
                    number: "7.2",
                    title: "Pick Your Look",
                    subtitle: "Four options. The best one depends on your face — test honestly.",
                    icon: "options-outline",
                    eta: "1 min",
                    bullets: [
                        "Clean shaven",
                        "Light stubble",
                        "Goatee and mustache",
                        "Full beard",
                        "Softer features often gain from a controlled goatee + mustache",
                    ],
                    body:
                        "A controlled goatee and mustache can add contrast, structure, masculine " +
                        "framing, and definition — especially for softer faces. There's no universal " +
                        "answer; the right look is the one that sharpens your specific face.",
                },
                {
                    id: "goatee-mustache-rules",
                    number: "7.3",
                    title: "Goatee & Mustache Rules",
                    subtitle: "Geometry matters. Shape it clean or it reads messy.",
                    icon: "cut-outline",
                    eta: "2 min",
                    bullets: [
                        "Trim the bulk off the top",
                        "Don't let the mustache cross over the lip",
                        "Shape the goatee into a triangle",
                        "Shape the mustache area into a clean trapezoid",
                        "Avoid messy beard shadow if it dulls the face",
                    ],
                },
                {
                    id: "brows-that-fit",
                    number: "7.4",
                    title: "Brows That Fit",
                    subtitle: "Brows frame the eyes. Tidy and face-fitting, not overdone.",
                    icon: "eye-outline",
                    eta: "1 min",
                    bullets: [
                        "Trimmed",
                        "Tamed",
                        "Face-fitting",
                        "Not overdone",
                    ],
                },
                {
                    id: "facial-hair-test",
                    number: "7.5",
                    title: "The 2-Week Facial Hair Test",
                    subtitle: "Try four looks, 3 days each. Rate them on five traits.",
                    icon: "calendar-outline",
                    eta: "3 min",
                    bullets: [
                        "Clean cheeks — 3 days",
                        "Light stubble — 3 days",
                        "Goatee + mustache — 3 days",
                        "Full beard or heavier stubble — 3 days",
                        "Rate each: contrast, cleanliness, masculinity, harmony, photo appeal",
                    ],
                },
            ],
        },

        /* ── Ch 8 ──────────────────────────────────────────────────── */
        {
            id: "fourteen-day-plan",
            number: 8,
            title: "The 14-Day Plan",
            subtitle: "Two weeks, four phases: baseline, skin, grooming, contrast.",
            icon: "calendar-outline",
            sections: [
                {
                    id: "days-1-3-baseline",
                    number: "8.1",
                    title: "Days 1–3: Baseline",
                    subtitle: "Measure before you change anything. Photos and honest scores.",
                    icon: "camera-outline",
                    eta: "2 min",
                    bullets: [
                        "Take natural-light selfies",
                        "Score skin, lips, eyes, hair, and facial hair",
                        "Stop using products that are too light",
                        "Spot dark circles, hyperpigmentation, beard shadow, dullness",
                    ],
                },
                {
                    id: "days-4-7-skin-lips",
                    number: "8.2",
                    title: "Days 4–7: Skin & Lips",
                    subtitle: "Start the brightening basics and revive your lips.",
                    icon: "sparkles-outline",
                    eta: "2 min",
                    bullets: [
                        "Start your brightening routine",
                        "Use Centella or vitamin C",
                        "Exfoliate lips gently",
                        "Use tinted lip balm",
                        "Track glow and evenness",
                    ],
                },
                {
                    id: "days-8-10-grooming",
                    number: "8.3",
                    title: "Days 8–10: Grooming",
                    subtitle: "Clean up facial hair and brows. Kill the dulling shadow.",
                    icon: "cut-outline",
                    eta: "2 min",
                    bullets: [
                        "Clean up the cheeks",
                        "Test stubble vs goatee + mustache",
                        "Trim brows lightly",
                        "Remove messy facial hair that creates shadow",
                    ],
                },
                {
                    id: "days-11-14-contrast",
                    number: "8.4",
                    title: "Days 11–14: Light & Contrast",
                    subtitle: "Bring in light, eyes, teeth, and hair harmony.",
                    icon: "sunny-outline",
                    eta: "2 min",
                    bullets: [
                        "Test golden-hour lighting",
                        "Check eye and teeth contrast",
                        "Consider natural contact colors",
                        "Audit hair shape and possible mocha brown highlights",
                    ],
                },
            ],
        },

        /* ── Ch 9 ──────────────────────────────────────────────────── */
        {
            id: "track-and-score",
            number: 9,
            title: "Track & Score",
            subtitle: "Make it a habit, then measure it. Daily checks, weekly score.",
            icon: "checkbox-outline",
            sections: [
                {
                    id: "morning-checklist",
                    number: "9.1",
                    title: "Morning Checklist",
                    subtitle: "Six quick checks to run before you leave the house.",
                    icon: "sunny-outline",
                    eta: "1 min",
                    bullets: [
                        "Skin routine completed",
                        "Lips moisturized / tinted",
                        "Facial hair checked",
                        "Hair styled and framed",
                        "SPF applied if going outside",
                        "Natural-light selfie if tracking",
                    ],
                },
                {
                    id: "night-checklist",
                    number: "9.2",
                    title: "Night Checklist",
                    subtitle: "Five checks to repair tonight and set up tomorrow.",
                    icon: "moon-outline",
                    eta: "1 min",
                    bullets: [
                        "Skin cleaned",
                        "Brightening product applied if part of your routine",
                        "Lips hydrated",
                        "Facial hair / brows checked for next day",
                        "Progress score logged",
                    ],
                },
                {
                    id: "weekly-coloring-score",
                    number: "9.3",
                    title: "The Weekly Coloring Score",
                    subtitle: "Score eight categories 1–5 each week. Watch the trend, not one day.",
                    icon: "stats-chart-outline",
                    eta: "2 min",
                    bullets: [
                        "Skin evenness",
                        "Skin glow",
                        "Lip color",
                        "Eye brightness",
                        "Teeth / eye contrast",
                        "Hair harmony",
                        "Facial hair contrast",
                        "Overall coloring",
                    ],
                },
                {
                    id: "read-your-score",
                    number: "9.4",
                    title: "Read Your Score",
                    subtitle: "Add it up. Four bands tell you where your coloring stands.",
                    icon: "speedometer-outline",
                    eta: "1 min",
                    bullets: [
                        "0–15: needs the basics",
                        "16–25: improving",
                        "26–35: strong coloring foundation",
                        "36–40: high-level coloring max",
                    ],
                },
                {
                    id: "coloring-max-summary",
                    number: "9.5",
                    title: "The Coloring Max Summary",
                    subtitle: "It was never about lighter skin. It's about an intentional palette.",
                    icon: "ribbon-outline",
                    eta: "2 min",
                    bullets: [
                        "Not lighter skin — brighter skin and even tone",
                        "Better glow, rosier lips, whiter eyes and teeth",
                        "Better hair contrast and clean facial hair",
                        "Golden / caramel lighting that flatters you",
                        "A harmonious brown gradient across the whole face",
                    ],
                    body:
                        "Coloring Max is about making your natural palette look intentional. For " +
                        "brown/tan users the goal is never to be lighter — it's to be brighter, more " +
                        "even, and more harmonious. Keep the tone you have. Raise its quality.",
                },
            ],
        },
    ],
};

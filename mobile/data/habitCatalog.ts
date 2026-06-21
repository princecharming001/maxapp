/**
 * Habit catalog for the onboarding "Choose daily habits" picker.
 *
 * Each habit `id` is a REAL scheduler catalog id — it matches the
 * `task_catalog` ids in backend/data/maxes/<id>.md verbatim (e.g.
 * `skin.retinoid_pm`, `fit.creatine`). That is the whole point: when the user
 * marks a habit "want" or "skip", we send these ids to the backend, which
 * matches them against `catalog_id` during deterministic schedule generation
 * (see schedule_runtime habit-prefs handling). So this list must stay in sync
 * with the per-max docs — only curated, user-meaningful daily habits are shown
 * (workout split variants collapse to a single "Lift session"; medical /
 * checkpoint items live under "Tracking").
 *
 * `area` is a short focus-area label used to (optionally) group chips within a
 * max. The picker filters this catalog by the user's chosen maxes.
 */

export type Habit = {
    /** Scheduler catalog id (matches data/maxes/<id>.md task_catalog). */
    id: string;
    /** Short chip label. */
    label: string;
    /** Focus area within the max (for grouping / scanning). */
    area: string;
};

export const HABIT_CATALOG: Record<string, Habit[]> = {
    skinmax: [
        { id: 'skin.am_routine', label: 'Morning skincare', area: 'Routine' },
        { id: 'skin.pm_routine', label: 'Evening skincare', area: 'Routine' },
        { id: 'skin.spf', label: 'SPF every morning', area: 'Protection' },
        { id: 'skin.facial_massage', label: 'Facial massage', area: 'Care' },
        { id: 'skin.weekly_exfoliation', label: 'Weekly exfoliation', area: 'Care' },
        { id: 'skin.pillowcase_change', label: 'Fresh pillowcase', area: 'Care' },
        { id: 'skin.hydration_water', label: 'Drink more water', area: 'Lifestyle' },
        { id: 'skin.diet_anti_inflammatory', label: 'Eat cleaner', area: 'Lifestyle' },
        { id: 'skin.zinc_supp', label: 'Take skin supplements', area: 'Supplements' },
        { id: 'skin.progress_photo', label: 'Progress photo', area: 'Tracking' },
    ],
    hairmax: [
        { id: 'hair.shampoo_wash', label: 'Wash + condition', area: 'Wash' },
        { id: 'hair.ketoconazole_wash', label: 'Ketoconazole wash', area: 'Wash' },
        { id: 'hair.scalp_massage', label: 'Scalp massage', area: 'Scalp' },
        { id: 'hair.minoxidil_am', label: 'Minoxidil (AM)', area: 'Regrowth' },
        { id: 'hair.minoxidil_pm', label: 'Minoxidil (PM)', area: 'Regrowth' },
        { id: 'hair.microneedle_pm', label: 'Microneedle scalp', area: 'Regrowth' },
        { id: 'hair.finasteride_reminder', label: 'Take finasteride', area: 'Regrowth' },
        { id: 'hair.leavein', label: 'Leave-in conditioner', area: 'Styling' },
        { id: 'hair.heat_protect', label: 'Heat protectant', area: 'Styling' },
        { id: 'hair.beard_trim', label: 'Trim beard / neckline', area: 'Grooming' },
        { id: 'hair.deep_condition', label: 'Deep-condition mask', area: 'Care' },
        { id: 'hair.progress_photo', label: 'Progress photo', area: 'Tracking' },
    ],
    fitmax: [
        { id: 'fit.workout_session', label: 'Lift session', area: 'Training' },
        { id: 'fit.mobility_warmup', label: 'Mobility warm-up', area: 'Training' },
        { id: 'fit.daily_steps', label: 'Hit step target', area: 'Conditioning' },
        { id: 'fit.cardio_liss', label: 'Easy cardio', area: 'Conditioning' },
        { id: 'fit.am_nutrition', label: 'AM protein meal', area: 'Nutrition' },
        { id: 'fit.protein_check', label: 'Hit protein target', area: 'Nutrition' },
        { id: 'fit.creatine', label: 'Take creatine', area: 'Supplements' },
        { id: 'fit.hydration_check', label: 'Hydration check', area: 'Recovery' },
        { id: 'fit.stretch_pm', label: 'PM stretch', area: 'Recovery' },
        { id: 'fit.sleep_cue', label: 'Wind down for bed', area: 'Recovery' },
        { id: 'fit.weekly_weighin', label: 'Weekly weigh-in', area: 'Tracking' },
        { id: 'fit.monthly_photo', label: 'Progress photo', area: 'Tracking' },
    ],
    heightmax: [
        { id: 'height.am_mobility', label: 'AM mobility', area: 'Mobility' },
        { id: 'height.desk_reset_midday', label: 'Desk reset', area: 'Mobility' },
        { id: 'height.pm_decompression', label: 'PM decompression', area: 'Decompression' },
        { id: 'height.dead_hang', label: 'Dead hang', area: 'Decompression' },
        { id: 'height.wall_posture', label: 'Wall posture drill', area: 'Posture' },
        { id: 'height.chin_tucks', label: 'Chin tucks', area: 'Posture' },
        { id: 'height.face_pulls', label: 'Face pulls', area: 'Strength' },
        { id: 'height.glute_bridge', label: 'Glute bridge', area: 'Strength' },
        { id: 'height.sunlight_am', label: 'Morning sunlight', area: 'Growth' },
        { id: 'height.protein_check', label: 'Hit protein', area: 'Growth' },
        { id: 'height.sleep_extend', label: 'Protect sleep', area: 'Growth' },
        { id: 'height.progress_photo', label: 'Progress photo', area: 'Tracking' },
    ],
    bonemax: [
        { id: 'bone.mewing_am', label: 'Mewing (AM)', area: 'Mewing' },
        { id: 'bone.mewing_midday', label: 'Mewing reset', area: 'Mewing' },
        { id: 'bone.mewing_night', label: 'Mewing (night)', area: 'Mewing' },
        { id: 'bone.masseter', label: 'Chew mastic gum', area: 'Jaw' },
        { id: 'bone.fascia_am', label: 'Facial massage (AM)', area: 'Fascia' },
        { id: 'bone.fascia_pm', label: 'Fascia release (PM)', area: 'Fascia' },
        { id: 'bone.nasal_check', label: 'Nasal breathing', area: 'Breathing' },
        { id: 'bone.neck_workout', label: 'Neck training', area: 'Neck' },
        { id: 'bone.chin_tucks', label: 'Chin tucks', area: 'Posture' },
        { id: 'bone.vitd_k2', label: 'D3 + K2', area: 'Supplements' },
        { id: 'bone.magnesium_pm', label: 'Magnesium (PM)', area: 'Supplements' },
        { id: 'bone.progress_photo', label: 'Progress photo', area: 'Tracking' },
    ],
    // Creator max — not selectable in the core onboarding goals, but kept here
    // so the same catalog can drive a habit picker anywhere it's unlocked.
    coloringmax: [
        { id: 'color.am_routine', label: 'Morning coloring routine', area: 'Routine' },
        { id: 'color.pm_routine', label: 'Evening coloring routine', area: 'Routine' },
        { id: 'color.spf_am', label: 'SPF every morning', area: 'Protection' },
        { id: 'color.lip_am', label: 'Lip tint (AM)', area: 'Color' },
        { id: 'color.golden_hour', label: 'Golden-hour light', area: 'Color' },
        { id: 'color.contrast_eyes_teeth', label: 'Eyes + teeth contrast', area: 'Color' },
        { id: 'color.weekly_exfoliation', label: 'Weekly exfoliation', area: 'Care' },
        { id: 'color.under_eye_care', label: 'Under-eye care', area: 'Care' },
        { id: 'color.brow_tidy', label: 'Tidy brows', area: 'Grooming' },
        { id: 'color.facial_hair_grooming', label: 'Shape facial hair', area: 'Grooming' },
        { id: 'color.weekly_score', label: 'Weekly coloring score', area: 'Tracking' },
        { id: 'color.progress_photo', label: 'Progress photo', area: 'Tracking' },
    ],
};

/** Every habit id known to the catalog — used to validate / filter prefs. */
export const ALL_HABIT_IDS: Set<string> = new Set(
    Object.values(HABIT_CATALOG).flatMap((list) => list.map((h) => h.id)),
);

export function habitsForMax(maxId: string): Habit[] {
    return HABIT_CATALOG[maxId] ?? [];
}

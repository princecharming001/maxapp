/**
 * List/detail labels for maxxes — normalizes stale API/RDS rows
 * (e.g. SkinMax, long skin descriptions) and surfaces a short curated
 * description per program.
 */

/**
 * The 7 AI-powered biohacking programs (the backend serves these ids from
 * GET /api/maxes and the marketplace). Intake + scheduling for each happens in
 * chat. Internal ids are stable; `label` is what the user sees — note
 * `trainmax` displays as "Fitmax" and `skinhairmax` as "Skin & Hair".
 */
export type BiohackProgram = {
    id: string;
    label: string;
    tagline: string;
    icon: string;
    color: string;
};

export const BIOHACK_PROGRAMS: BiohackProgram[] = [
    { id: 'sleepmax', label: 'Sleepmax', tagline: 'fall asleep faster, wake up rested', icon: 'moon-outline', color: '#5B6CD9' },
    { id: 'energymax', label: 'Energymax', tagline: 'steadier energy all day', icon: 'flash-outline', color: '#E0A21B' },
    { id: 'focusmax', label: 'Focusmax', tagline: 'longer stretches of deep work', icon: 'locate-outline', color: '#2F8F83' },
    { id: 'calmmax', label: 'Calmmax', tagline: 'calmer days, quicker resets', icon: 'leaf-outline', color: '#4F9D5D' },
    { id: 'trainmax', label: 'Fitmax', tagline: 'move more, recover better', icon: 'barbell-outline', color: '#D9534F' },
    { id: 'skinhairmax', label: 'Skin & Hair', tagline: 'simple daily care that adds up', icon: 'water-outline', color: '#C77DBA' },
    { id: 'longevitymax', label: 'Longevitymax', tagline: 'the habits that compound', icon: 'infinite-outline', color: '#7A5CC7' },
];

export const BIOHACK_PROGRAM_BY_ID: Record<string, BiohackProgram> = Object.fromEntries(
    BIOHACK_PROGRAMS.map((p) => [p.id, p]),
);

export function isBiohackProgramId(id: unknown): boolean {
    return Object.prototype.hasOwnProperty.call(BIOHACK_PROGRAM_BY_ID, String(id ?? '').toLowerCase().trim());
}

/**
 * Per-maxx display description — short, plain, ≤ 60 chars so it fits the
 * editorial hero. The legacy looks-program rows stay only so an old schedule
 * row (pre-migration) still renders something sensible.
 */
const MAXX_DESCRIPTIONS: Record<string, string> = {
    ...Object.fromEntries(BIOHACK_PROGRAMS.map((p) => [p.id, `${p.tagline}.`])),
    // Legacy (pre-biohacking) programs.
    skinmax:   'skin care for clarity and glow.',
    hairmax:   'hairline maintenance and scalp density.',
    fitmax:    'frame building and aesthetic leanness.',
    bonemax:   'facial structure and jawline.',
    heightmax: 'posture and perceived vertical.',
    coloringmax: 'brighten, dont lighten.',
};

/**
 * Lowercase the "m" in *Superpower product names (FitMax → Fitmax, HAIRMAX → HAIRmax).
 * Also handles "FitMax — …" style titles.
 */
export function normalizeMaxxNameSuffix(label: string): string {
    let s = String(label || '').trim();
    if (!s) return s;
    s = s.replace(/Max$/i, 'max');
    s = s.replace(/([A-Za-z0-9])Max(?=\s*[—\-–])/g, '$1max');
    return s;
}

/**
 * Drop a leading program name from a task title ("FitMax — Morning nutrition",
 * "FitMax, Morning nutrition" after the server's dash scrub, "Skinmax: SPF").
 * Every task surface already names the program beside the title, so the prefix
 * only reads as "Fitmax, whatever the task is". Server now strips it too; this
 * keeps rows persisted before that render clean without a refetch.
 */
export function stripMaxxTitlePrefix(title: string): string {
    const s = String(title || '');
    const out = s
        .replace(
            /^\s*(?:(?:skin|fit|hair|height|bone|coloring|sleep|energy|focus|calm|train|longevity|skinhair)\s*max+|skin\s*(?:&|and)\s*hair)\s*(?:—|–|-|:|,|\|)\s*/i,
            '',
        )
        .trim();
    return out || s;
}

export function getMaxxDisplayLabel(maxx: { id?: string; label?: string }): string {
    const id = String(maxx.id || '').toLowerCase().trim();
    const raw = String(maxx.label ?? maxx.id ?? '').trim();
    if (isBiohackProgramId(id)) return BIOHACK_PROGRAM_BY_ID[id].label;
    if (id === 'skinmax') return 'Skinmax';
    if (id === 'coloringmax') return 'Coloring Max';
    return normalizeMaxxNameSuffix(raw || id);
}

export function getMaxxDisplayDescription(
    maxx: { id?: string; description?: string },
): string | undefined {
    const id = String(maxx.id || '').toLowerCase().trim();
    return (Object.prototype.hasOwnProperty.call(MAXX_DESCRIPTIONS, id) ? MAXX_DESCRIPTIONS[id] : undefined) ?? maxx.description;
}

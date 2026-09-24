/**
 * Per-category notification preferences (Settings → Notifications).
 *
 * The server owns the category list: GET /notifications/category-prefs returns
 * { prefs: { <optional category>: bool } } and the screen renders whatever it
 * sends — known categories get a friendly label and a home in a group, an
 * unknown (newer-backend) category still renders, under a humanized label.
 * Essential task reminders are NOT in this list (the backend won't mute them;
 * the OS toggle is their off switch). Pure — unit-tested in
 * __tests__/notificationPrefs.test.ts.
 */

export type NotificationCategoryPrefs = Record<string, boolean>;

export const NOTIFICATION_CATEGORY_LABELS: Readonly<Record<string, string>> = {
    morning_preview: 'morning brief',
    evening_recap: 'evening wrap-up',
    missed_task: 'missed-task nudges',
    streak_protection: 'streak saver',
    streak_freeze: 'streak freeze used',
    streak_milestone: 'streak milestones',
    comeback: 'fresh-start mornings',
    journey_milestone: 'journey milestones',
    progress_photo: 'weekly progress photo',
    scan_ready: 'new scan unlocked',
    weekly_recap: 'weekly recap',
    milestone: 'achievements',
    reengagement: 'check-ins when you’re away',
    tip: 'tips',
    broadcast: 'news from max',
};

/** Display groups, in order. Anything the server sends that isn't listed lands in the last group. */
const GROUPS: { title: string; keys: string[] }[] = [
    { title: 'Your day', keys: ['morning_preview', 'evening_recap', 'missed_task'] },
    { title: 'Streaks', keys: ['streak_protection', 'streak_freeze', 'streak_milestone', 'comeback'] },
    { title: 'Progress', keys: ['journey_milestone', 'progress_photo', 'scan_ready', 'weekly_recap', 'milestone'] },
    { title: 'Everything else', keys: ['reengagement', 'tip', 'broadcast'] },
];

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Friendly label; an unknown category falls back to its key, humanized ("streak_last_call" → "streak last call"). */
export function categoryLabel(key: string): string {
    if (has(NOTIFICATION_CATEGORY_LABELS, key)) return NOTIFICATION_CATEGORY_LABELS[key];
    const human = String(key ?? '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    return human || 'other notifications';
}

/** Keep only boolean entries — a malformed response must never render a toggle with no real state. */
export function sanitizeCategoryPrefs(raw: unknown): NotificationCategoryPrefs {
    const out: NotificationCategoryPrefs = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (k && typeof v === 'boolean') out[k] = v;
    }
    return out;
}

export type CategoryPrefRow = { key: string; label: string; enabled: boolean };
export type CategoryPrefGroup = { title: string; rows: CategoryPrefRow[] };

/** Server prefs → labelled, grouped rows (known order first; unknown keys alphabetical in the last group; empty groups dropped). */
export function groupCategoryPrefs(prefs: NotificationCategoryPrefs): CategoryPrefGroup[] {
    const clean = sanitizeCategoryPrefs(prefs);
    const placed = new Set<string>();
    const groups: CategoryPrefGroup[] = GROUPS.map((g) => ({
        title: g.title,
        rows: g.keys
            .filter((k) => has(clean, k))
            .map((k) => {
                placed.add(k);
                return { key: k, label: categoryLabel(k), enabled: clean[k] };
            }),
    }));
    const extras = Object.keys(clean)
        .filter((k) => !placed.has(k))
        .sort()
        .map((k) => ({ key: k, label: categoryLabel(k), enabled: clean[k] }));
    groups[groups.length - 1].rows.push(...extras);
    return groups.filter((g) => g.rows.length > 0);
}

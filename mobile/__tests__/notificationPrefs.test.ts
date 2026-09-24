/**
 * Settings → Notifications category list (lib/notificationPrefs): the server
 * owns the categories, the app renders whatever comes back — friendly labels
 * for the known ones, a humanized fallback for anything newer.
 */
import assert from 'assert';
import {
    NOTIFICATION_CATEGORY_LABELS,
    categoryLabel,
    groupCategoryPrefs,
    sanitizeCategoryPrefs,
} from '../lib/notificationPrefs';

// What GET /notifications/category-prefs returns today (sorted optional categories).
const SERVER_PREFS = {
    broadcast: true,
    comeback: true,
    evening_recap: true,
    journey_milestone: true,
    milestone: true,
    missed_task: false,
    morning_preview: true,
    progress_photo: true,
    reengagement: true,
    scan_ready: true,
    streak_freeze: true,
    streak_milestone: true,
    streak_protection: true,
    tip: false,
    weekly_recap: true,
};

export const tests: Record<string, () => void | Promise<void>> = {
    'every category the server sends today has a friendly label': () => {
        for (const k of Object.keys(SERVER_PREFS)) {
            assert.ok(Object.prototype.hasOwnProperty.call(NOTIFICATION_CATEGORY_LABELS, k), k);
        }
        assert.strictEqual(categoryLabel('missed_task'), 'missed-task nudges');
        assert.strictEqual(categoryLabel('streak_protection'), 'streak saver');
        assert.strictEqual(categoryLabel('broadcast'), 'news from max');
        assert.strictEqual(categoryLabel('morning_preview'), 'morning brief');
        assert.strictEqual(categoryLabel('evening_recap'), 'evening wrap-up');
    },

    'unknown categories get a generic, humanized label (never blank, never a prototype key)': () => {
        assert.strictEqual(categoryLabel('streak_last_call'), 'streak last call');
        assert.strictEqual(categoryLabel('New-Thing'), 'new thing');
        assert.strictEqual(categoryLabel('___'), 'other notifications');
        assert.strictEqual(categoryLabel('constructor'), 'constructor');
        assert.strictEqual(categoryLabel('toString'), 'tostring');
    },

    'sanitize keeps only boolean entries': () => {
        assert.deepStrictEqual(sanitizeCategoryPrefs({ tip: false, broadcast: 'no', x: 1, y: null, ok: true }), {
            tip: false,
            ok: true,
        });
        assert.deepStrictEqual(sanitizeCategoryPrefs(null), {});
        assert.deepStrictEqual(sanitizeCategoryPrefs([true]), {});
        assert.deepStrictEqual(sanitizeCategoryPrefs('x'), {});
    },

    'grouping renders every server category exactly once, with its state': () => {
        const groups = groupCategoryPrefs(SERVER_PREFS);
        const rows = groups.flatMap((g) => g.rows);
        assert.strictEqual(rows.length, Object.keys(SERVER_PREFS).length);
        assert.strictEqual(new Set(rows.map((r) => r.key)).size, rows.length);
        assert.strictEqual(rows.find((r) => r.key === 'tip')?.enabled, false);
        assert.strictEqual(rows.find((r) => r.key === 'missed_task')?.enabled, false);
        assert.deepStrictEqual(groups.map((g) => g.title), ['Your day', 'Streaks', 'Progress', 'Everything else']);
        assert.deepStrictEqual(groups[0].rows.map((r) => r.key), ['morning_preview', 'evening_recap', 'missed_task']);
    },

    'unknown categories still render (last group, alphabetical); empty groups are dropped': () => {
        const groups = groupCategoryPrefs({ zeta_new: true, alpha_new: false, tip: true });
        assert.deepStrictEqual(groups.map((g) => g.title), ['Everything else']);
        assert.deepStrictEqual(groups[0].rows.map((r) => r.key), ['tip', 'alpha_new', 'zeta_new']);
        assert.strictEqual(groups[0].rows[1].label, 'alpha new');
        assert.deepStrictEqual(groupCategoryPrefs({}), []);
    },
};

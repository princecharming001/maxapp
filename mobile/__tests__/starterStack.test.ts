/**
 * First-stack preview (lib/starterStack).
 *
 * Pins: the level sets how many habits and how many minutes, every habit lands
 * inside the waking day and outside work (except break-sized ones), nothing
 * overlaps, two goals share the stack, and goals map onto the scheduler's
 * existing vocabulary (intensity, effort, program tokens).
 */
import assert from 'assert';
import {
    BIOHACK_LEVELS,
    LEVEL_TO_EFFORT,
    LEVEL_TO_INTENSITY,
    buildStarterStack,
    habitsForMinutes,
    levelForMinutes,
    priorityTokensFor,
    stackMinutes,
    type DayShape,
} from '../lib/starterStack';

const NINE_TO_FIVE: DayShape = {
    wakeMin: 7 * 60,
    getReadyMin: 7 * 60,
    windDownMin: 22 * 60 + 15,
    bedMin: 23 * 60,
    works: true,
    workStartMin: 9 * 60,
    workEndMin: 17 * 60,
    commuteMin: 30,
};

const NIGHT_OWL: DayShape = {
    wakeMin: 10 * 60,
    getReadyMin: 10 * 60 + 30,
    windDownMin: 0 * 60 + 30, // 12:30 AM
    bedMin: 1 * 60 + 30, // 1:30 AM
    works: false,
    workStartMin: 0,
    workEndMin: 0,
    commuteMin: 0,
};

const eve = (m: number) => (m < 4 * 60 ? m + 1440 : m);
const BREAK_OK = new Set(['caffeine_cutoff', 'movement_snack', 'breathing_reset', 'lunch_walk', 'strength_snack']);

function assertFits(day: DayShape, goals: string[], level: 'low' | 'medium' | 'high') {
    const items = buildStarterStack(goals, level, day);
    assert.ok(items.length > 0, `${goals} / ${level} should produce habits`);
    const sorted = [...items].map((i) => ({ ...i, t: eve(i.timeMin) })).sort((a, b) => a.t - b.t);
    for (const it of sorted) {
        assert.ok(it.t >= day.wakeMin, `${it.id} before wake`);
        assert.ok(it.t + it.minutes <= eve(day.bedMin), `${it.id} after bed`);
        if (day.works && !BREAK_OK.has(it.id)) {
            const inWork = it.t + it.minutes > day.workStartMin - day.commuteMin && it.t < day.workEndMin + day.commuteMin;
            assert.ok(!inWork, `${it.id} at ${it.t} lands inside work/commute`);
        }
    }
    for (let i = 1; i < sorted.length; i++) {
        assert.ok(sorted[i].t >= sorted[i - 1].t + sorted[i - 1].minutes, `${sorted[i].id} overlaps ${sorted[i - 1].id}`);
    }
    return items;
}

export const tests = {
    'the level sets the size of the stack': () => {
        for (const goals of [['energy'], ['sleep', 'focus'], ['training', 'longevity']]) {
            const low = buildStarterStack(goals, 'low', NINE_TO_FIVE);
            const med = buildStarterStack(goals, 'medium', NINE_TO_FIVE);
            const high = buildStarterStack(goals, 'high', NINE_TO_FIVE);
            const cap = (l: string) => BIOHACK_LEVELS.find((x) => x.id === l)!;
            assert.ok(low.length <= cap('low').habits);
            assert.ok(med.length <= cap('medium').habits);
            assert.ok(high.length <= cap('high').habits);
            assert.ok(low.length <= med.length && med.length <= high.length, `${goals}: ${low.length}/${med.length}/${high.length}`);
            assert.ok(stackMinutes(low) <= stackMinutes(high));
            // Budget (with headroom), except a single habit, which always fits.
            for (const [l, items] of [['low', low], ['medium', med], ['high', high]] as const) {
                if (items.length > 1) assert.ok(stackMinutes(items) <= cap(l).minutes * 1.25, `${goals} ${l} over budget`);
            }
        }
    },

    'every habit fits a 9-to-5 day: awake, outside work, no overlaps': () => {
        const goalSets = [['energy'], ['sleep'], ['focus'], ['stress'], ['training'], ['skin_hair'], ['longevity'], ['sleep', 'training'], ['focus', 'stress']];
        for (const goals of goalSets) for (const level of ['low', 'medium', 'high'] as const) assertFits(NINE_TO_FIVE, goals, level);
    },

    'a night owl with no job gets habits inside their own day': () => {
        for (const level of ['low', 'medium', 'high'] as const) {
            const items = assertFits(NIGHT_OWL, ['sleep', 'energy'], level);
            assert.ok(items.every((i) => i.timeMin >= 0 && i.timeMin < 1440), 'times wrap back to a clock time');
        }
    },

    'two goals share the stack': () => {
        const items = buildStarterStack(['sleep', 'training'], 'high', NINE_TO_FIVE);
        const ids = items.map((i) => i.id);
        assert.ok(ids.includes('dim_screens'), 'top sleep habit present');
        assert.ok(ids.includes('training_session') || ids.includes('mobility'), 'a training habit present');
        assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate habits across goals');
    },

    'no goals, or unknown goals, gives an empty stack': () => {
        assert.deepStrictEqual(buildStarterStack([], 'high', NINE_TO_FIVE), []);
        assert.deepStrictEqual(buildStarterStack(['skinmax'], 'high', NINE_TO_FIVE), []);
    },

    'a minutes budget from the slider sizes the stack continuously': () => {
        let prevCount = 0;
        for (const m of [5, 10, 15, 20, 25, 30, 40, 50, 60]) {
            const items = buildStarterStack(['sleep', 'training'], m, NINE_TO_FIVE);
            assert.ok(items.length >= 1 && items.length <= habitsForMinutes(m), `${m} min -> ${items.length}`);
            if (items.length > 1) assert.ok(stackMinutes(items) <= m * 1.25, `${m} min over budget`);
            assert.ok(items.length >= prevCount, 'more time never means fewer habits');
            prevCount = items.length;
        }
        assert.strictEqual(levelForMinutes(5), 'low');
        assert.strictEqual(levelForMinutes(15), 'low');
        assert.strictEqual(levelForMinutes(25), 'medium');
        assert.strictEqual(levelForMinutes(36), 'high');
        assert.strictEqual(habitsForMinutes(5), 1);
        assert.strictEqual(habitsForMinutes(60), 6);
    },

    'level and goals map onto the scheduler vocabulary': () => {
        assert.deepStrictEqual(LEVEL_TO_INTENSITY, { low: 'chill', medium: 'standard', high: 'sweatmode' });
        assert.deepStrictEqual(LEVEL_TO_EFFORT, { low: 'light', medium: 'steady', high: 'all_in' });
        assert.deepStrictEqual(priorityTokensFor(['training', 'skin_hair']), ['body', 'skin', 'hair']);
        assert.deepStrictEqual(priorityTokensFor(['sleep', 'focus']), []);
    },
};

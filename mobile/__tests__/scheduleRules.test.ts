/**
 * Plan rules on Home / Planner (BETA1 contract C1).
 *
 * Pins: rules ride on `day.rules`, are merged across schedules deduped by
 * catalog_id (earliest time wins), never become tasks (so never counted in
 * progress), and a stray `kind: "rule"` task is routed to the rules list.
 */
import assert from 'assert';
import { mergeSchedules, ruleDisplayLine } from '../utils/scheduleAggregation';

const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const day = '2026-10-18';
const schedules = [
    {
        id: 's-sleep', maxx_id: 'sleepmax',
        days: [{
            date: day,
            tasks: [{ task_id: 't1', time: '07:00', title: 'Morning light', status: 'pending', kind: 'action', duration_minutes: 10 }],
            rules: [{ title: 'No caffeine after', time: '16:15', catalog_id: 'caffeine_cutoff', maxx_id: 'sleepmax', note: 'decaf after this' }],
        }],
    },
    {
        id: 's-energy', maxx_id: 'energymax',
        days: [{
            date: day,
            tasks: [
                { task_id: 't2', time: '08:00', title: 'Bedroom setup', status: 'pending', kind: 'setup', duration_minutes: 20 },
                // An older payload that put a rule in tasks: must not become a habit.
                { task_id: 't3', time: '21:00', title: 'Screens off by', status: 'pending', kind: 'rule', catalog_id: 'screens_off' },
            ],
            rules: [{ title: 'No caffeine after', time: '14:00', catalog_id: 'caffeine_cutoff', maxx_id: 'energymax' }],
        }],
    },
];

export const tests = {
    'rules merge across schedules, deduped by catalog_id, earliest time wins': () => {
        const m = mergeSchedules(schedules, {}, {});
        const rules = m.rulesByDate[day];
        assert.strictEqual(rules.length, 2);
        assert.deepStrictEqual(rules.map((r) => [r.catalog_id, r.time]), [['caffeine_cutoff', '14:00'], ['screens_off', '21:00']]);
    },
    'rules are never tasks (not counted in progress)': () => {
        const m = mergeSchedules(schedules, {}, {});
        const ids = m.byDate[day].map((t) => t.task_id).sort();
        assert.deepStrictEqual(ids, ['t1', 't2']);
        assert.strictEqual(m.byDate[day].find((t) => t.task_id === 't2')?.kind, 'setup');
    },
    'rule display line reads as a sentence': () => {
        assert.strictEqual(ruleDisplayLine({ title: 'No caffeine after', time: '16:15' }, fmt), 'No caffeine after 4:15 PM');
        assert.strictEqual(ruleDisplayLine({ title: 'Fixed wake time', time: '07:00' }, fmt), 'Fixed wake time · 7:00 AM');
        assert.strictEqual(ruleDisplayLine({ title: 'No alcohol on weeknights', time: '' }, fmt), 'No alcohol on weeknights');
    },
    'a day with no rules has none': () => {
        const m = mergeSchedules([{ id: 'x', maxx_id: 'sleepmax', days: [{ date: day, tasks: [] }] }], {}, {});
        assert.strictEqual(m.rulesByDate[day], undefined);
    },
};

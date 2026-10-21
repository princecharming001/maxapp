/**
 * The person's own tasks (CustomTaskSheet + Home/Planner rows).
 *
 * Pins: the day presets and labels, the duration copy, the next-quarter-hour
 * default, that a custom row is recognized by its catalog id, and that the
 * merge labels it "Custom" next to the programs with its exact title and time.
 */
import assert from 'assert';
import {
    ALL_DAYS,
    customDaysLabel,
    defaultStartMinute,
    durationLabel,
    isCustomTaskRow,
    quickOf,
    sortDays,
} from '../components/tasks/customTaskModel';
import { mergeSchedules } from '../utils/scheduleAggregation';

const day = '2026-10-21';

export const tests = {
    'day presets are recognized exactly': () => {
        assert.strictEqual(quickOf([...ALL_DAYS]), 'all');
        assert.strictEqual(quickOf(['fri', 'mon', 'tue', 'wed', 'thu']), 'weekdays');
        assert.strictEqual(quickOf(['sun', 'sat']), 'weekends');
        assert.strictEqual(quickOf(['mon', 'wed', 'fri']), null);
        assert.strictEqual(quickOf([]), null);
    },
    'days label reads naturally and in week order': () => {
        assert.strictEqual(customDaysLabel([...ALL_DAYS]), 'Every day');
        assert.strictEqual(customDaysLabel(['fri', 'mon', 'wed']), 'Mon, Wed, Fri');
        assert.strictEqual(customDaysLabel(['sat', 'sun']), 'Weekends');
        assert.deepStrictEqual(sortDays(['sun', 'MON', 'wednesday', 'junk']), ['mon', 'wed', 'sun']);
    },
    'duration copy': () => {
        assert.strictEqual(durationLabel(5), '5 min');
        assert.strictEqual(durationLabel(60), '1 h');
        assert.strictEqual(durationLabel(90), '1 h 30 min');
        assert.strictEqual(durationLabel(120), '2 h');
    },
    'default time is the next quarter hour, wrapping at midnight': () => {
        const at = (h: number, m: number) => { const d = new Date(2026, 9, 21, h, m); return defaultStartMinute(d); };
        assert.strictEqual(at(9, 0), 9 * 60 + 15);
        assert.strictEqual(at(9, 7), 9 * 60 + 15);
        assert.strictEqual(at(9, 14), 9 * 60 + 15);
        assert.strictEqual(at(9, 15), 9 * 60 + 30);
        assert.strictEqual(at(23, 50), 0);
    },
    'a custom row is recognized only by its catalog id': () => {
        assert.strictEqual(isCustomTaskRow({ catalog_id: 'custom.ab12' }), true);
        assert.strictEqual(isCustomTaskRow({ catalog_id: 'sleepmax.morning_light' }), false);
        assert.strictEqual(isCustomTaskRow({ catalog_id: undefined }), false);
        assert.strictEqual(isCustomTaskRow(null), false);
    },
    'merged with programs: labelled Custom, exact title and time, sorted in': () => {
        const m = mergeSchedules([
            { id: 's1', maxx_id: 'sleepmax', days: [{ date: day, tasks: [
                { task_id: 'a', time: '07:10', title: 'Morning light', status: 'pending', catalog_id: 'sleepmax.morning_light' },
            ] }] },
            { id: 's2', maxx_id: 'custom', course_title: 'Your own tasks', days: [{ date: day, tasks: [
                { task_id: 'b', time: '06:00', title: 'Gym - push day', status: 'pending', catalog_id: 'custom.g1', duration_minutes: 60 },
                { task_id: 'c', time: '18:00', title: 'Sleepmax - my own thing', status: 'completed', catalog_id: 'custom.x1' },
            ] }] },
        ], {}, {});
        const rows = m.byDate[day];
        assert.deepStrictEqual(rows.map((r) => r.task_id), ['b', 'a', 'c']);
        const gym = rows.find((r) => r.task_id === 'b')!;
        assert.strictEqual(gym.moduleLabel, 'Custom');
        assert.strictEqual(gym.title, 'Gym - push day');
        assert.strictEqual(gym.time, '06:00');
        assert.strictEqual(isCustomTaskRow(gym), true);
        // never rewritten like program titles are
        assert.strictEqual(rows.find((r) => r.task_id === 'c')!.title, 'Sleepmax - my own thing');
    },
};

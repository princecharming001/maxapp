/**
 * Day counter + day-close rule (lib/dayProgress).
 *
 * Pins: the counter comes from the journey anchor + the DEVICE date (a cached
 * payload must not freeze it), the close rule matches the backend's
 * (>= 60% done, or >= 80% resolved with a completion), and the XP toast copy.
 */
import assert from 'assert';
import {
    DAY_CLOSE_COMPLETED_FRACTION,
    DAY_CLOSE_RESOLVED_FRACTION,
    dayCloses,
    diffDaysISO,
    continuousDates,
    journeyDayNumber,
    localDateISO,
    resolveTodayISO,
    xpToastLine,
} from '../lib/dayProgress';

export const tests = {
    'day strip has no gaps on rest days': () => {
        // sim: a weekday-only plan showed "1 2 3 4 6 7" (Sunday had no tasks)
        assert.deepStrictEqual(continuousDates(['2026-10-17', '2026-10-14', '2026-10-19']),
            ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
        assert.deepStrictEqual(continuousDates([]), []);
    },

    'thresholds mirror the backend': () => {
        assert.strictEqual(DAY_CLOSE_COMPLETED_FRACTION, 0.6);
        assert.strictEqual(DAY_CLOSE_RESOLVED_FRACTION, 0.8);
    },

    'day closes: most done, or most resolved with a real completion': () => {
        const table: [number, number, number, boolean][] = [
            [8, 5, 0, true], [8, 4, 0, false], [8, 4, 3, true], [8, 0, 8, false], [8, 7, 0, true],
            [5, 3, 0, true], [3, 2, 0, true], [3, 1, 1, false], [3, 1, 2, true], [1, 1, 0, true],
            [1, 0, 0, false], [0, 0, 0, false],
        ];
        for (const [total, done, skipped, expected] of table) {
            assert.strictEqual(dayCloses(total, done, skipped), expected, `${done}/${total} +${skipped} skipped`);
        }
        assert.strictEqual(dayCloses(8, 5), true, 'skipped defaults to 0');
    },

    'journey day = anchor + calendar days, immune to cached payloads': () => {
        assert.strictEqual(journeyDayNumber('2026-05-04', '2026-05-04'), 1);
        assert.strictEqual(journeyDayNumber('2026-05-04', '2026-09-24'), 144);
        assert.strictEqual(journeyDayNumber('2026-05-04', '2026-09-25'), 145);
        assert.strictEqual(journeyDayNumber('2026-05-04', '2026-09-26'), 146);
        // DST boundary in between changes nothing
        assert.strictEqual(diffDaysISO('2026-03-01', '2026-03-15'), 14);
        assert.strictEqual(diffDaysISO('2026-10-25', '2026-11-08'), 14);
        // no anchor / garbage → null, never a fake day 1
        assert.strictEqual(journeyDayNumber(null, '2026-09-25'), null);
        assert.strictEqual(journeyDayNumber('', '2026-09-25'), null);
        assert.strictEqual(journeyDayNumber('yesterday', '2026-09-25'), null);
        assert.strictEqual(journeyDayNumber('2026-05-04', 'now'), null);
        // an anchor in the future clamps to day 1 rather than going negative
        assert.strictEqual(journeyDayNumber('2026-12-01', '2026-09-25'), 1);
    },

    "today = the later of the server's local date and the device's": () => {
        assert.strictEqual(resolveTodayISO('2026-09-24', '2026-09-25'), '2026-09-25', 'stale cache loses');
        assert.strictEqual(resolveTodayISO('2026-09-26', '2026-09-25'), '2026-09-26', 'profile tz already tomorrow');
        assert.strictEqual(resolveTodayISO('2026-09-25', '2026-09-25'), '2026-09-25');
        assert.strictEqual(resolveTodayISO(null, '2026-09-25'), '2026-09-25');
        assert.strictEqual(resolveTodayISO('bad', '2026-09-25'), '2026-09-25');
        assert.strictEqual(resolveTodayISO('2026-09-25', 'bad'), '2026-09-25');
    },

    'localDateISO is the device calendar date, not UTC': () => {
        const late = new Date(2026, 8, 25, 23, 30); // local 23:30 on Sep 25
        assert.strictEqual(localDateISO(late), '2026-09-25');
        const early = new Date(2026, 0, 1, 0, 5);
        assert.strictEqual(localDateISO(early), '2026-01-01');
    },

    'xp toast copy': () => {
        assert.strictEqual(xpToastLine({ awarded: 12, on_time: true }), '+12 XP');
        assert.strictEqual(xpToastLine({ awarded: 6, on_time: false }), '+6 XP · late');
        assert.strictEqual(xpToastLine({ awarded: 0, on_time: true }), null);
        assert.strictEqual(xpToastLine(null), null);
        assert.strictEqual(xpToastLine(undefined), null);
        assert.strictEqual(xpToastLine({ awarded: Number.NaN }), null);
    },
};

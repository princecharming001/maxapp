import assert from 'assert';
import {
    buildWidgetSnapshot,
    formatWidgetTime,
    parseWidgetToggleQueue,
    syncTodayWidget,
    drainWidgetToggleQueue,
    clearTodayWidget,
} from '../lib/widgetSync';

// The widget bridge's pure half. The native writer is a no-op in node (no
// react-native / App Group), which is itself part of the contract — these run
// without a simulator and the module must load anywhere.

const row = (over: Partial<{ task_id: string; scheduleId: string; title: string; time: string; status: string }> = {}) => ({
    task_id: 't1',
    scheduleId: 's1',
    title: 'Mewing hold',
    time: '16:30',
    status: 'pending',
    ...over,
});

export const tests = {
    'formatWidgetTime: 24h → compact 12h with a/p suffix': () => {
        assert.equal(formatWidgetTime('16:30'), '4:30p');
        assert.equal(formatWidgetTime('07:05'), '7:05a');
        assert.equal(formatWidgetTime('00:15'), '12:15a');
        assert.equal(formatWidgetTime('12:00'), '12:00p');
        assert.equal(formatWidgetTime('9:45'), '9:45a');
    },

    'formatWidgetTime: garbage passes through, never throws': () => {
        assert.equal(formatWidgetTime(''), '');
        assert.equal(formatWidgetTime(undefined), '');
        assert.equal(formatWidgetTime('noon'), 'noon');
        assert.equal(formatWidgetTime('25:00'), '25:00');
    },

    'buildWidgetSnapshot: counts, ids, done flags, sorted by time': () => {
        const snap = buildWidgetSnapshot(
            [
                row({ task_id: 'b', time: '19:15', status: 'completed', title: 'Evening lift' }),
                row({ task_id: 'a', time: '07:00', title: 'Skincare AM' }),
                row({ task_id: 'c', time: '', title: 'Cold shower' }),
            ],
            47,
        );
        assert.equal(snap.streak, 47);
        assert.equal(snap.total, 3);
        assert.equal(snap.done, 1);
        assert.deepEqual(snap.tasks.map((t) => t.id), ['a', 'b', 'c']); // untimed sinks last
        assert.deepEqual(snap.tasks[0], { id: 'a', scheduleId: 's1', title: 'Skincare AM', time: '7:00a', done: false });
        assert.equal(snap.tasks[1].done, true);
    },

    'buildWidgetSnapshot: drops id-less rows, clamps streak, never fakes data': () => {
        const snap = buildWidgetSnapshot([row({ task_id: '' }), { ...row(), task_id: undefined as any }], -3);
        assert.deepEqual(snap, { streak: 0, done: 0, total: 0, tasks: [] });
        assert.equal(buildWidgetSnapshot([], NaN).streak, 0);
        assert.equal(buildWidgetSnapshot([], 12.9).streak, 12);
    },

    'buildWidgetSnapshot: untitled task gets a label so the row never renders blank': () => {
        const snap = buildWidgetSnapshot([row({ title: '   ' })], 0);
        assert.equal(snap.tasks[0].title, 'Routine');
    },

    'parseWidgetToggleQueue: keeps only well-formed toggles': () => {
        const raw = JSON.stringify([
            { taskId: 't1', scheduleId: 's1', done: true },
            { taskId: '', scheduleId: 's1', done: true },          // no task id
            { taskId: 't2', scheduleId: 's1', done: 'yes' },       // done not boolean
            { taskId: 't3', done: false },                         // no schedule id
            null,
            'junk',
        ]);
        assert.deepEqual(parseWidgetToggleQueue(raw), [{ taskId: 't1', scheduleId: 's1', done: true }]);
    },

    'parseWidgetToggleQueue: malformed / empty input → []': () => {
        assert.deepEqual(parseWidgetToggleQueue(null), []);
        assert.deepEqual(parseWidgetToggleQueue(''), []);
        assert.deepEqual(parseWidgetToggleQueue('{not json'), []);
        assert.deepEqual(parseWidgetToggleQueue('{"taskId":"t1"}'), []); // object, not array
    },

    'native bridge is a no-op off iOS (node): write/drain/clear never throw': () => {
        syncTodayWidget(buildWidgetSnapshot([row()], 1));
        assert.deepEqual(drainWidgetToggleQueue(), []);
        clearTodayWidget();
    },
};

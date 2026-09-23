/**
 * Boot-time guide prefetch invariants (H5) + task-guide cache rules.
 *
 * The prefetch used to fire one request per task INSTANCE across every day of
 * every schedule (~90 per schedule) on every tab mount, and cached the server's
 * "Unavailable" placeholder forever. These tests pin the pure pieces: today-only
 * targeting, dedupe by the server's cache key, bounded concurrency, and the
 * unavailable/degraded cache rules.
 *
 * `services/api` pulls in axios + Expo native modules, so it is stubbed at the
 * module loader before the modules under test are required.
 */
import assert from 'assert';

const Module = require('module');
const apiStub: { getTaskGuide: (s: string, t: string) => Promise<any> } = {
    getTaskGuide: async () => ({ task_key: 'k', title: 't', overview: '', steps: [], duration_minutes: 1, why_it_matters: '' }),
};
const origLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
    if (/(^|\/)services\/api$/.test(request)) {
        return { __esModule: true, default: apiStub };
    }
    return origLoad.call(this, request, ...rest);
};

const prefetch = require('../lib/prefetchMainTabData') as typeof import('../lib/prefetchMainTabData');
const guide = require('../hooks/useTaskGuide') as typeof import('../hooks/useTaskGuide');
const queries = require('../hooks/useAppQueries') as typeof import('../hooks/useAppQueries');

const { collectTodayGuideTargets, runLimited, scheduleTodayISO, guideCatalogKey, GUIDE_PREFETCH_CONCURRENCY } = prefetch;
const { fetchTaskGuide, isTaskGuideUnavailableError, taskGuideStaleTime, taskGuideQueryKey } = guide;
const { isPendingQuestionForThread } = queries;

const TODAY = '2026-09-22';

function payload() {
    return {
        today_date: TODAY,
        schedules: [
            {
                id: 's1',
                days: [
                    {
                        date: '2026-09-21',
                        tasks: [{ task_id: 'y1', catalog_id: 'spf', title: 'SPF' }],
                    },
                    {
                        date: TODAY,
                        tasks: [
                            { task_id: 'a', catalog_id: 'spf', title: 'SPF (morning)' },
                            { task_id: 'b', catalog_id: 'spf', title: 'SPF (reapply)' },
                            { task_id: 'c', title: 'Cold shower' },
                            { task_id: 'd', title: 'cold  shower (2 min)' },
                            { task_id: 'e', catalog_id: 'retinoid', title: 'Tret' },
                            { task_id: '', title: 'no id' },
                        ],
                    },
                    {
                        date: '2026-09-23',
                        tasks: [{ task_id: 'z1', catalog_id: 'spf', title: 'SPF' }],
                    },
                ],
            },
            { id: '', days: [{ date: TODAY, tasks: [{ task_id: 'q', title: 'orphan' }] }] },
            { id: 's2', days: [{ date: TODAY, tasks: [{ task_id: 'a', catalog_id: 'spf', title: 'SPF' }] }] },
        ],
    };
}

export const tests: Record<string, () => void | Promise<void>> = {
    'targets only TODAY, one request per (schedule, catalog key)': () => {
        const targets = collectTodayGuideTargets(payload(), TODAY);
        const byId = Object.fromEntries(targets.map((t) => [`${t.scheduleId}:${t.taskId}`, t]));
        // s1: spf (a, sibling b), cold shower (c, sibling d — same normalised title), retinoid (e)
        assert.deepStrictEqual(byId['s1:a'].siblingTaskIds, ['b']);
        assert.deepStrictEqual(byId['s1:c'].siblingTaskIds, ['d']);
        assert.deepStrictEqual(byId['s1:e'].siblingTaskIds, []);
        // s2 gets its own request even for the same catalog key (guides are per schedule id).
        assert.deepStrictEqual(byId['s2:a'].siblingTaskIds, []);
        assert.strictEqual(targets.length, 4, 'yesterday/tomorrow, blank ids and id-less schedules are skipped');
        assert.ok(!targets.some((t) => t.taskId === 'y1' || t.taskId === 'z1' || t.taskId === 'q'));
    },

    'no schedule day for today => nothing to prefetch': () => {
        assert.deepStrictEqual(collectTodayGuideTargets(payload(), '2030-01-01'), []);
        assert.deepStrictEqual(collectTodayGuideTargets(null, TODAY), []);
        assert.deepStrictEqual(collectTodayGuideTargets({ schedules: 'nope' }, TODAY), []);
    },

    'catalog key mirrors the server cache key (catalog_id first, else normalised title)': () => {
        assert.strictEqual(guideCatalogKey({ catalog_id: 'spf', title: 'whatever' }), 'c:spf');
        assert.strictEqual(guideCatalogKey({ title: '  Cold   Shower (2 min) ' }), 't:cold shower');
        assert.strictEqual(guideCatalogKey({ title: 'A'.repeat(80) }), 't:' + 'a'.repeat(56));
        assert.strictEqual(guideCatalogKey({ title: '' }), null);
        assert.strictEqual(guideCatalogKey(null), null);
    },

    'today comes from the server (timezone-correct), local date only as fallback': () => {
        assert.strictEqual(scheduleTodayISO({ today_date: '2026-09-22' }), '2026-09-22');
        assert.strictEqual(scheduleTodayISO({ schedule_streak: { today_date: '2026-09-21' } }), '2026-09-21');
        assert.strictEqual(scheduleTodayISO({}, new Date(2026, 0, 5, 23, 59)), '2026-01-05');
        assert.strictEqual(scheduleTodayISO(undefined, new Date(2026, 11, 31)), '2026-12-31');
    },

    'runLimited never exceeds the cap and runs everything': async () => {
        let inFlight = 0;
        let peak = 0;
        const done: number[] = [];
        const thunks = Array.from({ length: 10 }, (_, i) => async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight -= 1;
            done.push(i);
        });
        await runLimited(thunks, 3);
        assert.strictEqual(peak, 3);
        assert.strictEqual(done.length, 10);
        assert.strictEqual(GUIDE_PREFETCH_CONCURRENCY, 3);
    },

    'runLimited swallows a failing thunk and keeps going': async () => {
        const seen: string[] = [];
        await runLimited(
            [
                async () => { seen.push('a'); },
                async () => { throw new Error('boom'); },
                async () => { seen.push('c'); },
            ],
            1,
        );
        assert.deepStrictEqual(seen, ['a', 'c']);
        await runLimited([], 3); // empty list resolves
    },

    'fetchTaskGuide throws a tagged error on the server "unavailable" placeholder': async () => {
        apiStub.getTaskGuide = async () => ({
            task_key: '', title: 'Task', overview: 'Task not found', steps: [{ n: 1, title: 'Unavailable', body: '', tip: null }],
            duration_minutes: 5, why_it_matters: '', unavailable: true, error: 'Task not found',
        });
        let err: unknown = null;
        try { await fetchTaskGuide('s', 't'); } catch (e) { err = e; }
        assert.ok(isTaskGuideUnavailableError(err), 'must be the tagged unavailable error');
        assert.strictEqual(isTaskGuideUnavailableError(new Error('Network Error')), false);
        assert.strictEqual(isTaskGuideUnavailableError(null), false);
    },

    'fetchTaskGuide returns a real guide unchanged (degraded ones included)': async () => {
        const real = { task_key: 'k', title: 'SPF', overview: 'o', steps: [], duration_minutes: 2, why_it_matters: 'w', degraded: true };
        apiStub.getTaskGuide = async () => real;
        assert.deepStrictEqual(await fetchTaskGuide('s', 't'), real);
    },

    'degraded guides are stale at once; real ones never': () => {
        assert.strictEqual(taskGuideStaleTime({ degraded: true } as any), 0);
        assert.strictEqual(taskGuideStaleTime({ task_key: 'k' } as any), Infinity);
        assert.strictEqual(taskGuideStaleTime(undefined), Infinity);
    },

    'screen and prefetch share one cache key shape': () => {
        assert.deepStrictEqual(taskGuideQueryKey('s1', 'a'), ['taskGuide', 's1', 'a']);
    },

    'pending question is restored only under its own thread': () => {
        const q = { text: 'q?', choices: ['a'], conversation_id: 'conv-hair' };
        assert.strictEqual(isPendingQuestionForThread(q, 'conv-hair'), true);
        assert.strictEqual(isPendingQuestionForThread(q, 'conv-fit'), false);
        assert.strictEqual(isPendingQuestionForThread(q, null), false);
        // Older backend without the stamp: legacy per-user behaviour.
        assert.strictEqual(isPendingQuestionForThread({ text: 'q?' }, 'conv-fit'), true);
        assert.strictEqual(isPendingQuestionForThread({ text: 'q?', conversation_id: null }, null), true);
        assert.strictEqual(isPendingQuestionForThread(null, 'conv-fit'), false);
        assert.strictEqual(isPendingQuestionForThread(undefined, 'conv-fit'), false);
    },
};

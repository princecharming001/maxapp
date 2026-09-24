/**
 * Push deep links + the task-reminder "Mark done" action (lib/notificationDeepLink).
 *
 * Production bugs these pin:
 *  - 'Home' is a TAB inside the root 'Main' route, so a Home push was parked
 *    forever (never navigated) — it must resolve to Main → Home;
 *  - on iOS (expo-notifications 0.28) a direct-APNs push's content.data is
 *    null — route/params live on request.trigger.payload;
 *  - a cold-start tap reaches JS twice (listener + getLastNotificationResponse)
 *    and must be handled once;
 *  - the live response listener never fires in the current native build, so a
 *    warm tap / "Mark done" is read from the stored last response on foreground
 *    — handled once, and cleared so a JS reload (OTA apply) can't replay it;
 *  - payload route names stay allow-listed.
 */
import assert from 'assert';
import {
    COMPLETE_TASK_ACTION_ID,
    NOTIFICATION_DEEP_LINK_ROUTES,
    TASK_REMINDER_CATEGORY_ID,
    canNavigateTo,
    claimNotificationResponse,
    createNotificationResponseGate,
    drainLastNotificationResponse,
    FOREGROUND_DRAIN_DELAYS_MS,
    notificationDataFromRequest,
    notificationResponseKey,
    resolveNotificationTarget,
    taskCompletionFromResponse,
} from '../lib/notificationDeepLink';

// Root routeNames of the full (paid / free-tier) stack vs the unpaid funnel.
const PAID_ROOT = ['Main', 'FaceScan', 'TaskGuide', 'Achievements', 'Ranks', 'DayPlanner', 'WeeklyReview', 'Profile', 'ProgressArchive', 'Settings'];
const FUNNEL_ROOT = ['Onboarding', 'ScanOffer', 'FaceScan', 'FaceScanResults', 'CreateAccount', 'Payment', 'Settings'];

const SID = '0f8c2a52-2b3c-4a8e-9a55-1c2d3e4f5a6b';
const TID = '9e1d2c3b-4a5f-4e6d-8c7b-6a5f4e3d2c1b';

export const tests: Record<string, () => void | Promise<void>> = {
    /* ── Home → Main mapping ── */

    'Home resolves to Main → Home tab, popping back to the existing Main': () => {
        assert.deepStrictEqual(resolveNotificationTarget({ route: 'Home' }), {
            name: 'Main',
            params: { screen: 'Home' },
            pop: true,
        });
    },

    'Home is navigable once the root stack has Main (the old check looked for "Home" and parked forever)': () => {
        const t = resolveNotificationTarget({ route: 'Home', params: { category: 'morning_preview' } })!;
        assert.strictEqual(canNavigateTo(t, PAID_ROOT), true);
        assert.strictEqual(PAID_ROOT.includes('Home'), false, 'Home is not a root route');
    },

    'Home parks while Main is not mounted (funnel stack, navigator not ready)': () => {
        const t = resolveNotificationTarget({ route: 'Home' })!;
        assert.strictEqual(canNavigateTo(t, FUNNEL_ROOT), false);
        assert.strictEqual(canNavigateTo(t, []), false);
        assert.strictEqual(canNavigateTo(t, undefined), false);
    },

    /* ── allow-list ── */

    'new targets are allow-listed root routes: WeeklyReview, Ranks, FaceScan, DayPlanner': () => {
        for (const r of ['WeeklyReview', 'Ranks', 'FaceScan', 'DayPlanner']) {
            assert.ok(NOTIFICATION_DEEP_LINK_ROUTES.has(r), r);
            const t = resolveNotificationTarget({ route: r, params: { category: 'x' } });
            assert.deepStrictEqual(t, { name: r, params: { category: 'x' } });
            assert.strictEqual(canNavigateTo(t!, PAID_ROOT), true, r);
        }
    },

    'existing targets keep working (TaskGuide with the payload params, no pop)': () => {
        const params = { schedule_id: SID, task_id: TID, task_uuid: 'u', title: 'SPF' };
        assert.deepStrictEqual(resolveNotificationTarget({ route: 'TaskGuide', params }), { name: 'TaskGuide', params });
        assert.deepStrictEqual(resolveNotificationTarget({ route: 'Achievements' }), { name: 'Achievements' });
    },

    'allow-list rejects arbitrary / hostile routes and malformed data': () => {
        for (const route of ['Payment', 'Admin', 'Settings', 'DevDrawer', 'Main', 'constructor', '__proto__', '', 'home']) {
            assert.strictEqual(resolveNotificationTarget({ route }), null, route);
        }
        assert.strictEqual(resolveNotificationTarget({ route: 42 }), null);
        assert.strictEqual(resolveNotificationTarget(null), null);
        assert.strictEqual(resolveNotificationTarget('Home'), null);
        assert.strictEqual(resolveNotificationTarget({}), null);
    },

    'params must be a plain object — arrays / strings are dropped, not passed to navigate': () => {
        assert.deepStrictEqual(resolveNotificationTarget({ route: 'Ranks', params: ['x'] }), { name: 'Ranks' });
        assert.deepStrictEqual(resolveNotificationTarget({ route: 'Ranks', params: 'x' }), { name: 'Ranks' });
    },

    'targets absent from the mounted stack park (TaskGuide during the funnel)': () => {
        const t = resolveNotificationTarget({ route: 'TaskGuide' })!;
        assert.strictEqual(canNavigateTo(t, FUNNEL_ROOT), false);
    },

    /* ── where the payload lives ── */

    'iOS direct-APNs push: content.data is null → route/params come from trigger.payload': () => {
        const request = {
            identifier: 'n1',
            content: { title: 't', body: 'b', data: null },
            trigger: {
                type: 'push',
                payload: { aps: { alert: { title: 't', body: 'b' }, category: 'TASK_REMINDER' }, category: 'task_due', route: 'TaskGuide', params: { schedule_id: SID, task_id: TID } },
            },
        };
        const data = notificationDataFromRequest(request)!;
        assert.strictEqual(data.route, 'TaskGuide');
        assert.deepStrictEqual(data.params, { schedule_id: SID, task_id: TID });
    },

    'local / Expo-envelope notifications keep using content.data (and payload.body)': () => {
        assert.deepStrictEqual(
            notificationDataFromRequest({ content: { data: { route: 'Home' } }, trigger: { type: 'timeInterval' } }),
            { route: 'Home' },
        );
        assert.deepStrictEqual(
            notificationDataFromRequest({ content: { data: null }, trigger: { type: 'push', payload: { aps: {}, body: { route: 'Ranks' } } } }),
            { route: 'Ranks' },
        );
        assert.strictEqual(notificationDataFromRequest(null), null);
        assert.strictEqual(notificationDataFromRequest({ content: { data: null }, trigger: { type: 'push', payload: { aps: {} } } }), null);
    },

    /* ── "Mark done" ── */

    'category + action ids match the server contract': () => {
        assert.strictEqual(TASK_REMINDER_CATEGORY_ID, 'TASK_REMINDER');
        assert.strictEqual(COMPLETE_TASK_ACTION_ID, 'complete');
    },

    '"Mark done" with schedule_id + task_id → complete that task (params kept for the guide fallback)': () => {
        const params = { schedule_id: SID, task_id: TID, title: 'SPF' };
        assert.deepStrictEqual(taskCompletionFromResponse('complete', { route: 'TaskGuide', params }), {
            scheduleId: SID,
            taskId: TID,
            params,
        });
    },

    'camelCase ids are accepted too': () => {
        const c = taskCompletionFromResponse('complete', { params: { scheduleId: SID, taskId: TID } });
        assert.strictEqual(c?.scheduleId, SID);
        assert.strictEqual(c?.taskId, TID);
    },

    'a normal tap (default action) is never a completion': () => {
        const data = { route: 'TaskGuide', params: { schedule_id: SID, task_id: TID } };
        assert.strictEqual(taskCompletionFromResponse('expo.modules.notifications.actions.DEFAULT', data), null);
        assert.strictEqual(taskCompletionFromResponse(undefined, data), null);
    },

    'missing or path-like ids → no completion (falls back to the deep link)': () => {
        assert.strictEqual(taskCompletionFromResponse('complete', { params: { schedule_id: SID } }), null);
        assert.strictEqual(taskCompletionFromResponse('complete', { params: { task_id: TID } }), null);
        assert.strictEqual(taskCompletionFromResponse('complete', { params: { schedule_id: '../users/me', task_id: TID } }), null);
        assert.strictEqual(taskCompletionFromResponse('complete', { params: { schedule_id: SID, task_id: 'a/b' } }), null);
        assert.strictEqual(taskCompletionFromResponse('complete', null), null);
        assert.strictEqual(taskCompletionFromResponse('complete', { params: 'x' }), null);
    },

    /* ── one response, one handling ── */

    'dedupe: the cold-start double delivery (listener + getLast) is handled once': () => {
        const gate = createNotificationResponseGate();
        // Both deliveries serialize the SAME UNNotificationResponse.
        const fromListener = { actionIdentifier: 'complete', notification: { date: 1758700000000, request: { identifier: 'req-1' } } };
        const fromGetLast = { actionIdentifier: 'complete', notification: { date: 1758700000000, request: { identifier: 'req-1' } } };
        assert.strictEqual(gate.claim(notificationResponseKey(fromListener)), true, 'listener');
        assert.strictEqual(gate.claim(notificationResponseKey(fromGetLast)), false, 'getLastNotificationResponseAsync');
    },

    'dedupe key: identifier + delivery date — a collapse-id replacement (same id, newer date) is NOT swallowed': () => {
        const older = { notification: { date: 1000, request: { identifier: 'task:abc' } } };
        const newer = { notification: { date: 2000, request: { identifier: 'task:abc' } } };
        assert.notStrictEqual(notificationResponseKey(older), notificationResponseKey(newer));
        const gate = createNotificationResponseGate();
        assert.strictEqual(gate.claim(notificationResponseKey(older)), true);
        assert.strictEqual(gate.claim(notificationResponseKey(newer)), true);
        // no date → the identifier alone; no identifier → no key
        assert.strictEqual(notificationResponseKey({ notification: { request: { identifier: 'x' } } }), 'x');
        assert.strictEqual(notificationResponseKey({ notification: { date: 5, request: {} } }), null);
        assert.strictEqual(notificationResponseKey(null), null);
    },

    'dedupe: a later, different notification goes through; replays of it do not': () => {
        const gate = createNotificationResponseGate();
        assert.strictEqual(gate.claim('req-1'), true);
        assert.strictEqual(gate.claim('req-2'), true);
        assert.strictEqual(gate.claim('req-2'), false);
    },

    'dedupe: a response without an identifier cannot be deduped and is let through': () => {
        const gate = createNotificationResponseGate();
        assert.strictEqual(gate.claim(undefined), true);
        assert.strictEqual(gate.claim(''), true);
        assert.strictEqual(gate.claim(undefined), true);
    },

    'dedupe: the app-level claim takes the whole response (what App.tsx passes)': () => {
        const r = { actionIdentifier: 'x', notification: { date: 42, request: { identifier: 'app-level-1' } } };
        assert.strictEqual(claimNotificationResponse(r), true);
        assert.strictEqual(claimNotificationResponse({ ...r }), false);
        assert.strictEqual(claimNotificationResponse(null), true, 'no identity → cannot dedupe → handled');
    },

    'dedupe: gates are independent (the app gate is module-level, tests get their own)': () => {
        const a = createNotificationResponseGate();
        const b = createNotificationResponseGate();
        assert.strictEqual(a.claim('x'), true);
        assert.strictEqual(b.claim('x'), true);
    },

    /* ── stored-response drain (warm taps) ── */

    'drain: a stored response is handled, then cleared': async () => {
        const store = fakeResponseStore(tapResponse('req-warm', 'expo.modules.notifications.actions.DEFAULT'));
        const seen: unknown[] = [];
        const handled = await drainLastNotificationResponse(store.read, store.clear, (r) => {
            seen.push(r);
        });
        assert.strictEqual(handled, true);
        assert.strictEqual(seen.length, 1);
        assert.strictEqual(store.current(), null, 'cleared after handling');
    },

    'drain: nothing stored → no handling, no clear call': async () => {
        const store = fakeResponseStore(null);
        let calls = 0;
        const handled = await drainLastNotificationResponse(store.read, store.clear, () => {
            calls += 1;
        });
        assert.strictEqual(handled, false);
        assert.strictEqual(calls, 0);
        assert.strictEqual(store.clears, 0);
    },

    'drain: an unmounted caller (handle → false) leaves the record for the next reader': async () => {
        const r = tapResponse('req-unmounted', 'complete');
        const store = fakeResponseStore(r);
        assert.strictEqual(await drainLastNotificationResponse(store.read, store.clear, () => false), false);
        assert.strictEqual(store.current(), r);
        assert.strictEqual(store.clears, 0);
    },

    'drain: never throws — missing native method, failing clear, throwing handler': async () => {
        const missing = await drainLastNotificationResponse(
            () => Promise.reject(new Error('UnavailabilityError')),
            () => Promise.resolve(),
            () => assert.fail('must not be called'),
        );
        assert.strictEqual(missing, false);

        const r = tapResponse('req-clear-fails', 'complete');
        const clearFails = await drainLastNotificationResponse(
            () => Promise.resolve(r),
            () => Promise.reject(new Error('native clear failed')),
            () => undefined,
        );
        assert.strictEqual(clearFails, true, 'still handled');

        const store = fakeResponseStore(tapResponse('req-handler-throws', 'complete'));
        const threw = await drainLastNotificationResponse(store.read, store.clear, () => {
            throw new Error('boom');
        });
        assert.strictEqual(threw, true);
        assert.strictEqual(store.current(), null, 'a throwing handler must not leave the record to replay');
    },

    'drain + gate: every foreground read and a late live-listener copy → one handling': async () => {
        const gate = createNotificationResponseGate();
        const r = tapResponse('req-mark-done', 'complete');
        const store = fakeResponseStore(r);
        let handledCount = 0;
        const handle = (resp: unknown) => {
            if (gate.claim(notificationResponseKey(resp))) handledCount += 1;
        };
        assert.deepStrictEqual([...FOREGROUND_DRAIN_DELAYS_MS], [0, 600, 1800]);
        for (let i = 0; i < FOREGROUND_DRAIN_DELAYS_MS.length; i++) {
            await drainLastNotificationResponse(store.read, store.clear, handle);
        }
        handle({ ...r }); // the live event, should a future native build deliver it
        assert.strictEqual(handledCount, 1);
    },

    'drain: a record cleared before a JS reload (OTA apply) does not replay into the fresh gate': async () => {
        const store = fakeResponseStore(tapResponse('req-before-reload', 'expo.modules.notifications.actions.DEFAULT'));
        const before = createNotificationResponseGate();
        let beforeCount = 0;
        await drainLastNotificationResponse(store.read, store.clear, (resp) => {
            if (before.claim(notificationResponseKey(resp))) beforeCount += 1;
        });
        // Reload: module state (the gate) resets; native memory (the store) does not.
        const after = createNotificationResponseGate();
        let afterCount = 0;
        await drainLastNotificationResponse(store.read, store.clear, (resp) => {
            if (after.claim(notificationResponseKey(resp))) afterCount += 1;
        });
        assert.strictEqual(beforeCount, 1);
        assert.strictEqual(afterCount, 0);
    },
};

function tapResponse(identifier: string, actionIdentifier: string) {
    return { actionIdentifier, notification: { date: 1758700000000, request: { identifier } } };
}

/** The native delegate's single lastNotificationResponse slot. */
function fakeResponseStore(initial: unknown) {
    let slot: unknown = initial;
    const store = {
        clears: 0,
        read: () => Promise.resolve(slot),
        clear: () => {
            store.clears += 1;
            slot = null;
            return Promise.resolve();
        },
        current: () => slot,
    };
    return store;
}

/**
 * Push-permission → UI state, the Home primer / "reminders are off" rules and
 * token-registration dedupe (lib/notificationPermission).
 *
 * The production bug these guard: the app's only permission ask fired on a
 * cold first launch, a "Don't Allow" was permanent, and nothing ever said
 * reminders were off. The primer may only appear while iOS can still prompt
 * (undetermined), only after the user has a plan with tasks today, and must
 * respect its 3-day snooze; provisional grants must count as ON.
 */
import assert from 'assert';
import {
    DAY_MS,
    IOS_AUTHORIZATION_STATUS as IOS,
    PRIMER_SNOOZE_MS,
    PUSH_TOKEN_REFRESH_MS,
    REMINDERS_OFF_SNOOZE_MS,
    addDaysISO,
    formatClock12,
    isPrimerEligible,
    isRemindersOffEligible,
    isSnoozed,
    notificationsRowAction,
    notificationsRowHint,
    parseClockMinutes,
    parseStoredTimestamp,
    pickNextTask,
    primerCopy,
    primerDismissKey,
    pushTokenKey,
    remindersOffDismissKey,
    shouldRegisterPushToken,
    toPushPermissionState,
} from '../lib/notificationPermission';

const NOW = Date.parse('2026-09-24T15:00:00Z');

function primerCtx(over: Partial<Parameters<typeof isPrimerEligible>[0]> = {}) {
    return {
        platformOS: 'ios',
        signedIn: true,
        appOptIn: undefined as unknown,
        permission: 'undetermined' as const,
        activePlanCount: 1,
        tasksTodayCount: 3,
        dismissedAt: null as number | null,
        now: NOW,
        ...over,
    };
}

function offCtx(over: Partial<Parameters<typeof isRemindersOffEligible>[0]> = {}) {
    return {
        platformOS: 'ios',
        signedIn: true,
        appOptIn: undefined as unknown,
        permission: 'denied' as const,
        activePlanCount: 1,
        dismissedAt: null as number | null,
        now: NOW,
        ...over,
    };
}

export const tests: Record<string, () => void | Promise<void>> = {
    /* ── permission mapping ── */

    'mapping: authorized / general granted → granted': () => {
        assert.strictEqual(toPushPermissionState({ status: 'granted', ios: { status: IOS.AUTHORIZED } }), 'granted');
        assert.strictEqual(toPushPermissionState({ status: 'granted' }), 'granted');
    },

    'mapping: PROVISIONAL / EPHEMERAL count as granted even though expo 0.28 reports status "undetermined"': () => {
        assert.strictEqual(toPushPermissionState({ status: 'undetermined', ios: { status: IOS.PROVISIONAL } }), 'granted');
        assert.strictEqual(toPushPermissionState({ status: 'undetermined', ios: { status: IOS.EPHEMERAL } }), 'granted');
    },

    'mapping: denied (general or iOS) → denied': () => {
        assert.strictEqual(toPushPermissionState({ status: 'denied', ios: { status: IOS.DENIED } }), 'denied');
        assert.strictEqual(toPushPermissionState({ status: 'denied' }), 'denied');
        assert.strictEqual(toPushPermissionState({ status: 'undetermined', ios: { status: IOS.DENIED } }), 'denied');
    },

    'mapping: never asked → undetermined': () => {
        assert.strictEqual(
            toPushPermissionState({ status: 'undetermined', ios: { status: IOS.NOT_DETERMINED } }),
            'undetermined',
        );
        assert.strictEqual(toPushPermissionState({ status: 'undetermined' }), 'undetermined');
    },

    'mapping: garbage / missing → unknown (never guessed as undetermined)': () => {
        assert.strictEqual(toPushPermissionState(null), 'unknown');
        assert.strictEqual(toPushPermissionState(undefined), 'unknown');
        assert.strictEqual(toPushPermissionState({}), 'unknown');
        assert.strictEqual(toPushPermissionState({ status: 'weird', ios: { status: 42 } }), 'unknown');
    },

    /* ── Settings row ── */

    'settings row: On → preferences; Off → prompt when undetermined, iOS Settings when denied': () => {
        assert.strictEqual(notificationsRowHint('granted'), 'On');
        assert.strictEqual(notificationsRowAction('granted'), 'preferences');
        assert.strictEqual(notificationsRowHint('undetermined'), 'Off — tap to turn on');
        assert.strictEqual(notificationsRowAction('undetermined'), 'request');
        assert.strictEqual(notificationsRowHint('denied'), 'Off — tap to turn on');
        assert.strictEqual(notificationsRowAction('denied'), 'open-settings');
    },

    'settings row: loading / unknown shows no state and falls back to iOS Settings': () => {
        assert.strictEqual(notificationsRowHint(null), undefined);
        assert.strictEqual(notificationsRowHint('unknown'), undefined);
        assert.strictEqual(notificationsRowAction('unknown'), 'open-settings');
        assert.strictEqual(notificationsRowAction(null), 'open-settings');
    },

    /* ── snooze windows ── */

    'snooze: 3-day primer window — just inside vs exactly at the boundary': () => {
        assert.strictEqual(PRIMER_SNOOZE_MS, 3 * DAY_MS);
        assert.strictEqual(isSnoozed(NOW - (PRIMER_SNOOZE_MS - 1), NOW, PRIMER_SNOOZE_MS), true);
        assert.strictEqual(isSnoozed(NOW - PRIMER_SNOOZE_MS, NOW, PRIMER_SNOOZE_MS), false);
        assert.strictEqual(isSnoozed(NOW - 5 * DAY_MS, NOW, PRIMER_SNOOZE_MS), false);
    },

    'snooze: never dismissed / garbage → not snoozed': () => {
        assert.strictEqual(isSnoozed(null, NOW, PRIMER_SNOOZE_MS), false);
        assert.strictEqual(isSnoozed(undefined, NOW, PRIMER_SNOOZE_MS), false);
        assert.strictEqual(isSnoozed(Number.NaN, NOW, PRIMER_SNOOZE_MS), false);
    },

    'snooze: a future timestamp (clock moved back) snoozes one window at most, never forever': () => {
        assert.strictEqual(isSnoozed(NOW + DAY_MS, NOW, PRIMER_SNOOZE_MS), true);
        assert.strictEqual(isSnoozed(NOW + 400 * DAY_MS, NOW, PRIMER_SNOOZE_MS), false);
    },

    'snooze: stored timestamps parse strictly; keys are per user': () => {
        assert.strictEqual(parseStoredTimestamp(String(NOW)), NOW);
        assert.strictEqual(parseStoredTimestamp(null), null);
        assert.strictEqual(parseStoredTimestamp(''), null);
        assert.strictEqual(parseStoredTimestamp('abc'), null);
        assert.strictEqual(parseStoredTimestamp('-5'), null);
        assert.notStrictEqual(primerDismissKey('u1'), primerDismissKey('u2'));
        assert.notStrictEqual(primerDismissKey('u1'), remindersOffDismissKey('u1'));
    },

    /* ── primer eligibility (ALL must hold) ── */

    'primer: eligible — iOS, signed in, plan with tasks today, undetermined, not snoozed': () => {
        assert.strictEqual(isPrimerEligible(primerCtx()), true);
    },

    'primer: never off iOS, never signed out': () => {
        assert.strictEqual(isPrimerEligible(primerCtx({ platformOS: 'android' })), false);
        assert.strictEqual(isPrimerEligible(primerCtx({ platformOS: 'web' })), false);
        assert.strictEqual(isPrimerEligible(primerCtx({ signedIn: false })), false);
    },

    'primer: only while iOS can still prompt (undetermined) — not granted/denied/unknown/loading': () => {
        for (const p of ['granted', 'denied', 'unknown', null] as const) {
            assert.strictEqual(isPrimerEligible(primerCtx({ permission: p })), false, String(p));
        }
    },

    'primer: needs an active plan AND tasks today': () => {
        assert.strictEqual(isPrimerEligible(primerCtx({ activePlanCount: 0 })), false);
        assert.strictEqual(isPrimerEligible(primerCtx({ tasksTodayCount: 0 })), false);
    },

    'primer: 3-day "not now" window — hidden at 2d23h, back at 3d': () => {
        assert.strictEqual(isPrimerEligible(primerCtx({ dismissedAt: NOW - (3 * DAY_MS - 60_000) })), false);
        assert.strictEqual(isPrimerEligible(primerCtx({ dismissedAt: NOW - 3 * DAY_MS })), true);
    },

    'primer: an explicit server-side opt-out (app_notifications_opt_in === false) is never nagged': () => {
        assert.strictEqual(isPrimerEligible(primerCtx({ appOptIn: false })), false);
        // default-true: missing / true is fine
        assert.strictEqual(isPrimerEligible(primerCtx({ appOptIn: undefined })), true);
        assert.strictEqual(isPrimerEligible(primerCtx({ appOptIn: true })), true);
    },

    /* ── "reminders are off" card ── */

    'reminders-off: shows for denied users with a plan; 7-day dismissal window': () => {
        assert.strictEqual(REMINDERS_OFF_SNOOZE_MS, 7 * DAY_MS);
        assert.strictEqual(isRemindersOffEligible(offCtx()), true);
        assert.strictEqual(isRemindersOffEligible(offCtx({ dismissedAt: NOW - 6 * DAY_MS })), false);
        assert.strictEqual(isRemindersOffEligible(offCtx({ dismissedAt: NOW - 7 * DAY_MS })), true);
    },

    'reminders-off: never for granted / undetermined / unknown, no plan, off iOS or opted out': () => {
        for (const p of ['granted', 'undetermined', 'unknown', null] as const) {
            assert.strictEqual(isRemindersOffEligible(offCtx({ permission: p })), false, String(p));
        }
        assert.strictEqual(isRemindersOffEligible(offCtx({ activePlanCount: 0 })), false);
        assert.strictEqual(isRemindersOffEligible(offCtx({ platformOS: 'android' })), false);
        assert.strictEqual(isRemindersOffEligible(offCtx({ signedIn: false })), false);
        assert.strictEqual(isRemindersOffEligible(offCtx({ appOptIn: false })), false);
    },

    /* ── next task + copy ── */

    'clock helpers: parse + 12h formatting': () => {
        assert.strictEqual(parseClockMinutes('07:30'), 450);
        assert.strictEqual(parseClockMinutes('7:05'), 425);
        assert.strictEqual(parseClockMinutes('24:00'), null);
        assert.strictEqual(parseClockMinutes('nope'), null);
        assert.strictEqual(formatClock12('07:30'), '7:30');
        assert.strictEqual(formatClock12('19:05'), '7:05');
        assert.strictEqual(formatClock12('00:15'), '12:15');
        assert.strictEqual(formatClock12('12:00'), '12:00');
        assert.strictEqual(formatClock12(undefined), null);
    },

    'next task: earliest PENDING task at/after now; completed and past ones skipped': () => {
        const today = [
            { title: 'Evening skincare', time: '21:00', status: 'pending' },
            { title: 'Morning skincare', time: '07:30', status: 'completed' },
            { title: 'Walk', time: '12:00', status: 'pending' }, // before "now" (13:00)
            { title: 'Mewing check', time: '15:15', status: 'pending' },
            { title: 'Untimed', time: '', status: 'pending' },
        ];
        assert.deepStrictEqual(pickNextTask(today, 13 * 60), { title: 'Mewing check', time: '15:15' });
    },

    'next task: late-evening open falls through to tomorrow; nothing timed → null': () => {
        const today = [{ title: 'Walk', time: '12:00', status: 'pending' }];
        const tomorrow = [
            { title: 'Cold shower', time: '08:00' },
            { title: 'Morning skincare', time: '07:30' },
        ];
        assert.deepStrictEqual(pickNextTask(today, 22 * 60, tomorrow), { title: 'Morning skincare', time: '07:30' });
        assert.strictEqual(pickNextTask([{ title: 'x', time: 'later' }], 0, []), null);
        assert.strictEqual(pickNextTask([], 0), null);
    },

    'copy: names the next task and its time in the lowercase voice': () => {
        const c = primerCopy({ title: 'Morning skincare', time: '07:30' });
        assert.strictEqual(c.title, 'want a ping at 7:30?');
        assert.strictEqual(
            c.body,
            'max will nudge you when it’s time for morning skincare — and every task after it. no spam, just your plan.',
        );
    },

    'copy: no known next task → plan-level fallback; long titles are clipped': () => {
        const c = primerCopy(null);
        assert.strictEqual(c.title, 'want a ping at task time?');
        assert.ok(c.body.startsWith('max will nudge you'));
        const long = primerCopy({ title: 'A'.repeat(120), time: '09:00' });
        assert.ok(long.body.length < 160, 'clipped');
        assert.ok(long.body.includes('…'));
    },

    'dates: addDaysISO crosses month/year boundaries; garbage → null': () => {
        assert.strictEqual(addDaysISO('2026-09-30', 1), '2026-10-01');
        assert.strictEqual(addDaysISO('2026-12-31', 1), '2027-01-01');
        assert.strictEqual(addDaysISO('nope', 1), null);
    },

    /* ── token registration dedupe ── */

    'token: first registration, a new token, or a different account always registers': () => {
        const k = pushTokenKey('u1', 'abc');
        assert.strictEqual(shouldRegisterPushToken(null, k, NOW), true);
        const last = { key: k, at: NOW };
        assert.strictEqual(shouldRegisterPushToken(last, pushTokenKey('u1', 'def'), NOW), true);
        assert.strictEqual(shouldRegisterPushToken(last, pushTokenKey('u2', 'abc'), NOW), true);
    },

    'token: the same pair is not re-POSTed on every foreground, but refreshes after the window': () => {
        const k = pushTokenKey('u1', 'abc');
        const last = { key: k, at: NOW };
        assert.strictEqual(shouldRegisterPushToken(last, k, NOW + 60_000), false);
        assert.strictEqual(shouldRegisterPushToken(last, k, NOW + PUSH_TOKEN_REFRESH_MS), true);
        assert.strictEqual(shouldRegisterPushToken(last, k, NOW - 1000), true, 'clock moved back');
    },
};

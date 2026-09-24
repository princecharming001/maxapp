/**
 * Push-notification permission state + the Home "reminders" nudges.
 *
 * Pure on purpose: no React Native / Expo imports, so the unit runner can load
 * it under plain node (__tests__/notificationPermission.test.ts).
 *
 * WHY (production, 2026-09): the app's ONLY permission ask fired the instant
 * the anonymous funnel account was minted on "Get started" — before the user
 * had seen a single thing of value. iOS shows its system prompt once per
 * install, so a "Don't Allow" there was forever, and the app never said
 * reminders were off (32 of 1,880 users had an APNs token). Now:
 *   - launch / foreground only READS the status and registers a token when it
 *     is already granted (services/registerIosPushToken.getIosPushTokenIfGranted);
 *   - the prompt is asked from a primer on Home right after the user sees their
 *     own plan (the value moment), naming their next task;
 *   - a denied user gets a quiet, snoozable "reminders are off" card.
 */

export type PushPermissionState = 'granted' | 'denied' | 'undetermined' | 'unknown';

/** expo-notifications `IosAuthorizationStatus` (0.28.x), mirrored so this file needs no native import. */
export const IOS_AUTHORIZATION_STATUS = {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
} as const;

/** The slice of expo's `NotificationPermissionsStatus` this module reads. */
export type PermissionSnapshot =
    | {
          status?: string | null;
          ios?: { status?: number | null } | null;
      }
    | null
    | undefined;

/**
 * Map expo's permission response onto one of four UI states.
 *
 * iOS detail that matters: expo-notifications 0.28 reports the general
 * `status` as 'granted' ONLY for AUTHORIZED — a PROVISIONAL or EPHEMERAL grant
 * comes back as status 'undetermined' (see EXUserFacingNotificationsPermissions-
 * Requester.m). Those users DO receive pushes and must never be shown a "turn
 * on reminders" primer, so `ios.status` wins whenever it's present.
 */
export function toPushPermissionState(p: PermissionSnapshot): PushPermissionState {
    if (!p || typeof p !== 'object') return 'unknown';
    const iosStatus = p.ios?.status;
    if (
        iosStatus === IOS_AUTHORIZATION_STATUS.AUTHORIZED ||
        iosStatus === IOS_AUTHORIZATION_STATUS.PROVISIONAL ||
        iosStatus === IOS_AUTHORIZATION_STATUS.EPHEMERAL
    ) {
        return 'granted';
    }
    if (p.status === 'granted') return 'granted';
    if (iosStatus === IOS_AUTHORIZATION_STATUS.DENIED || p.status === 'denied') return 'denied';
    if (iosStatus === IOS_AUTHORIZATION_STATUS.NOT_DETERMINED || p.status === 'undetermined') return 'undetermined';
    return 'unknown';
}

/* ── Settings → Notifications row ─────────────────────────────────────── */

export type NotificationsRowAction = 'preferences' | 'request' | 'open-settings';

/** The row's state line. `null` (first read still in flight) shows nothing rather than guessing. */
export function notificationsRowHint(state: PushPermissionState | null): string | undefined {
    if (state === 'granted') return 'On';
    if (state === 'denied' || state === 'undetermined') return 'Off — tap to turn on';
    return undefined;
}

/**
 * What a tap does, decided on a FRESH read at tap time:
 *   granted      → the per-category preferences screen
 *   undetermined → the iOS system prompt (it has never been shown)
 *   denied       → iOS Settings (the app can't re-prompt once denied)
 *   unknown      → iOS Settings (safe fallback)
 */
export function notificationsRowAction(state: PushPermissionState | null): NotificationsRowAction {
    if (state === 'granted') return 'preferences';
    if (state === 'undetermined') return 'request';
    return 'open-settings';
}

/* ── Snooze windows (per-user AsyncStorage timestamps) ─────────────────── */

export const DAY_MS = 24 * 60 * 60 * 1000;
/** "not now" on the primer keeps it away this long. */
export const PRIMER_SNOOZE_MS = 3 * DAY_MS;
/** Dismissing the "reminders are off" card keeps it away this long. */
export const REMINDERS_OFF_SNOOZE_MS = 7 * DAY_MS;

export const primerDismissKey = (userId: string) => `max.notif.primerDismissedAt.v1:${userId}`;
export const remindersOffDismissKey = (userId: string) => `max.notif.remindersOffDismissedAt.v1:${userId}`;

/** A stored epoch-ms string → number, or null when absent / garbage. */
export function parseStoredTimestamp(raw: string | null | undefined): number | null {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True while a dismissal at `dismissedAt` still snoozes its surface. A
 * timestamp in the FUTURE (device clock moved back) snoozes for at most one
 * window from now — it can never hide the surface forever.
 */
export function isSnoozed(dismissedAt: number | null | undefined, now: number, windowMs: number): boolean {
    if (typeof dismissedAt !== 'number' || !Number.isFinite(dismissedAt)) return false;
    return Math.abs(now - dismissedAt) < windowMs;
}

/* ── Eligibility ───────────────────────────────────────────────────────── */

export type NudgeContext = {
    platformOS: string;
    signedIn: boolean;
    /**
     * user.onboarding.app_notifications_opt_in. An explicit `false` means the
     * server will not push this user at all — asking them to allow
     * notifications would promise something that never arrives.
     */
    appOptIn: unknown;
    permission: PushPermissionState | null;
    /** Live schedules (the user's active plans). */
    activePlanCount: number;
    now: number;
};

/**
 * The value-moment primer shows only when ALL hold: iOS, signed in, not
 * opted out server-side, ≥1 active plan WITH tasks today, the OS permission
 * has never been decided (`undetermined` — the only state the system prompt
 * can still appear in), and no "not now" in the last 3 days.
 */
export function isPrimerEligible(
    ctx: NudgeContext & { tasksTodayCount: number; dismissedAt: number | null },
): boolean {
    return (
        ctx.platformOS === 'ios' &&
        ctx.signedIn &&
        ctx.appOptIn !== false &&
        ctx.permission === 'undetermined' &&
        ctx.activePlanCount >= 1 &&
        ctx.tasksTodayCount >= 1 &&
        !isSnoozed(ctx.dismissedAt, ctx.now, PRIMER_SNOOZE_MS)
    );
}

/**
 * The "reminders are off" card: iOS, signed in, not opted out server-side,
 * permission `denied`, ≥1 active plan (without a plan there are no task times
 * to miss), and not dismissed in the last 7 days.
 */
export function isRemindersOffEligible(ctx: NudgeContext & { dismissedAt: number | null }): boolean {
    return (
        ctx.platformOS === 'ios' &&
        ctx.signedIn &&
        ctx.appOptIn !== false &&
        ctx.permission === 'denied' &&
        ctx.activePlanCount >= 1 &&
        !isSnoozed(ctx.dismissedAt, ctx.now, REMINDERS_OFF_SNOOZE_MS)
    );
}

/* ── Primer copy: name the user's NEXT task ────────────────────────────── */

export type PlanTaskLike = { title?: string | null; time?: string | null; status?: string | null };
export type NextTask = { title: string; time: string };

/** 'HH:MM' (24h) → minutes since midnight, or null. */
export function parseClockMinutes(t: unknown): number | null {
    if (typeof t !== 'string') return null;
    const m = /^\s*(\d{1,2}):(\d{2})/.exec(t);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** '07:30' → '7:30', '19:05' → '7:05', '00:15' → '12:15'; null for garbage. */
export function formatClock12(t: unknown): string | null {
    const mins = parseClockMinutes(t);
    if (mins === null) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' + n calendar days (UTC-anchored so DST never shifts it); null for garbage. */
export function addDaysISO(iso: string, days: number): string | null {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const t = Date.parse(`${iso}T00:00:00Z`);
    if (!Number.isFinite(t)) return null;
    return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

function earliestTimed(tasks: PlanTaskLike[], pred: (t: PlanTaskLike, mins: number) => boolean): NextTask | null {
    let best: { task: PlanTaskLike; mins: number } | null = null;
    for (const t of tasks || []) {
        const mins = parseClockMinutes(t?.time);
        const title = typeof t?.title === 'string' ? t.title.trim() : '';
        if (mins === null || !title || !pred(t, mins)) continue;
        if (!best || mins < best.mins) best = { task: t, mins };
    }
    return best ? { title: String(best.task.title).trim(), time: String(best.task.time).trim() } : null;
}

/**
 * The task the primer names — the next reminder the user would actually get:
 * today's earliest still-pending task at/after `nowMinutes`; failing that
 * (a late-evening open) tomorrow's earliest task; else null. Untimed tasks
 * never get a timed ping, so they are never "next".
 */
export function pickNextTask(
    today: PlanTaskLike[],
    nowMinutes: number,
    tomorrow: PlanTaskLike[] = [],
): NextTask | null {
    return (
        earliestTimed(today, (t, mins) => t?.status !== 'completed' && mins >= nowMinutes) ??
        earliestTimed(tomorrow, (t) => t?.status !== 'completed')
    );
}

const MAX_TASK_IN_COPY = 48;

/** Lowercase editorial voice; long titles clipped so the card never turns into a paragraph. */
function taskPhrase(title: string): string {
    const clean = title.trim().replace(/[.!?\s]+$/, '').toLowerCase();
    return clean.length > MAX_TASK_IN_COPY ? `${clean.slice(0, MAX_TASK_IN_COPY - 1).trimEnd()}…` : clean;
}

/**
 * e.g. { title: 'want a ping at 7:30?', body: 'max will nudge you when it’s
 * time for morning skincare — and every task after it. no spam, just your plan.' }
 * Falls back to plan-level copy when no timed next task is known.
 */
export function primerCopy(next: NextTask | null): { title: string; body: string } {
    const at = next ? formatClock12(next.time) : null;
    const task = next ? taskPhrase(next.title) : '';
    return {
        title: at ? `want a ping at ${at}?` : 'want a ping at task time?',
        body: task
            ? `max will nudge you when it’s time for ${task} — and every task after it. no spam, just your plan.`
            : 'max will nudge you when it’s time for each task in your plan. no spam, just your plan.',
    };
}

/* ── Token registration dedupe ─────────────────────────────────────────── */

/**
 * Re-POST an unchanged (user, token) pair on foreground at most this often:
 * still heals a server-side drop within the hour, without a write on every
 * quick app switch. A new token, a different account or a cold start always
 * registers; a FAILED post is never remembered, so it retries next foreground.
 */
export const PUSH_TOKEN_REFRESH_MS = 60 * 60 * 1000;

export type TokenRegistration = { key: string; at: number } | null;

export const pushTokenKey = (userId: string, token: string) => `${userId}:${token}`;

/**
 * Register when the (user, token) pair is new — a different account on the
 * device, or a rotated token — or when the last success is older than the
 * refresh window (or in the future: the clock moved back).
 */
export function shouldRegisterPushToken(
    last: TokenRegistration,
    key: string,
    now: number,
    refreshMs: number = PUSH_TOKEN_REFRESH_MS,
): boolean {
    if (!last || last.key !== key) return true;
    if (now < last.at) return true;
    return now - last.at >= refreshMs;
}

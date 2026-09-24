/**
 * Push-notification taps → navigation, and the task-reminder "Mark done"
 * action. Pure (no React Native / Expo imports) so the rules are unit-tested
 * under plain node: __tests__/notificationDeepLink.test.ts.
 */

/**
 * Routes a push is allowed to deep-link into. An explicit ALLOW-LIST: we never
 * navigate to an arbitrary route name handed to us inside a notification
 * payload. Mirrors backend services/notification_copy.DEEP_LINK_ROUTES so
 * every category's push opens the right screen (task → TaskGuide, milestone →
 * Achievements, weekly recap → WeeklyReview, scan unlocked → FaceScan, …).
 * Creator platform: a "new update" push opens that creator's feed; an
 * application decision opens the studio; community/course pushes open the
 * member home. Params only ever come from the payload's `params` object.
 */
export const NOTIFICATION_DEEP_LINK_ROUTES: ReadonlySet<string> = new Set<string>([
    'Home',
    'TaskGuide',
    'Achievements',
    'Profile',
    'ProgressArchive',
    'WeeklyReview',
    'Ranks',
    'FaceScan',
    'DayPlanner',
    'CreatorFeed',
    'CreatorStudio',
    'CreatorMaxxHome',
]);

/** A resolved navigation: dispatched as navigate(name, params, pop ? { pop: true } : undefined). */
export type NotificationNavTarget = {
    name: string;
    params?: Record<string, unknown>;
    /** Return to an existing route of this name instead of pushing a duplicate. */
    pop?: boolean;
};

/**
 * Allow-listed names that are NOT root stack routes. 'Home' is a TAB inside
 * the root 'Main' route (navigation/TabNavigator.tsx): the old code looked for
 * 'Home' in the ROOT routeNames, never found it, and parked every Home push
 * forever — morning brief, streak, recap, missed-task, re-engagement and tips
 * all opened the app wherever it last was. `pop` returns to the existing Main
 * (React Navigation 7's navigate no longer goes back; without it a second tab
 * navigator would be pushed on top of the stack).
 */
const TAB_PARENT = new Map<string, string>([['Home', 'Main']]);

function plainParams(v: unknown): Record<string, unknown> | undefined {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

const hasLinkKeys = (o: Record<string, unknown>) => typeof o.route === 'string' || !!plainParams(o.params);

/**
 * The { route, params, category } object a notification carries.
 *
 * On iOS, expo-notifications 0.28 fills `content.data` for a REMOTE push from
 * `userInfo.body` — the Expo push-service envelope. Our server talks to APNs
 * directly and puts route / params / category at the TOP level of the
 * payload, beside `aps`, so `content.data` is null there; the full payload is
 * only exposed as `request.trigger.payload`. Reading `content.data` alone
 * meant no push ever deep-linked (and "Mark done" could never see its ids).
 * Order: content.data when it carries link keys (local notifications, Expo
 * envelope) → the raw APNs payload → its `body` envelope → whatever data was.
 */
export function notificationDataFromRequest(request: unknown): Record<string, unknown> | null {
    const req = request as { content?: { data?: unknown } | null; trigger?: { payload?: unknown } | null } | null | undefined;
    const data = plainParams(req?.content?.data);
    if (data && hasLinkKeys(data)) return data;
    const payload = plainParams(req?.trigger?.payload);
    if (payload) {
        if (hasLinkKeys(payload)) return payload;
        const envelope = plainParams(payload.body);
        if (envelope && hasLinkKeys(envelope)) return envelope;
    }
    return data ?? null;
}

/** A push's `data` ({ route, params }) → where to go, or null when the route isn't allow-listed. */
export function resolveNotificationTarget(data: unknown): NotificationNavTarget | null {
    if (!data || typeof data !== 'object') return null;
    const { route, params } = data as { route?: unknown; params?: unknown };
    if (typeof route !== 'string' || !NOTIFICATION_DEEP_LINK_ROUTES.has(route)) return null;
    const parent = TAB_PARENT.get(route);
    if (parent) return { name: parent, params: { screen: route }, pop: true };
    const p = plainParams(params);
    return p ? { name: route, params: p } : { name: route };
}

/**
 * Navigate now only when the MOUNTED root stack registers the target —
 * otherwise the caller parks it and flushes once the right stack mounts
 * (cold start from a tap, auth still restoring, the unpaid stack is up).
 */
export function canNavigateTo(
    target: NotificationNavTarget,
    rootRouteNames: readonly string[] | null | undefined,
): boolean {
    return Array.isArray(rootRouteNames) && rootRouteNames.includes(target.name);
}

/* ── Task-reminder action button ──────────────────────────────────────── */

/** Server task-reminder pushes carry aps.category = this. */
export const TASK_REMINDER_CATEGORY_ID = 'TASK_REMINDER';
/** The "Mark done" action's identifier (what `response.actionIdentifier` carries). */
export const COMPLETE_TASK_ACTION_ID = 'complete';

// Ids are interpolated into a URL path (schedules/{id}/tasks/{id}/complete) —
// accept only id-shaped strings (uuids, slugs), never a path.
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function idString(v: unknown): string | null {
    const s = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
    return ID_RE.test(s) ? s : null;
}

export type TaskCompletion = { scheduleId: string; taskId: string; params: Record<string, unknown> };

/**
 * A "Mark done" tap on a task reminder → the task to complete. Null for a
 * normal tap (DEFAULT action) or when the payload can't name the task — the
 * caller then falls back to the ordinary deep link. Reads the server's
 * snake_case params (schedule_id / task_id); camelCase is accepted too.
 */
export function taskCompletionFromResponse(actionIdentifier: unknown, data: unknown): TaskCompletion | null {
    if (actionIdentifier !== COMPLETE_TASK_ACTION_ID) return null;
    const p = plainParams((data as { params?: unknown } | null | undefined)?.params);
    if (!p) return null;
    const scheduleId = idString(p.schedule_id ?? p.scheduleId);
    const taskId = idString(p.task_id ?? p.taskId);
    if (!scheduleId || !taskId) return null;
    return { scheduleId, taskId, params: p };
}

/* ── One response, one handling ───────────────────────────────────────── */

/**
 * Identity of one delivered notification: its `request.identifier`, plus the
 * delivery `date` when present. Both copies of a cold-start tap (see below)
 * carry the same pair; the date matters if the server ever sets
 * apns-collapse-id (supported by services/apns_service), because a newer push
 * that REPLACES an older one reuses its identifier — keyed on the identifier
 * alone, tapping it would be swallowed as a "duplicate".
 */
export function notificationResponseKey(response: unknown): string | null {
    const n = (response as { notification?: { date?: unknown; request?: { identifier?: unknown } } } | null | undefined)
        ?.notification;
    const id = n?.request?.identifier;
    if (typeof id !== 'string' || !id) return null;
    return typeof n?.date === 'number' && Number.isFinite(n.date) ? `${id}@${n.date}` : id;
}

/**
 * A cold-start tap reaches JS TWICE: the native module flushes the pending
 * response to the first listener AND getLastNotificationResponseAsync()
 * returns it. Handling both double-completed tasks / double-navigated. The
 * gate remembers the last handled notification (notificationResponseKey).
 * A response without an identifier can't be deduped, so it is let through.
 */
export function createNotificationResponseGate() {
    let lastHandled: string | null = null;
    return {
        claim(key: unknown): boolean {
            if (typeof key !== 'string' || !key) return true;
            if (key === lastHandled) return false;
            lastHandled = key;
            return true;
        },
    };
}

// Module-level so it outlives an AppNavigator remount (error-boundary reset),
// which re-runs the cold-start read and would otherwise replay the last tap.
const appResponseGate = createNotificationResponseGate();

/** True the first time this notification response is seen; false for the duplicate delivery. */
export function claimNotificationResponse(response: unknown): boolean {
    return appResponseGate.claim(notificationResponseKey(response));
}

/* ── Stored-response drain ────────────────────────────────────────────── */

/**
 * When to read the stored response after the app turns active. iOS can hand
 * the tap to the delegate a beat before or after AppState flips, so read at
 * once and twice more shortly after; the gate above drops the repeats.
 */
export const FOREGROUND_DRAIN_DELAYS_MS: readonly number[] = [0, 600, 1800];

/**
 * expo-notifications 0.28 attaches its response listener to the native
 * notification-center delegate only once JS "starts observing", which its
 * legacy event emitter never does under the new architecture — so a tap or a
 * "Mark done" on a warm app never reaches addNotificationResponseReceivedListener.
 * The delegate still records every response before dispatching it, so reading
 * that record on each foreground delivers the tap anyway. It is cleared once
 * handled: the record lives in native memory and outlives a JS reload (OTA
 * apply), which would otherwise replay the last tap.
 *
 * `handle` returns false to leave the record for someone else (unmounted
 * caller). Never throws — an older native module without these methods keeps
 * the old behaviour. Resolves true when a response was handed to `handle`.
 */
export async function drainLastNotificationResponse<R>(
    read: () => Promise<R | null | undefined>,
    clear: () => Promise<unknown>,
    handle: (response: R) => boolean | void,
): Promise<boolean> {
    let response: R | null | undefined;
    try {
        response = await read();
    } catch {
        return false;
    }
    if (!response) return false;
    let consumed: boolean | void = true;
    try {
        consumed = handle(response);
    } catch {
        // A throwing handler must not leave the record behind to replay.
    }
    if (consumed === false) return false;
    try {
        await clear();
    } catch {
        // Nothing to do — the claim gate still stops an in-process replay.
    }
    return true;
}

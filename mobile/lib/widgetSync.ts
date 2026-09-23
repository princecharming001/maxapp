/**
 * Home Screen / Lock Screen widget data bridge.
 *
 * Writes a compact "today" snapshot into the shared App Group container so the
 * native WidgetKit extension (targets/widget/index.swift) can render it, then
 * asks WidgetKit to reload its timelines. The widget itself does NO network —
 * it only reads whatever the app last wrote here.
 *
 * HISTORY: the writer (`syncTodayWidget`) and the queue drain were purged in a
 * dead-code sweep (295489e5) while the widget target itself kept shipping, so
 * every placed widget went permanently blank (hasData=false) and its checkbox
 * taps queued into a store nothing ever read. hooks/useWidgetSync.ts is the
 * only caller now — keep it that way so there is exactly one writer.
 *
 * Degrades to a no-op on Android, in Expo Go, in node (unit tests) and in any
 * build where the native module isn't present, so callers can fire it
 * unconditionally. The pure builders below (`buildWidgetSnapshot`,
 * `formatWidgetTime`, `parseWidgetToggleQueue`) never touch native code.
 */

const APP_GROUP = 'group.com.cannon.mobile';
const KEY = 'todaySnapshot';
const QUEUE_KEY = 'widgetToggleQueue';

let storage: {
    set: (k: string, v: string) => void;
    get: (k: string) => string | null;
    remove: (k: string) => void;
} | null = null;
let reloadWidget: (() => void) | null = null;
try {
    // Both requires are lazy and inside the try so this module also loads in
    // plain node (scripts/run-unit-tests.js) where react-native has no runtime:
    // the pure builders stay testable and `storage` simply stays null.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@bacons/apple-targets');
    if (Platform.OS === 'ios' && mod?.ExtensionStorage) {
        storage = new mod.ExtensionStorage(APP_GROUP);
        if (typeof mod.ExtensionStorage.reloadWidget === 'function') {
            reloadWidget = () => mod.ExtensionStorage.reloadWidget();
        }
    }
} catch {
    // Native module unavailable (Android build / Expo Go / node) — stays a no-op.
}

export type WidgetTask = {
    id: string; // task_id — lets the widget's checkbox target this task
    scheduleId: string; // schedule_id — needed to reconcile with the backend
    title: string;
    time: string; // pre-formatted for display, e.g. "4:30p"
    done: boolean;
};

/** A check/uncheck the user made from the widget, awaiting server sync. */
export type WidgetToggle = {
    taskId: string;
    scheduleId: string;
    done: boolean; // desired state after the toggle
};

export type WidgetSnapshot = {
    streak: number;
    done: number;
    total: number;
    tasks: WidgetTask[];
};

/** The subset of a merged Home row the widget needs. */
export type WidgetSourceRow = {
    task_id: string;
    scheduleId: string;
    title: string;
    time: string; // "HH:MM" 24h as persisted by the backend
    status: string;
};

/** "16:30" → "4:30p", "07:05" → "7:05a"; anything unparseable passes through. */
export function formatWidgetTime(time24: string | null | undefined): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(time24 ?? '').trim());
    if (!m) return String(time24 ?? '');
    const h = parseInt(m[1], 10);
    const min = m[2];
    if (Number.isNaN(h) || h > 23) return String(time24 ?? '');
    const h12 = h % 12 || 12;
    return `${h12}:${min}${h >= 12 ? 'p' : 'a'}`;
}

/**
 * Build the widget payload from today's merged rows (the same rows Home
 * renders, already deduped/merged across every active max). Sorted by time so
 * the widget rail reads top-to-bottom like the day. Pure.
 */
export function buildWidgetSnapshot(rows: WidgetSourceRow[], streak: number): WidgetSnapshot {
    const tasks: WidgetTask[] = (rows || [])
        .filter((r) => r && typeof r.task_id === 'string' && r.task_id)
        .map((r) => ({
            id: String(r.task_id),
            scheduleId: String(r.scheduleId ?? ''),
            title: String(r.title ?? '').trim() || 'Routine',
            time: formatWidgetTime(r.time),
            done: r.status === 'completed',
        }))
        .sort((a, b) => timeSortKey(a.time) - timeSortKey(b.time));
    const done = tasks.filter((t) => t.done).length;
    const s = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
    return { streak: s, done, total: tasks.length, tasks };
}

// Sort key for the pre-formatted "4:30p" strings (empty/unknown sink to the end).
function timeSortKey(t: string): number {
    const m = /^(\d{1,2}):(\d{2})([ap])$/.exec(t);
    if (!m) return Number.MAX_SAFE_INTEGER;
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === 'p') h += 12;
    return h * 60 + parseInt(m[2], 10);
}

/** Validate the queue the widget wrote (see PendingToggle in index.swift). Pure. */
export function parseWidgetToggleQueue(raw: string | null | undefined): WidgetToggle[] {
    if (!raw) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
        (t): t is WidgetToggle =>
            !!t &&
            typeof (t as WidgetToggle).taskId === 'string' &&
            !!(t as WidgetToggle).taskId &&
            typeof (t as WidgetToggle).scheduleId === 'string' &&
            typeof (t as WidgetToggle).done === 'boolean',
    );
}

// Skip redundant writes so we don't thrash WidgetKit reloads on every render.
let lastSerialized = '';

/** The widget rewrote its own store (a checkbox tap) — the app's content
 *  dedupe no longer reflects what is on disk, so the next snapshot must land
 *  even if the app's rows are unchanged (e.g. the drained toggle failed). */
export function forceNextWidgetWrite(): void {
    lastSerialized = '';
}

export function syncTodayWidget(snapshot: WidgetSnapshot): void {
    if (!storage) return;
    try {
        // Dedupe on content only; the timestamp is added after so an unchanged
        // day doesn't look "new" every render.
        const key = JSON.stringify(snapshot);
        if (key === lastSerialized) return;
        lastSerialized = key;
        storage.set(KEY, JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }));
        reloadWidget?.();
    } catch {
        // Best-effort: a widget write must never take down the app.
    }
}

/**
 * Wipe the widget's snapshot so it shows its blank state — call on logout /
 * when unauthenticated so a signed-out device (or the next user) never sees the
 * previous session's tasks or streak.
 */
export function clearTodayWidget(): void {
    if (!storage) return;
    try {
        storage.remove(KEY);
        storage.remove(QUEUE_KEY);
        lastSerialized = '';
        reloadWidget?.();
    } catch {
        // Best-effort: never let a widget clear take down the app.
    }
}

/**
 * Drain the check/uncheck actions the user made from the widget while the app
 * was backgrounded. The widget already updated its own snapshot optimistically;
 * the caller is responsible for pushing each toggle to the backend. Returns
 * `[]` off iOS or when nothing is queued.
 */
export function drainWidgetToggleQueue(): WidgetToggle[] {
    if (!storage) return [];
    try {
        const raw = storage.get(QUEUE_KEY);
        if (!raw) return [];
        storage.remove(QUEUE_KEY);
        return parseWidgetToggleQueue(raw);
    } catch {
        // A malformed queue must never take down the app; drop it.
        try {
            storage.remove(QUEUE_KEY);
        } catch {
            /* ignore */
        }
        return [];
    }
}

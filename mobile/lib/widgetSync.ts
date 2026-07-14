/**
 * Home Screen / Lock Screen widget data bridge.
 *
 * Writes a compact "today" snapshot into the shared App Group container so the
 * native WidgetKit extension (targets/widget/index.swift) can render it, then
 * asks WidgetKit to reload its timelines. The widget itself does NO network —
 * it only reads whatever the app last wrote here.
 *
 * Degrades to a no-op on Android, in Expo Go, and in any build where the
 * native module isn't present, so callers can fire it unconditionally.
 */
import { Platform } from 'react-native';

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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@bacons/apple-targets');
    if (Platform.OS === 'ios' && mod?.ExtensionStorage) {
        storage = new mod.ExtensionStorage(APP_GROUP);
        if (typeof mod.ExtensionStorage.reloadWidget === 'function') {
            reloadWidget = () => mod.ExtensionStorage.reloadWidget();
        }
    }
} catch {
    // Native module unavailable (Android build / Expo Go) — stays a no-op.
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

// Skip redundant writes so we don't thrash WidgetKit reloads on every render.
let lastSerialized = '';

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
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (t): t is WidgetToggle =>
                t && typeof t.taskId === 'string' && typeof t.scheduleId === 'string',
        );
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

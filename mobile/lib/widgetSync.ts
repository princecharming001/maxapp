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

let storage: { set: (k: string, v: string) => void } | null = null;
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
    title: string;
    time: string; // pre-formatted for display, e.g. "4:30p"
    color: string; // hex, e.g. "#8B5CF6"
    done: boolean;
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

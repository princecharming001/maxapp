/**
 * useNotificationPermission — the live OS notification-permission state.
 *
 * Read on mount and on every foreground (the user can flip it in iOS Settings
 * at any time and come straight back). NEVER prompts — the prompt belongs to
 * an explicit tap (services/registerIosPushToken.enableIosPushFromUserTap).
 *
 * `state` is null until the first read lands, then one of
 * granted | denied | undetermined | unknown ('unknown' on web / read failure).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { readPushPermission } from '../services/registerIosPushToken';
import type { PushPermissionState } from '../lib/notificationPermission';

export function useNotificationPermission(enabled: boolean = true): {
    state: PushPermissionState | null;
    /** Re-read now; resolves with the fresh state (also published to `state`). */
    refresh: () => Promise<PushPermissionState>;
} {
    const [state, setState] = useState<PushPermissionState | null>(null);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refresh = useCallback(async () => {
        const next = await readPushPermission();
        if (mountedRef.current) setState(next);
        return next;
    }, []);

    useEffect(() => {
        if (!enabled) return;
        void refresh();
        const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
            if (s === 'active') void refresh();
        });
        return () => sub.remove();
    }, [enabled, refresh]);

    return { state, refresh };
}

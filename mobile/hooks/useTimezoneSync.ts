/**
 * useTimezoneSync — keep the server's idea of "today" on the user's clock.
 *
 * Every server-side "today" (streak credit, schedule date stamping, reminder
 * timing, the Home 'Today' label) reads onboarding.timezone and falls back to
 * UTC when it is missing. The zone was only ever written by the onboarding /
 * planner / EditPersonal saves, so an account whose onboarding never carried
 * one — or anyone who moved — saw tomorrow's plan labelled 'Tomorrow' after
 * ~5pm Pacific and never got today's completions credited.
 *
 * Mounted once in TabNavigator: on mount and on every foreground, compare the
 * device zone with what /me reports and PATCH when they differ. Then refresh
 * /me (so the comparison settles) and invalidate the canonical day-state key
 * (its today_date may have just changed). Never throws; a failed sync retries
 * on the next foreground.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { queryKeys } from '../lib/queryClient';
import { useAuth } from '../context/AuthContext';

/** IANA zone from the JS runtime, or null when Intl can't say (never "UTC" by guess). */
export function deviceTimezone(): string | null {
    try {
        const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
        // Hermes/ICU return an IANA name like "America/Los_Angeles"; anything
        // without a slash (e.g. "UTC", "Etc/GMT" is fine, "" is not) is treated
        // as unknown so we never overwrite a real zone with a placeholder.
        if (typeof tz === 'string' && tz.length >= 3 && tz.length <= 64 && tz.includes('/')) return tz;
        return null;
    } catch {
        return null;
    }
}

/** True when the server zone is missing or differs from a known device zone. */
export function needsTimezoneSync(serverTz: unknown, deviceTz: string | null): boolean {
    if (!deviceTz) return false;
    const server = typeof serverTz === 'string' ? serverTz.trim() : '';
    return server !== deviceTz;
}

export function useTimezoneSync(): void {
    const { user, refreshUser } = useAuth();
    const queryClient = useQueryClient();
    const serverTz = user?.onboarding?.timezone;
    const userId = user?.id;
    // The zone we last pushed this session — stops a refreshUser blip (or a
    // /me that hasn't caught up yet) from re-sending the same PATCH.
    const syncedRef = useRef<string | null>(null);
    const inFlight = useRef(false);

    useEffect(() => {
        if (!userId) return;
        const sync = async () => {
            if (inFlight.current) return;
            const deviceTz = deviceTimezone();
            if (!deviceTz || syncedRef.current === deviceTz) return;
            if (!needsTimezoneSync(serverTz, deviceTz)) {
                syncedRef.current = deviceTz;
                return;
            }
            inFlight.current = true;
            try {
                await api.patchTimezone(deviceTz);
                syncedRef.current = deviceTz;
                void queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull });
                await refreshUser().catch(() => undefined);
            } catch {
                // Offline / 5xx — retry on the next foreground.
            } finally {
                inFlight.current = false;
            }
        };
        void sync();
        const onChange = (state: AppStateStatus) => {
            if (state === 'active') void sync();
        };
        const sub = AppState.addEventListener('change', onChange);
        return () => sub.remove();
        // serverTz changes when /me refreshes; userId changes on account switch
        // (syncedRef intentionally survives — the device zone didn't change).
    }, [userId, serverTz, refreshUser, queryClient]);
}

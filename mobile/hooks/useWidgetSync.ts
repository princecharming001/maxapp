/**
 * useWidgetSync — the ONE writer for the Home/Lock Screen widget, and the ONE
 * drain for the checkbox taps it queues.
 *
 * Mounted once in TabNavigator (not App.tsx: the widget belongs to a signed-in,
 * fully-onboarded session, which is exactly when the tabs exist; logout /
 * auth-lost clear the snapshot in AuthContext). Reads today's rows from the
 * canonical `schedulesActiveFull` cache — the same merge Home renders — so the
 * widget tracks every path that updates the day (Home toggle, chat change,
 * planner save, regen) without any screen having to remember to call it.
 *
 * Drain: the widget flips its own snapshot optimistically and appends
 * {taskId, scheduleId, done} to a queue (targets/widget/index.swift). On mount
 * and on every foreground we replay that queue against the complete/uncomplete
 * endpoints, then invalidate the canonical key so Home and the widget converge
 * on the server's truth. A toggle whose desired state already matches the cache
 * is skipped (the user may have done the same thing in-app); a failed one is
 * dropped — the invalidate re-syncs the widget to reality either way.
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { queryKeys } from '../lib/queryClient';
import { useActiveSchedulesFullQuery, useMaxxesQuery } from './useAppQueries';
import { buildMaxxMaps, mergeSchedules } from '../utils/scheduleAggregation';
import { buildWidgetSnapshot, drainWidgetToggleQueue, syncTodayWidget, forceNextWidgetWrite } from '../lib/widgetSync';

/** Device-local YYYY-MM-DD (NOT toISOString, which is UTC and rolls over at ~5pm PT). */
function localISODate(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Current status of a task in the canonical cache, or null when unknown. */
function cachedTaskStatus(full: any, scheduleId: string, taskId: string): string | null {
    for (const s of (full?.schedules || []) as any[]) {
        if (String(s?.id) !== scheduleId) continue;
        for (const d of (s?.days || []) as any[]) {
            for (const t of (d?.tasks || []) as any[]) {
                if (String(t?.task_id) === taskId) return String(t?.status ?? '');
            }
        }
    }
    return null;
}

export function useWidgetSync(): void {
    const queryClient = useQueryClient();
    const schedulesQuery = useActiveSchedulesFullQuery();
    const maxesQuery = useMaxxesQuery();
    const full = schedulesQuery.data;
    // Keep the reference stable while maxes load (a fresh `[]` per render would
    // recompute the merge every render; the writer dedupes, but don't churn).
    const maxes = maxesQuery.data?.maxes;

    // Today's merged rows — identical derivation to HomeScreen's scheduleRows.
    const snapshot = useMemo(() => {
        if (!full) return null;
        try {
            const { labels, colors } = buildMaxxMaps(maxes ?? []);
            const merged = mergeSchedules(full.schedules || [], labels, colors);
            const today = full.today_date || full.schedule_streak?.today_date || localISODate();
            const rows = merged.byDate[today] || [];
            return buildWidgetSnapshot(rows, full.schedule_streak?.current ?? 0);
        } catch {
            return null;
        }
    }, [full, maxes]);

    // Write after every canonical-cache update. syncTodayWidget dedupes on
    // content, so re-renders with an unchanged day cost nothing.
    useEffect(() => {
        if (snapshot) syncTodayWidget(snapshot);
    }, [snapshot]);

    const draining = useRef(false);
    useEffect(() => {
        const drain = async () => {
            if (draining.current) return;
            const toggles = drainWidgetToggleQueue();
            if (!toggles.length) return;
            draining.current = true;
            try {
                const cached = queryClient.getQueryData(queryKeys.schedulesActiveFull);
                for (const t of toggles) {
                    const current = cachedTaskStatus(cached, t.scheduleId, t.taskId);
                    if (current !== null && (current === 'completed') === t.done) continue; // already there
                    try {
                        if (t.done) await api.completeScheduleTask(t.scheduleId, t.taskId);
                        else await api.uncompleteScheduleTask(t.scheduleId, t.taskId);
                    } catch {
                        // Stale id after a regen / offline — the invalidate below
                        // re-syncs the widget to what the server actually has.
                    }
                }
            } finally {
                draining.current = false;
                // Always re-sync: even an all-skipped/failed batch means the
                // widget's optimistic snapshot may disagree with the server.
                // The widget rewrote its own store, so the app's content
                // dedupe must not skip the next write.
                forceNextWidgetWrite();
                void queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull });
            }
        };
        void drain();
        const onChange = (state: AppStateStatus) => {
            if (state === 'active') void drain();
        };
        const sub = AppState.addEventListener('change', onChange);
        return () => sub.remove();
    }, [queryClient]);
}

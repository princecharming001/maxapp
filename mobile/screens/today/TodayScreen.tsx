/**
 * Today v2 (spec 3.2, flag `todayV2`) - the new home. One living,
 * self-adjusting day built from the planner merge.
 *
 * Layout top-to-bottom: header (date kicker, Today, streak ring) ->
 * today-read line -> morning lock-in banner (slide-to-confirm) -> NEXT UP
 * hero -> YOUR DAY timeline (quiet structure rows + gold task rows with
 * why-lines and provenance) -> held-back chip -> evening close-out.
 * Old MasterScheduleScreen stays the fallback when the flag is off.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AppState,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassButton } from '../../components/glass/GlassButton';
import SlideToConfirm from '../../components/today/SlideToConfirm';
import { track } from '../../lib/analytics';
import { queryKeys } from '../../lib/queryClient';
import api from '../../services/api';

const INK = '#1C1A17';
const GOLD = '#2C6BED';
const MUTE = '#97928A';

const TODAY_QK = ['plannerToday'];

type PlannerTask = {
    task_id?: string;
    schedule_id?: string;
    maxx_id?: string;
    title?: string;
    description?: string;
    time?: string;
    status?: string;
    why?: string;
    locked?: boolean;
    provenance?: { program_id?: string; creator_handle?: string | null };
};

function fmtTime(hhmm?: string): string {
    if (!hhmm || !hhmm.includes(':')) return '';
    const [hs, ms] = hhmm.split(':');
    let h = parseInt(hs, 10);
    const suffix = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}:${ms}${suffix}`;
}

function relativeLine(slotMin: number, nowMin: number): string | null {
    const d = slotMin - nowMin;
    if (d <= -90 || d > 12 * 60) return null;
    if (d <= 0) return 'now is good';
    if (d < 60) return `in about ${Math.max(5, Math.round(d / 5) * 5)} min`;
    const h = Math.round(d / 30) / 2;
    return `in about ${h === 1 ? 'an hour' : `${h} hours`}`;
}

function displayTitle(s?: string): string {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function toMin(hhmm?: string): number {
    if (!hhmm || !hhmm.includes(':')) return 0;
    const [h, m] = hhmm.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function haptic(kind: 'selection' | 'success' | 'light' | 'warning') {
    if (Platform.OS === 'web') return;
    if (kind === 'selection') Haptics.selectionAsync().catch(() => {});
    else if (kind === 'success')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (kind === 'warning')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export default function TodayScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [showHeldBack, setShowHeldBack] = useState(false);
    const [taskSheet, setTaskSheet] = useState<PlannerTask | null>(null);
    const [undo, setUndo] = useState<{ task: PlannerTask; promise?: Promise<unknown> } | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
    const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // A living clock: time-derived UI (lock-in banner, NEXT UP, close-out)
    // follows the real clock instead of freezing at first render. Foreground
    // also refetches, so a phone left open overnight wakes to the new day.
    const [now, setNow] = useState(() => new Date());

    const todayQ = useQuery({
        queryKey: TODAY_QK,
        queryFn: () => api.getPlannerToday(),
        staleTime: 30_000,
    });

    useEffect(() => {
        const tick = setInterval(() => setNow(new Date()), 60_000);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                setNow(new Date());
                todayQ.refetch();
            }
        });
        return () => {
            clearInterval(tick);
            sub.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // New-day / timezone-jump detection: the server's plan date no longer
    // matches the device's local date -> refetch rather than show yesterday.
    const deviceDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    useEffect(() => {
        if (todayQ.data?.date && todayQ.data.date !== deviceDate) {
            todayQ.refetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceDate, todayQ.data?.date]);
    const streakQ = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
    });
    const heldBackQ = useQuery({
        queryKey: ['plannerHeldBack'],
        queryFn: () => api.getPlannerHeldBack(),
        enabled: showHeldBack,
    });

    const data = todayQ.data;
    const streak = streakQ.data?.schedule_streak?.current ?? 0;
    const offline = todayQ.isError && !!data;

    // Merge tasks + structure rows into one time-ordered timeline.
    const timeline = useMemo(() => {
        const rows: { kind: 'struct' | 'task'; time: string; task?: PlannerTask; label?: string }[] = [];
        for (const s of data?.structure ?? []) {
            rows.push({ kind: 'struct', time: s.time, label: s.label });
        }
        for (const t of (data?.tasks ?? []) as PlannerTask[]) {
            rows.push({ kind: 'task', time: t.time || '00:00', task: t });
        }
        rows.sort((a, b) => toMin(a.time) - toMin(b.time));
        return rows;
    }, [data]);

    const tasks = (data?.tasks ?? []) as PlannerTask[];
    const pending = tasks.filter(
        (t) => !['completed', 'skipped'].includes(t.status || 'pending'),
    );
    const completed = tasks.filter((t) => t.status === 'completed');
    const programCount = new Set(tasks.map((t) => t.maxx_id).filter(Boolean)).size;

    const nowMin = now.getHours() * 60 + now.getMinutes();
    // Upcoming first; otherwise the NEAREST pending by clock distance - at
    // 10pm that's tonight's wind-down, not this morning's missed cleanse.
    const nextUp =
        pending.find((t) => toMin(t.time) >= nowMin) ??
        [...pending].sort(
            (a, b) => Math.abs(toMin(a.time) - nowMin) - Math.abs(toMin(b.time) - nowMin),
        )[0] ??
        null;

    const hour = now.getHours();
    const isMorning = hour < 12;
    // Close-out is COMPLETION-driven, never clock-driven: 8pm with open tasks
    // keeps the NEXT UP hero (a 9pm wind-down still needs its Done button)
    // instead of congratulating over unchecked rows.
    const isEvening = tasks.length > 0 && pending.length === 0;

    // --- mutations (optimistic, instant, never network-gated) ---------------

    // Canonical optimistic pattern for EVERY mutation: cancel in-flight
    // refetches (so a stale response can't clobber the patch a moment later),
    // snapshot, patch, and roll the snapshot back on error.
    const snapshotAndPatch = useCallback(
        async (patch: (old: any) => any) => {
            await queryClient.cancelQueries({ queryKey: TODAY_QK });
            const prev = queryClient.getQueryData(TODAY_QK);
            queryClient.setQueryData(TODAY_QK, (old: any) => (old ? patch(old) : old));
            return { prev };
        },
        [queryClient],
    );
    const rollback = useCallback(
        (ctx?: { prev?: unknown }) => {
            if (ctx?.prev !== undefined) {
                queryClient.setQueryData(TODAY_QK, ctx.prev);
            }
        },
        [queryClient],
    );
    const patchStatus = (taskId: string | undefined, status: string) => (old: any) => ({
        ...old,
        tasks: old.tasks.map((t: PlannerTask) =>
            t.task_id === taskId ? { ...t, status } : t,
        ),
    });

    const doneMutation = useMutation({
        mutationFn: (t: PlannerTask) =>
            api.completeScheduleTask(t.schedule_id!, t.task_id!),
        onMutate: async (t) => {
            haptic('success');
            const ctx = await snapshotAndPatch(patchStatus(t.task_id, 'completed'));
            track('done_tapped', { program: t.maxx_id });
            // Last open task of the day -> the day is closed.
            if (pending.length === 1 && pending[0]?.task_id === t.task_id) {
                track('day_closed', { done: completed.length + 1 });
            }
            return ctx;
        },
        onError: (_e, _t, ctx) => {
            rollback(ctx);
            setUndo(null);
            haptic('warning');
            setToast("Couldn't save. Tap the task to retry.");
            setTimeout(() => setToast(null), 4000);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull });
        },
    });

    const undoMutation = useMutation({
        mutationFn: (t: PlannerTask) =>
            api.uncompleteScheduleTask(t.schedule_id!, t.task_id!),
        onMutate: async (t) => {
            haptic('light');
            setUndo(null);
            return snapshotAndPatch(patchStatus(t.task_id, 'pending'));
        },
        onError: (_e, _t, ctx) => rollback(ctx),
        onSettled: () => queryClient.invalidateQueries({ queryKey: TODAY_QK }),
    });

    const markDone = (t: PlannerTask) => {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        // The undo button waits for the in-flight complete to land before
        // firing uncomplete - otherwise the two PUTs race and the server can
        // finish in the wrong order.
        const promise = doneMutation.mutateAsync(t).catch(() => {});
        setUndo({ task: t, promise });
        undoTimer.current = setTimeout(() => setUndo(null), 4000);
    };

    const fireUndo = () => {
        if (!undo) return;
        const { task, promise } = undo;
        setUndo(null);
        (promise ?? Promise.resolve()).then(() => undoMutation.mutate(task));
    };

    const snoozeMutation = useMutation({
        mutationFn: ({ t, newTime }: { t: PlannerTask; newTime: string }) =>
            api.editScheduleTask(t.schedule_id!, t.task_id!, { time: newTime }, 'instance'),
        onMutate: async ({ t, newTime }) => {
            haptic('light');
            const ctx = await snapshotAndPatch((old: any) => ({
                ...old,
                tasks: old.tasks.map((x: PlannerTask) =>
                    x.task_id === t.task_id ? { ...x, time: newTime } : x,
                ),
            }));
            track('snooze', { program: t.maxx_id });
            setToast(`Moved to ${fmtTime(newTime)}`);
            // The human follow-up: a wrong time is usually wrong EVERY day.
            setToastAction({
                label: 'Keep daily',
                run: () => {
                    api.editScheduleTask(t.schedule_id!, t.task_id!, { time: newTime }, 'series')
                        .then(() => {
                            setToast(`Done. ${fmtTime(newTime)} every day now.`);
                            setToastAction(null);
                            setTimeout(() => setToast(null), 2500);
                        })
                        .catch(() => {
                            setToast("Couldn't save that. Try again.");
                            setToastAction(null);
                            setTimeout(() => setToast(null), 2500);
                        });
                },
            });
            setTimeout(() => { setToast(null); setToastAction(null); }, 6000);
            return ctx;
        },
        onError: (_e, _v, ctx) => {
            rollback(ctx);
            setToast("Couldn't move it. Try again.");
            setTimeout(() => setToast(null), 3000);
        },
    });

    const lockInMutation = useMutation({
        mutationFn: () => api.plannerLockIn(),
        onMutate: async () => {
            track('lock_in');
            return snapshotAndPatch((old: any) => ({ ...old, locked_in: true }));
        },
        onError: (_e, _v, ctx) => {
            rollback(ctx);
            haptic('warning');
            setToast("Couldn't lock in. Try again.");
            setTimeout(() => setToast(null), 3000);
        },
    });

    // Freeze-used card shown = the freeze event happened (once per day).
    const freezeTracked = useRef(false);
    if ((data as any)?.freeze_used_yesterday && !freezeTracked.current) {
        freezeTracked.current = true;
        track('freeze_used');
    }

    const skipMutation = useMutation({
        mutationFn: (t: PlannerTask) => api.skipPlannerTask(t.schedule_id!, t.task_id!),
        onMutate: async (t) => {
            haptic('light');
            const ctx = await snapshotAndPatch(patchStatus(t.task_id, 'skipped'));
            track('snooze', { program: t.maxx_id, kind: 'skip_today' });
            setToast('Skipped for today. Tomorrow stays the same.');
            setTimeout(() => setToast(null), 3000);
            return ctx;
        },
        onError: (_e, _t, ctx) => rollback(ctx),
        onSettled: () => queryClient.invalidateQueries({ queryKey: TODAY_QK }),
    });

    const snooze = (t: PlannerTask) => {
        const cur = toMin(t.time);
        const next = Math.min(cur + 90, 23 * 60 + 30);
        const newTime = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
        snoozeMutation.mutate({ t, newTime });
    };

    const read = data?.today_read;
    const dateLabel = now
        .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        .toUpperCase();

    return (
        <ScreenBackdrop>
            <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
                {/* header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.kicker}>{dateLabel}</Text>
                        <Text style={styles.title}>Today</Text>
                    </View>
                    {streak > 0 ? (
                    <View style={{ alignItems: 'center' }}>
                        <View style={[styles.ring, { borderColor: GOLD }]}>
                            <Text style={styles.ringText}>{streak}</Text>
                            {data?.streak_armed_freeze ? (
                                <Ionicons name="snow-outline" size={11} color={GOLD} style={styles.freezeGlyph} />
                            ) : null}
                        </View>
                        <Text style={styles.streakCap}>day streak</Text>
                    </View>
                    ) : null}
                </View>

                {/* status chips */}
                {offline ? (
                    <View style={styles.stateChip}>
                        <Ionicons name="cloud-offline-outline" size={13} color={MUTE} />
                        <Text style={styles.stateChipText}>
                            You're offline. Today's plan is still here, changes sync when you're back.
                        </Text>
                    </View>
                ) : null}

                <ScrollView
                    style={{ flex: 1, marginTop: 8 }}
                    contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 + insets.bottom }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={todayQ.isRefetching}
                            onRefresh={() => todayQ.refetch()}
                            tintColor={INK}
                        />
                    }
                >
                    {/* today read */}
                    {read ? (
                        <View style={styles.readRow}>
                            <Ionicons name={read.icon as any} size={15} color={read.color} />
                            <Text style={[styles.readText, { color: read.color }]}>{read.line}</Text>
                        </View>
                    ) : null}

                    {/* Coach note: ONE quiet line grouped with the status header,
                        never a card competing with the actual task. The only
                        exception is an actionable slip (it has buttons to
                        resolve) - that earns the card down in the NOW zone. */}
                    {!todayQ.isLoading ? (() => {
                        let icon: any = null;
                        let text = '';
                        let onPress: (() => void) | undefined;
                        if (data?.welcome_back) {
                            icon = 'hand-left-outline';
                            text = data.welcome_back.line;
                        } else if ((data as any)?.fresh_start_today) {
                            icon = 'sunny-outline';
                            text = "Yesterday got away. Today's a fresh one.";
                        } else if ((data as any)?.freeze_used_yesterday) {
                            icon = 'snow-outline';
                            text = "Used a freeze for yesterday. Streak's safe.";
                        } else if ((data?.insights?.length ?? 0) > 0) {
                            icon = 'bulb-outline';
                            text = data!.insights[0].text;
                            onPress = () => navigation.navigate('WeeklyReview');
                        } else if (streak > 0 && streak <= 3 && tasks.length > 0) {
                            icon = 'sparkles-outline';
                            text = `Day ${streak} closed. See what Max noticed.`;
                            onPress = () => navigation.navigate('WeeklyReview');
                        }
                        if (!icon) return null;
                        const row = (
                            <View style={styles.noteRow}>
                                <Ionicons name={icon} size={15} color={GOLD} />
                                <Text style={styles.noteText} numberOfLines={2}>{text}</Text>
                                {onPress ? (
                                    <Ionicons name="chevron-forward" size={14} color={MUTE} />
                                ) : null}
                            </View>
                        );
                        return onPress ? (
                            <TouchableOpacity
                                onPress={onPress}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel={text}
                            >
                                {row}
                            </TouchableOpacity>
                        ) : row;
                    })() : null}

                    {/* Locked-in: a quiet confirmation line, not a tall card. */}
                    {!todayQ.isLoading && tasks.length > 0 && data?.locked_in ? (
                        <View style={styles.lockedRow}>
                            <Ionicons name="checkmark-circle" size={16} color={GOLD} />
                            <Text style={styles.lockedText}>Locked in for today</Text>
                        </View>
                    ) : null}

                    {/* loading skeleton: quiet anchor rails, never a spinner */}
                    {todayQ.isLoading ? (
                        <View style={{ marginTop: 16, gap: 14 }}>
                            {[0, 1, 2, 3, 4].map((i) => (
                                <View key={i} style={styles.skelRow}>
                                    <View style={styles.skelTime} />
                                    <View style={styles.skelDot} />
                                    <View style={[styles.skelBar, { width: `${55 + (i % 3) * 12}%` }]} />
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {/* NOW zone: an actionable slip earns a card here. */}
                    {!todayQ.isLoading && (data?.slipped?.length ?? 0) > 0 ? (() => {
                        const slip = data!.slipped[0];
                        const slippedTask = tasks.find((t) => t.task_id === slip.task_id);
                        return (
                            <GlassCard radius={20} style={{ marginTop: 22 }}>
                                <View style={{ padding: 18 }}>
                                    <Text style={styles.slipKicker}>NO STRESS</Text>
                                    <Text style={styles.slipTitle}>
                                        Missed {slip.title?.toLowerCase() || 'one'}
                                    </Text>
                                    <Text style={styles.noticeText}>
                                        {slip.suggested_time
                                            ? 'Here is the fix.'
                                            : 'Tomorrow stays the same. Your streak is safe.'}
                                    </Text>
                                    {slip.suggested_time && slippedTask ? (
                                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                                            <View style={{ flex: 1 }}>
                                                <GlassButton
                                                    variant="primary"
                                                    label={`Do it at ${fmtTime(slip.suggested_time)}`}
                                                    onPress={() =>
                                                        snoozeMutation.mutate({
                                                            t: slippedTask,
                                                            newTime: slip.suggested_time!,
                                                        })
                                                    }
                                                />
                                            </View>
                                            <GlassButton
                                                variant="glass"
                                                label="Skip today"
                                                style={{ width: 110 }}
                                                onPress={() => skipMutation.mutate(slippedTask)}
                                            />
                                        </View>
                                    ) : null}
                                </View>
                            </GlassCard>
                        );
                    })() : null}

                    {/* morning lock-in (pre-lock only; once locked it's the slim row above) */}
                    {!todayQ.isLoading && isMorning && !data?.locked_in && tasks.length > 0 ? (
                        <GlassCard radius={20} style={{ marginTop: 22 }}>
                            <View style={styles.bannerInner}>
                                <Text style={styles.bannerTitle}>Lock in today</Text>
                                <Text style={styles.bannerSub}>
                                    {data?.held_back_count
                                        ? `Looks right. ${data.held_back_count} thing${data.held_back_count > 1 ? 's' : ''} held for a lighter day.`
                                        : 'Looks right. Your day is built around your real schedule.'}
                                </Text>
                                <View style={{ marginTop: 12 }}>
                                    <SlideToConfirm
                                        confirmed={!!data?.locked_in}
                                        onConfirm={() => lockInMutation.mutate()}
                                    />
                                </View>
                            </View>
                        </GlassCard>
                    ) : null}

                    {/* NEXT UP hero — the one dominant action */}
                    {!todayQ.isLoading && nextUp && !isEvening ? (
                        <>
                            <Text style={[styles.label, { marginTop: 22, marginBottom: 8 }]}>NEXT UP</Text>
                            <GlassCard radius={24} style={styles.heroCard}>
                                <View style={{ padding: 20 }}>
                                    <Text style={styles.heroTime}>
                                        {fmtTime(nextUp.time)}
                                        {relativeLine(toMin(nextUp.time), nowMin)
                                            ? `  ·  ${relativeLine(toMin(nextUp.time), nowMin)}`
                                            : ''}
                                    </Text>
                                    {nextUp.why ? (
                                        <Text style={styles.heroWhy}>{nextUp.why}</Text>
                                    ) : null}
                                    <Text style={styles.heroTitle}>{displayTitle(nextUp.title)}</Text>
                                    {data?.leave_by && data.leave_by.task_id === nextUp.task_id ? (
                                        <View style={styles.leaveByRow}>
                                            <Ionicons name="navigate-outline" size={13} color={GOLD} />
                                            <Text style={styles.leaveByText}>
                                                {data.leave_by.line}
                                                {data.leave_by.estimated ? ' (rough estimate)' : ''}
                                            </Text>
                                        </View>
                                    ) : null}
                                    {nextUp.description ? (
                                        <Text style={styles.heroDesc} numberOfLines={2}>
                                            {nextUp.description}
                                        </Text>
                                    ) : null}
                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' }}>
                                        <View style={{ flex: 1 }}>
                                            <GlassButton
                                                variant="primary"
                                                label="Done"
                                                onPress={() => markDone(nextUp)}
                                            />
                                        </View>
                                        <GlassButton
                                            variant="glass"
                                            label="Snooze"
                                            onPress={() => snooze(nextUp)}
                                            style={{ width: 110 }}
                                        />
                                    </View>
                                </View>
                            </GlassCard>
                        </>
                    ) : null}

                    {/* evening close-out */}
                    {!todayQ.isLoading && isEvening && tasks.length > 0 ? (
                        <GlassCard radius={26} intensity={44} style={{ marginTop: 14 }}>
                            <View style={{ padding: 20 }}>
                                <Text style={styles.heroTitle}>That's today. Nice work.</Text>
                                {completed.length > 0 ? (
                                    <View style={{ marginTop: 10, gap: 6 }}>
                                        {completed.map((t) => (
                                            <View key={t.task_id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons name="checkmark-circle" size={15} color={GOLD} />
                                                <Text style={styles.closeoutItem}>  {displayTitle(t.title)}</Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={styles.heroDesc}>Tomorrow is a fresh one.</Text>
                                )}
                            </View>
                        </GlassCard>
                    ) : null}

                    {/* YOUR DAY timeline — a clearly separated zone */}
                    {!todayQ.isLoading && timeline.length > 0 ? (
                        <>
                            <View style={styles.zoneDivider} />
                            <Text style={[styles.label, { marginBottom: 8 }]}>YOUR DAY</Text>
                            <GlassCard radius={24}>
                                <View style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                                    {timeline.map((row, i) => {
                                        if (row.kind === 'struct') {
                                            const range = (row as any).end
                                                ? `${fmtTime(row.time)} - ${fmtTime((row as any).end)}`
                                                : fmtTime(row.time);
                                            return (
                                                <View key={`s${i}`} style={styles.trow}>
                                                    <Text style={styles.trTime}>{fmtTime(row.time)}</Text>
                                                    <View style={[styles.trDot, { backgroundColor: 'rgba(17,17,19,0.2)' }]} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.trTitle, { color: MUTE, fontFamily: 'Matter-Medium' }]}>
                                                            {row.label}
                                                        </Text>
                                                        {(row as any).end ? (
                                                            <Text style={styles.trWhy}>{range}</Text>
                                                        ) : null}
                                                    </View>
                                                </View>
                                            );
                                        }
                                        const t = row.task!;
                                        const isDone = t.status === 'completed';
                                        const isSkipped = t.status === 'skipped';
                                        return (
                                            <View key={t.task_id || `t${i}`} style={styles.trow}>
                                                <Text style={styles.trTime}>{fmtTime(t.time)}</Text>
                                                {/* The check circle IS the completion control -
                                                    explicit, familiar, 44pt. Tapping the row body
                                                    opens actions instead of silently completing. */}
                                                <TouchableOpacity
                                                    onPressIn={() => haptic('selection')}
                                                    onPress={() =>
                                                        isDone ? undoMutation.mutate(t) : markDone(t)
                                                    }
                                                    accessibilityRole="checkbox"
                                                    accessibilityState={{ checked: isDone }}
                                                    accessibilityLabel={`${t.title}, ${isDone ? 'done, tap to undo' : 'mark done'}`}
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
                                                    style={styles.checkWrap}
                                                >
                                                    <Ionicons
                                                        name={isDone ? 'checkmark-circle' : isSkipped ? 'remove-circle-outline' : 'ellipse-outline'}
                                                        size={22}
                                                        color={isDone ? GOLD : isSkipped ? MUTE : 'rgba(17,17,19,0.35)'}
                                                    />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={{ flex: 1 }}
                                                    activeOpacity={0.7}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${t.title}, options`}
                                                    onPress={() => setTaskSheet(t)}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <Text
                                                            style={[
                                                                styles.trTitle,
                                                                (isDone || isSkipped) && { color: MUTE, textDecorationLine: 'line-through' },
                                                            ]}
                                                        >
                                                            {displayTitle(t.title)}
                                                        </Text>
                                                        {t.locked ? (
                                                            <Ionicons name="lock-closed" size={12} color={MUTE} style={{ marginLeft: 6 }} />
                                                        ) : null}
                                                        {programCount > 1 && (t.provenance?.creator_handle || t.maxx_id) ? (
                                                            <View style={styles.provBadge}>
                                                                <Text style={styles.provText}>
                                                                    {t.provenance?.creator_handle
                                                                        ? `@${t.provenance.creator_handle}`
                                                                        : t.maxx_id}
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                    {t.why ? <Text style={styles.trWhy}>{t.why}</Text> : null}
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            </GlassCard>
                        </>
                    ) : null}

                    {/* failed first load: never lie with the empty state */}
                    {todayQ.isError && !data ? (
                        <GlassCard radius={24} intensity={36} style={{ marginTop: 16 }}>
                            <View style={{ padding: 24, alignItems: 'center' }}>
                                <Ionicons name="cloud-offline-outline" size={22} color={MUTE} />
                                <Text style={[styles.heroTitle, { fontSize: 22, marginTop: 10 }]}>
                                    Couldn't load your day
                                </Text>
                                <Text style={[styles.heroDesc, { textAlign: 'center' }]}>
                                    Check your connection and try again.
                                </Text>
                                <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
                                    <GlassButton
                                        variant="primary"
                                        label="Try again"
                                        onPress={() => todayQ.refetch()}
                                    />
                                </View>
                            </View>
                        </GlassCard>
                    ) : null}

                    {/* empty day */}
                    {todayQ.isSuccess && tasks.length === 0 ? (
                        <GlassCard radius={24} intensity={36} style={{ marginTop: 16 }}>
                            <View style={{ padding: 24, alignItems: 'center' }}>
                                <Ionicons name="calendar-outline" size={22} color={MUTE} />
                                <Text style={[styles.heroTitle, { fontSize: 22, marginTop: 10 }]}>Nothing on today</Text>
                                <Text style={[styles.heroDesc, { textAlign: 'center' }]}>
                                    Pick your programs in Explore.
                                </Text>
                                <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
                                    <GlassButton
                                        variant="primary"
                                        label="Go to Explore"
                                        onPress={() => navigation.navigate('Explore')}
                                    />
                                </View>
                            </View>
                        </GlassCard>
                    ) : null}

                    {/* held back chip */}
                    {!todayQ.isLoading && (data?.held_back_count ?? 0) > 0 ? (
                        <TouchableOpacity
                            style={styles.heldChip}
                            onPress={() => setShowHeldBack(true)}
                            accessibilityRole="button"
                            accessibilityLabel={`${data!.held_back_count} held back today`}
                        >
                            <Ionicons name="moon-outline" size={13} color={MUTE} />
                            <Text style={styles.heldChipText}>
                                Lightened today · {data!.held_back_count}
                            </Text>
                        </TouchableOpacity>
                    ) : null}

                    {!todayQ.isLoading && tasks.length > 0 ? (
                        <TouchableOpacity onPress={() => navigation.navigate('DayPlanner')}>
                            <Text style={styles.weeklink}>See the full week</Text>
                        </TouchableOpacity>
                    ) : null}
                </ScrollView>

                {/* undo snackbar */}
                {undo ? (
                    <View style={[styles.snackbar, { bottom: 70 + insets.bottom }]}>
                        <Text style={styles.snackText}>Done</Text>
                        <TouchableOpacity
                            onPress={fireUndo}
                            accessibilityRole="button"
                            accessibilityLabel="Undo"
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <Text style={styles.snackUndo}>Undo</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
                {toast && !undo ? (
                    <View style={[styles.snackbar, { bottom: 70 + insets.bottom }]}>
                        <Text style={styles.snackText}>{toast}</Text>
                        {toastAction ? (
                            <TouchableOpacity
                                onPress={toastAction.run}
                                accessibilityRole="button"
                                accessibilityLabel={toastAction.label}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            >
                                <Text style={styles.snackUndo}>{toastAction.label}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : null}

                {/* task action sheet: row tap = choices, never a silent toggle */}
                {taskSheet ? (
                    <View style={styles.sheetBackdrop}>
                        <TouchableOpacity
                            style={StyleSheet.absoluteFill}
                            onPress={() => setTaskSheet(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        />
                        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
                            <Text style={styles.sheetTitle}>{displayTitle(taskSheet.title)}</Text>
                            <Text style={styles.sheetSub}>
                                {fmtTime(taskSheet.time)}
                                {taskSheet.why ? `  ·  ${taskSheet.why}` : ''}
                            </Text>
                            {taskSheet.description ? (
                                <Text style={[styles.sheetSub, { marginTop: 8 }]} numberOfLines={3}>
                                    {taskSheet.description}
                                </Text>
                            ) : null}
                            <View style={{ gap: 10, marginTop: 18 }}>
                                {taskSheet.status !== 'completed' ? (
                                    <GlassButton
                                        variant="primary"
                                        label="Done"
                                        onPress={() => { const t = taskSheet; setTaskSheet(null); if (t) markDone(t); }}
                                    />
                                ) : (
                                    <GlassButton
                                        variant="primary"
                                        label="Undo done"
                                        onPress={() => { const t = taskSheet; setTaskSheet(null); if (t) undoMutation.mutate(t); }}
                                    />
                                )}
                                {taskSheet.status !== 'completed' ? (
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <GlassButton
                                                variant="glass"
                                                label="Move later today"
                                                onPress={() => { const t = taskSheet; setTaskSheet(null); if (t) snooze(t); }}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <GlassButton
                                                variant="glass"
                                                label="Skip today"
                                                onPress={() => { const t = taskSheet; setTaskSheet(null); if (t) skipMutation.mutate(t); }}
                                            />
                                        </View>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                    </View>
                ) : null}

                {/* held-back sheet (plain overlay - RN Modal is broken on web) */}
                {showHeldBack ? (
                    <View style={styles.sheetBackdrop}>
                        <TouchableOpacity
                            style={StyleSheet.absoluteFill}
                            onPress={() => setShowHeldBack(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        />
                        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
                            <Text style={styles.sheetTitle}>Moved to keep today doable</Text>
                            <Text style={styles.sheetSub}>
                                Here's what moved and why.
                            </Text>
                            {(heldBackQ.data?.items ?? []).map((item, i) => (
                                <View key={i} style={styles.sheetRow}>
                                    <Text style={styles.sheetItemTitle}>{item.title}</Text>
                                    <Text style={styles.sheetItemSub}>
                                        {item.reason}
                                        {item.returns_on ? ` Back ${item.returns_on}.` : ''}
                                    </Text>
                                    <Text style={styles.sheetItemProg}>{item.program_id}</Text>
                                </View>
                            ))}
                            {heldBackQ.isLoading ? (
                                <Text style={styles.sheetSub}>Loading...</Text>
                            ) : null}
                        </View>
                    </View>
                ) : null}
            </View>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 22,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: MUTE },
    title: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 40, color: INK, letterSpacing: -1, marginTop: 2 },
    ring: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2.5,
        borderColor: 'rgba(17,17,19,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringText: { fontFamily: 'Matter-SemiBold', fontSize: 13, color: INK },
    freezeGlyph: { position: 'absolute', top: -2, right: -2 },
    streakCap: { fontFamily: 'Matter-Medium', fontSize: 10, color: MUTE, marginTop: 3 },
    label: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.4, color: MUTE },
    readRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    readText: { fontFamily: 'Matter-Medium', fontSize: 13.5 },
    stateChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        marginHorizontal: 22,
        marginTop: 8,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: '#EFE7DC',
        borderWidth: 1,
        borderColor: '#E2DBCD',
    },
    stateChipText: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE },
    noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    // Slim coach-note row: grouped with the status header, never a card.
    noteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        paddingVertical: 2,
    },
    noteText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#5C574E', lineHeight: 19 },
    lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
    lockedText: { fontFamily: 'Matter-Medium', fontSize: 13, color: '#5C574E' },
    // Clear separator between the NOW zone and the YOUR DAY zone.
    zoneDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(28,26,23,0.12)',
        marginTop: 28,
        marginBottom: 18,
    },
    heroCard: { marginTop: 0 },
    leaveByRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
    leaveByText: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: '#1F4FB0' },
    slipKicker: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.6, color: GOLD },
    slipTitle: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 22, color: INK, marginTop: 3 },
    noticeTitle: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK },
    noticeText: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#5C574E', flexShrink: 1 },
    bannerInner: { padding: 18 },
    bannerTitle: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 22, color: INK },
    bannerSub: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#5C574E', marginTop: 4, lineHeight: 20 },
    heroTime: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: GOLD, letterSpacing: 0.3 },
    heroWhy: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 2 },
    heroTitle: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 28, color: INK, marginTop: 4, letterSpacing: -0.4 },
    heroDesc: { fontFamily: 'Matter-Regular', fontSize: 14, color: MUTE, marginTop: 6, lineHeight: 21 },
    closeoutItem: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: INK },
    trow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, minHeight: 44 },
    trTime: { fontFamily: 'Matter-Medium', fontSize: 12, color: MUTE, width: 52, paddingTop: 1 },
    trDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, marginRight: 12 },
    checkWrap: { marginRight: 10, marginTop: -1, minWidth: 28, alignItems: 'center' },
    trTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    trWhy: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 1 },
    provBadge: {
        marginLeft: 8,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: 'rgba(44,107,237,0.14)',
    },
    provText: { fontFamily: 'Matter-Medium', fontSize: 10, color: '#1F4FB0' },
    heldChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'center',
        marginTop: 16,
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2DBCD',
        minHeight: 32,
    },
    heldChipText: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: MUTE },
    weeklink: {
        fontFamily: 'Matter-Medium',
        fontSize: 13,
        color: MUTE,
        textDecorationLine: 'underline',
        textAlign: 'center',
        marginTop: 16,
        paddingVertical: 8,
    },
    skelRow: { flexDirection: 'row', alignItems: 'center' },
    skelTime: { width: 40, height: 10, borderRadius: 5, backgroundColor: 'rgba(17,17,19,0.07)' },
    skelDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(17,17,19,0.1)', marginHorizontal: 12 },
    skelBar: { height: 14, borderRadius: 7, backgroundColor: 'rgba(17,17,19,0.07)' },
    snackbar: {
        position: 'absolute',
        left: 24,
        right: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(17,17,19,0.92)',
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    snackText: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: '#fff' },
    snackUndo: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: GOLD, paddingLeft: 16 },
    sheetBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#FCFCFE',
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        padding: 22,
    },
    sheetTitle: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 24, color: INK },
    sheetSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 4 },
    sheetRow: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(17,17,19,0.1)',
    },
    sheetItemTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    sheetItemSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#5C574E', marginTop: 2 },
    sheetItemProg: { fontFamily: 'Matter-Medium', fontSize: 11, color: MUTE, marginTop: 3 },
});

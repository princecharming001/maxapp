/**
 * Reveal v2 (spec 3.3 steps 5-7, flag `revealV2`) - renders behind the
 * existing RoutineReveal route name when the flag is on.
 *
 * Phase A  REVEAL: the 3-act choreography over the user's REAL starter day
 *          (fetched from /planner/today after the onboarding save generated
 *          it). Close-line interpolates their inputs + motivation.
 * Phase B  NOTIFICATIONS pre-prompt - the ONLY permission ask in
 *          onboarding, skippable, value-first, equal-weight decline.
 * Phase C  FACE SCAN offer - obviously skippable ("later or never").
 *
 * Finishing marks onboarding completed=true; with onboardingV2 on, the
 * root navigator then lands the user on Main (Today) - free until the
 * marketplace.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import { RevealRailSkeleton } from '../../components/reveal/RevealChoreography';
import DayOneStats, { type QuestTask } from '../../components/reveal/DayOneStats';
import { useAuth } from '../../context/AuthContext';
import { getIosApnsDeviceTokenForBackend } from '../../services/registerIosPushToken';
import { track } from '../../lib/analytics';
import api from '../../services/api';

const INK = '#1C1A17';
const GOLD = '#2C6BED';
const MUTE = '#97928A';
const SUB = '#5C574E';

function fmt12(hhmm?: string): string {
    if (!hhmm || !hhmm.includes(':')) return '';
    const [hs, ms] = hhmm.split(':');
    let h = parseInt(hs, 10);
    const suffix = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}:${ms}${suffix}`;
}

function toMin(hhmm?: string): number {
    if (!hhmm || !hhmm.includes(':')) return 0;
    const [h, m] = hhmm.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
}

export default function RevealV2Screen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { user, refreshUser } = useAuth();
    const [phase, setPhase] = useState<'reveal' | 'notifications' | 'scan'>('reveal');
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState(false);

    const todayQ = useQuery({
        queryKey: ['plannerToday', 'reveal'],
        queryFn: () => api.getPlannerToday(),
        staleTime: 0,
    });

    const todayData = todayQ.data;
    const todayLoading = todayQ.isLoading;
    const todayError = todayQ.isError;

    // Prefer the answers passed by the funnel (fresh, race-free); fall back
    // to the persisted user record.
    const ob = (route.params?.ob ?? user?.onboarding ?? {}) as Record<string, any>;

    // The user's #1 priority max — drives the forced "tailor your plan" chat
    // right after onboarding. `goals` is already an ordered list of maxx ids
    // (first = top); fall back to mapping the priority_order token.
    const topMax: string | null = useMemo(() => {
        const byToken: Record<string, string> = {
            skin: 'skinmax', body: 'fitmax', hair: 'hairmax', height: 'heightmax', face_structure: 'bonemax',
        };
        if (Array.isArray(ob.goals) && ob.goals[0]) return String(ob.goals[0]);
        const tok = Array.isArray(ob.priority_order) ? ob.priority_order[0] : undefined;
        return (tok && byToken[tok]) || null;
    }, [ob.goals, ob.priority_order]);

    const { tasks, wake, windDown } = useMemo(() => {
        const data = todayData;
        const list: (QuestTask & { sortKey: number })[] = [];
        let w = '';
        let wd = '';
        for (const sct of data?.structure ?? []) {
            const lbl = (sct.label || '').toLowerCase();
            if (lbl.includes('wake')) w = fmt12(sct.time);
            else if (lbl.includes('sleep') || lbl.includes('wind') || lbl.includes('bed')) wd = fmt12(sct.time);
        }
        for (const t of data?.tasks ?? []) {
            list.push({ time: fmt12(t.time), title: t.title || 'Task', why: t.why || undefined, sortKey: toMin(t.time) });
        }
        list.sort((a, b) => a.sortKey - b.sortKey);
        return {
            tasks: list.map(({ sortKey: _s, ...t }) => t as QuestTask),
            wake: w || fmt12(ob.wake_time),
            windDown: wd || fmt12(Array.isArray(ob.wind_down_window) ? ob.wind_down_window[1] : ob.sleep_time),
        };
    }, [todayQ.data, ob.wake_time, ob.sleep_time, ob.wind_down_window]);

    const taskCount = tasks.length;
    const closeLine =
        'Just a taste — not your real plan yet. Once you start, Max builds something far ' +
        'deeper and hyper-personalized, tuned to your goals, your body, and your day.';

    // Fire once when the real starter day has loaded.
    useEffect(() => {
        if (taskCount > 0) track('reveal_completed', { tasks: taskCount });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskCount > 0]);

    // `goChatSetup` (default) hands the user straight into a short, guided chat
    // with Max to tailor their #1 max — they answer the few personalization
    // questions the starter routine is still missing, which upgrades the thin
    // starter into the full plan. The scan path opts out (scan is its own tune).
    const completeOnboarding = async (goChatSetup = true) => {
        setBusy(true);
        try {
            await api.saveOnboarding({ ...(ob as any), completed: true });
            await refreshUser();
            // The root stack swaps on completion; steer explicitly via the
            // shared ref so web URL-linking can't restore this stale route.
            const { navigationRef } = require('../../lib/navigationRef');
            setTimeout(() => {
                if (!navigationRef.isReady()) return;
                if (goChatSetup && topMax) {
                    track('onboarding_chat_setup', { max: topMax });
                    (navigationRef as any).navigate('Main', {
                        screen: 'Chat',
                        params: { initSchedule: topMax, setup: true },
                    });
                } else {
                    (navigationRef as any).navigate('Main');
                }
            }, 350);
        } catch {
            setBusy(false);
            setSaveError(true);
        }
    };

    const enableNotifications = async () => {
        setBusy(true);
        try {
            if (Platform.OS === 'ios') {
                const token = await getIosApnsDeviceTokenForBackend();
                if (token) await api.registerPushToken(token).catch(() => {});
            }
        } finally {
            setBusy(false);
            setPhase('scan');
        }
    };

    return (
        <ScreenBackdrop>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingTop: insets.top + 28,
                    paddingHorizontal: 22,
                    paddingBottom: insets.bottom + 24,
                    flexGrow: 1,
                }}
                showsVerticalScrollIndicator={false}
            >
                {phase === 'reveal' ? (
                    <>
                        <Text style={styles.kicker}>STARTER PLAN</Text>
                        <Text style={styles.title}>Here's a <Text style={{ fontFamily: 'Fraunces-Italic' }}>taste</Text></Text>
                        {todayLoading ? (
                            <View style={{ marginTop: 22 }}><RevealRailSkeleton /></View>
                        ) : todayError ? (
                            <View style={{ marginTop: 24 }}>
                                <Text style={styles.sub}>Couldn't load your day. Check your connection and try again.</Text>
                                <View style={{ marginTop: 14 }}>
                                    <GlassButton variant="glass" label="Try again" onPress={() => todayQ.refetch()} />
                                </View>
                            </View>
                        ) : taskCount === 0 ? (
                            <Text style={[styles.sub, { marginTop: 22 }]}>
                                Your day is set up. Next, a few quick questions so Max can tailor it to you.
                            </Text>
                        ) : (
                            <View style={{ marginTop: 22 }}>
                                <DayOneStats focusMax={topMax} wake={wake} windDown={windDown} tasks={tasks} />
                                <Text style={styles.closeLine}>{closeLine}</Text>
                            </View>
                        )}
                        <View style={{ marginTop: 'auto', paddingTop: 24 }}>
                            <GlassButton
                                variant="primary"
                                label={taskCount === 0 && !todayLoading && !todayError ? 'Continue' : 'Looks right'}
                                disabled={todayLoading}
                                onPress={() => setPhase('notifications')}
                            />
                        </View>
                    </>
                ) : null}

                {phase === 'notifications' ? (
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={styles.kicker}>ONE THING</Text>
                        <Text style={styles.title}>Want Max to remind{'\n'}you at your times?</Text>
                        <Text style={styles.sub}>
                            A few quiet nudges a day, at the moments you set. No spam.
                        </Text>
                        <View style={{ gap: 10, marginTop: 28 }}>
                            <GlassButton
                                variant="primary"
                                label="Turn on reminders"
                                loading={busy}
                                onPress={enableNotifications}
                            />
                            <GlassButton
                                variant="glass"
                                label="Not now"
                                onPress={() => setPhase('scan')}
                            />
                        </View>
                    </View>
                ) : null}

                {phase === 'scan' ? (
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={styles.kicker}>TOTALLY OPTIONAL</Text>
                        <Text style={styles.title}>A face scan tunes{'\n'}your plan</Text>
                        <Text style={styles.sub}>
                            It sharpens the skin and jaw parts of your routine. Do it later
                            or never. Your plan works either way.
                        </Text>
                        {saveError ? (
                            <Text style={[styles.sub, { color: '#C0452C', marginTop: 10 }]}>
                                Couldn't save. Check your connection and tap again.
                            </Text>
                        ) : null}
                        <View style={{ gap: 10, marginTop: 28 }}>
                            <GlassButton
                                variant="primary"
                                label="Scan now"
                                loading={busy}
                                onPress={async () => {
                                    // Completing onboarding swaps the root stack
                                    // (this navigator unmounts) - navigate via the
                                    // shared ref AFTER the new stack mounts. Scan
                                    // is its own tailoring step, so skip the chat
                                    // setup hand-off here.
                                    await completeOnboarding(false);
                                    const { navigationRef } = require('../../lib/navigationRef');
                                    setTimeout(() => {
                                        if (navigationRef.isReady()) {
                                            (navigationRef as any).navigate('FaceScan');
                                        }
                                    }, 400);
                                }}
                            />
                            <GlassButton
                                variant="glass"
                                label="Skip for now"
                                loading={busy}
                                onPress={completeOnboarding}
                            />
                        </View>
                    </View>
                ) : null}
            </ScrollView>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: GOLD },
    title: {
        fontFamily: 'PlayfairDisplay-Regular',
        fontSize: 36,
        color: INK,
        letterSpacing: -0.8,
        marginTop: 8,
        lineHeight: 42,
    },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: MUTE, marginTop: 12, lineHeight: 22 },
    closeLine: {
        fontFamily: 'Matter-Regular',
        fontSize: 13.5,
        color: SUB,
        lineHeight: 20,
        textAlign: 'center',
        marginTop: 18,
        paddingHorizontal: 6,
    },
});

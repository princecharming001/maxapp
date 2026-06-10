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
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import RevealChoreography, {
    RevealRailSkeleton,
    type RevealRow,
} from '../../components/reveal/RevealChoreography';
import { useAuth } from '../../context/AuthContext';
import { getIosApnsDeviceTokenForBackend } from '../../services/registerIosPushToken';
import api from '../../services/api';

const INK = '#111113';
const GOLD = '#D4A017';
const MUTE = '#8A8A92';

const MOTIVATION_CLOSE: Record<string, string> = {
    event: 'with time to spare before your date.',
    photos: 'small daily wins you will see in photos.',
    comment: 'quiet, steady proof. No announcements needed.',
    long_term: 'no rush. Built to hold for the long run.',
    curious: 'try it for a day and see.',
};

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
    const insets = useSafeAreaInsets();
    const { user, refreshUser } = useAuth();
    const [phase, setPhase] = useState<'reveal' | 'notifications' | 'scan'>('reveal');
    const [revealSettled, setRevealSettled] = useState(false);
    const [busy, setBusy] = useState(false);

    const todayQ = useQuery({
        queryKey: ['plannerToday', 'reveal'],
        queryFn: () => api.getPlannerToday(),
        staleTime: 0,
    });

    const ob = (user?.onboarding ?? {}) as Record<string, any>;

    const rows: RevealRow[] = useMemo(() => {
        const data = todayQ.data;
        if (!data) return [];
        const raw: (RevealRow & { sortKey: number })[] = [];
        for (const s of data.structure ?? []) {
            raw.push({ kind: 'struct', time: fmt12(s.time), label: s.label, sortKey: toMin(s.time) });
        }
        for (const t of data.tasks ?? []) {
            raw.push({
                kind: 'task',
                time: fmt12(t.time),
                title: t.title || 'Task',
                why: t.why || undefined,
                sortKey: toMin(t.time),
            });
        }
        raw.sort((a, b) => a.sortKey - b.sortKey);
        return raw.map(({ sortKey: _sk, ...row }) => row as RevealRow);
    }, [todayQ.data]);

    const taskCount = rows.filter((r) => r.kind === 'task').length;
    const closeLine = useMemo(() => {
        const wake = fmt12(ob.wake_time || '07:00');
        const motivationTail = MOTIVATION_CLOSE[ob.motivation as string] ?? 'built around your real day.';
        return `Built around your ${wake} wake. ${taskCount} thing${taskCount === 1 ? '' : 's'}, ${motivationTail}`;
    }, [ob.wake_time, ob.motivation, taskCount]);

    const completeOnboarding = async () => {
        setBusy(true);
        try {
            await api.saveOnboarding({ ...(ob as any), completed: true });
            await refreshUser();
            // With onboardingV2 on, the root navigator now swaps to Main (Today).
        } catch {
            setBusy(false);
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
                        <Text style={styles.kicker}>YOUR FIRST DAY, BUILT</Text>
                        <Text style={styles.title}>Here's your{'\n'}next 24 hours</Text>
                        {todayQ.isLoading ? (
                            <RevealRailSkeleton />
                        ) : (
                            <View style={{ marginTop: 20 }}>
                                <RevealChoreography
                                    rows={rows}
                                    scope="first-day"
                                    closeLine={closeLine}
                                    onComplete={() => setRevealSettled(true)}
                                />
                            </View>
                        )}
                        <View style={{ marginTop: 'auto', paddingTop: 24 }}>
                            <GlassButton
                                variant="primary"
                                label="Looks right"
                                disabled={todayQ.isLoading || !revealSettled}
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
                            That's how the plan actually happens. A few quiet nudges a day,
                            at the moments you set. No spam, ever.
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
                        <View style={{ gap: 10, marginTop: 28 }}>
                            <GlassButton
                                variant="primary"
                                label="Scan now"
                                loading={busy}
                                onPress={async () => {
                                    await completeOnboarding();
                                    navigation.navigate('FaceScan');
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
});

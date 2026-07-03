/**
 * Reveal v2 (flag `revealV2`) — renders behind the RoutineReveal route.
 *
 * Phase A  REVEAL: a TASTE of the user's day built from EVERY max they chose in
 *          onboarding (a couple of representative moments each, anchored to their
 *          real wake / wind-down). It is purely illustrative — the app no longer
 *          presets any max after onboarding; the user picks + onboards maxes
 *          themselves in the marketplace (Explore). The close-line says so.
 * Phase B  NOTIFICATIONS pre-prompt — the only permission ask, skippable.
 * Phase C  FACE SCAN offer — obviously skippable.
 *
 * Finishing marks onboarding completed=true and lands the user on Main (Today),
 * which is empty and points them to Explore.
 */
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import RevealChoreography, { type RevealRow } from '../../components/reveal/RevealChoreography';
import { useFlag } from '../../constants/featureFlags';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../lib/analytics';
import api from '../../services/api';

const INK = '#111113';
const GOLD = '#111113';
const MUTE = '#6B6B6B';

// A couple of representative moments per max — the "taste". `bucket` places each
// in the morning / midday / evening so they sort into a believable day.
type Sample = { bucket: 'am' | 'mid' | 'pm'; title: string; why: string };
const SAMPLE: Record<string, Sample[]> = {
    skinmax: [
        { bucket: 'am', title: 'morning skincare', why: 'cleanse, treat, SPF' },
        { bucket: 'pm', title: 'evening skincare', why: 'repair while you sleep' },
    ],
    fitmax: [
        { bucket: 'am', title: 'protein breakfast', why: 'fuel + recovery' },
        { bucket: 'pm', title: 'strength session', why: 'progressive overload' },
    ],
    hairmax: [
        { bucket: 'am', title: 'scalp massage', why: 'stimulate the follicles' },
        { bucket: 'pm', title: 'scalp serum', why: 'consistency compounds' },
    ],
    heightmax: [
        { bucket: 'am', title: 'AM mobility', why: 'open up, stand taller' },
        { bucket: 'pm', title: 'posture decompress', why: "undo the day's slouch" },
    ],
    bonemax: [
        { bucket: 'mid', title: 'mewing practice', why: 'proper tongue posture' },
        { bucket: 'pm', title: 'jaw + chewing', why: 'train the masseter' },
    ],
};
const GOAL_FROM_TOKEN: Record<string, string> = {
    skin: 'skinmax', body: 'fitmax', hair: 'hairmax', height: 'heightmax', face_structure: 'bonemax',
};

function toMin(hhmm?: string): number {
    if (!hhmm || !hhmm.includes(':')) return 0;
    const [h, m] = hhmm.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function fmtMin(min: number): string {
    let h = Math.floor(min / 60) % 24;
    const m = ((min % 60) + 60) % 60;
    const suffix = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')}${suffix}`;
}

export default function RevealV2Screen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { user, refreshUser } = useAuth();
    const faceScanEnabled = useFlag('faceScan');
    const [phase, setPhase] = useState<'reveal' | 'scan'>('reveal');
    const [revealSettled, setRevealSettled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState(false);

    // Prefer the answers passed by the funnel (fresh, race-free); fall back
    // to the persisted user record.
    const ob = (route.params?.ob ?? user?.onboarding ?? {}) as Record<string, any>;

    // Every chosen max, in priority order.
    const goals: string[] = useMemo(() => {
        if (Array.isArray(ob.goals) && ob.goals.length) return ob.goals.map(String);
        const tokens = Array.isArray(ob.priority_order) ? ob.priority_order : [];
        return tokens.map((t: string) => GOAL_FROM_TOKEN[t]).filter(Boolean);
    }, [ob.goals, ob.priority_order]);

    // Build the multi-max taste, anchored to the user's real wake / wind-down.
    const rows: RevealRow[] = useMemo(() => {
        const wakeMin = toMin(ob.wake_time || '07:00') || 420;
        const wdEnd = (Array.isArray(ob.wind_down_window) && ob.wind_down_window[1])
            ? ob.wind_down_window[1]
            : (ob.sleep_time || '23:00');
        const sleepMin = toMin(wdEnd) || 1380;
        const base = { am: wakeMin + 75, mid: 12 * 60 + 30, pm: Math.max(13 * 60, sleepMin - 75) };
        const used = { am: 0, mid: 0, pm: 0 };
        const out: (RevealRow & { sortKey: number })[] = [
            { kind: 'struct', time: fmtMin(wakeMin), label: 'Wake', sortKey: wakeMin },
            { kind: 'struct', time: fmtMin(sleepMin), label: 'Sleep', sortKey: sleepMin },
        ];
        goals.slice(0, 3).forEach((g) => {
            (SAMPLE[g] || []).forEach((s) => {
                const t = base[s.bucket] + used[s.bucket] * 20;
                used[s.bucket] += 1;
                out.push({ kind: 'task', time: fmtMin(t), title: s.title, why: s.why, sortKey: t });
            });
        });
        out.sort((a, b) => a.sortKey - b.sortKey);
        return out.map(({ sortKey: _s, ...r }) => r as RevealRow);
    }, [goals, ob.wake_time, ob.sleep_time, ob.wind_down_window]);

    const taskCount = rows.filter((r) => r.kind === 'task').length;
    const closeLine =
        'Just a taste. Pick your maxes in Explore and Max builds the real plan around your day.';

    // `dest` is where to go after onboarding saves. "Skip for now" → ReferralCode
    // (the referral step that leads on to the paywall). "Scan now" → FaceScan
    // DIRECTLY — routing via the paywall first would flash it for a beat (both
    // live in the same mounted unpaid stack, so we navigate straight to the scan).
    const completeOnboarding = async (dest: 'ReferralCode' | 'FaceScan' = 'ReferralCode') => {
        setBusy(true);
        try {
            await api.saveOnboarding({ ...(ob as any), completed: true });
            await refreshUser();
            const { navigationRef } = require('../../lib/navigationRef');
            setTimeout(() => {
                if (navigationRef.isReady()) (navigationRef as any).navigate(dest);
            }, 350);
        } catch {
            // On the computer/web dev build the local save can fail (no backend);
            // don't trap the user — proceed as a success would. Native/prod shows
            // the real error.
            if (Platform.OS === 'web' && __DEV__) {
                const { navigationRef } = require('../../lib/navigationRef');
                setTimeout(() => {
                    if (navigationRef.isReady()) (navigationRef as any).navigate(dest);
                }, 350);
            } else {
                setBusy(false);
                setSaveError(true);
            }
        }
    };

    return (
        <ScreenBackdrop style={{ backgroundColor: '#F1F1EF' }}>
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
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                            <Text style={styles.title}>Here's your{'\n'}<Text style={{ fontFamily: 'Fraunces-Italic' }}>first</Text> day</Text>
                            {taskCount === 0 ? (
                                <Text style={[styles.sub, { marginTop: 22 }]}>
                                    Your day is set. Pick the maxes you want in Explore and Max builds each
                                    one around it.
                                </Text>
                            ) : (
                                <View style={{ marginTop: 20 }}>
                                    <RevealChoreography
                                        rows={rows}
                                        scope="first-day"
                                        mono
                                        closeLine={closeLine}
                                        onComplete={() => {
                                            setRevealSettled(true);
                                            track('reveal_completed', { tasks: taskCount });
                                        }}
                                    />
                                </View>
                            )}
                        </View>
                        <View style={{ paddingTop: 24 }}>
                            <GlassButton
                                variant="primary"
                                label={taskCount === 0 ? 'Continue' : 'Looks right'}
                                disabled={taskCount > 0 && !revealSettled}
                                onPress={() => {
                                    if (faceScanEnabled) {
                                        setPhase('scan');
                                        track('onboarding_step', { step: 'scan_offered' });
                                    } else {
                                        completeOnboarding();
                                    }
                                }}
                            />
                        </View>
                    </>
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
                                onPress={() => {
                                    track('onboarding_step', { step: 'scan_started' });
                                    completeOnboarding('FaceScan');
                                }}
                            />
                            <GlassButton
                                variant="glass"
                                label="Skip for now"
                                loading={busy}
                                onPress={() => {
                                    track('onboarding_step', { step: 'scan_skipped' });
                                    completeOnboarding('ReferralCode');
                                }}
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

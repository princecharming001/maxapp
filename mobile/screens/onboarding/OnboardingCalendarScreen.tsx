/**
 * Optional "connect Google Calendar" page, shown once after the account is
 * created and before the schedule questions (so the plan can be built around
 * real meetings). Funnel-stack only.
 *
 * Safe to remove at any time — every exit lands on the schedule questions:
 *   - remote flag  `onboardingCalendar: false` in feature_flags_json (no OTA)
 *   - backend      CALENDAR_LINK_ENABLED=false (the page skips itself)
 *   - OTA          flip DEFAULT_FLAGS.onboardingCalendar to false
 * The only caller is CreateAccountScreen.continueToSchedule, and it checks both
 * the flag and that this route is registered before sending anyone here.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { track } from '../../lib/analytics';
import { alertConnectOutcome, openGoogleCalendarAuth } from '../../lib/googleConnect';

const INK = '#000000';
const ON_INK = '#FFFFFF';
const BG = '#F1F1EF';
const CARD = '#FFFFFF';
const SUB = '#6B6B6B';
const SOFT = {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
};

const seenKey = (userId?: string) => `onboarding_calendar_seen:${userId ?? 'anon'}`;
const STATUS_TIMEOUT_MS = 5000;

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    { icon: 'calendar-outline', text: 'Your routine fits around meetings, never on top of them' },
    { icon: 'refresh-outline', text: 'Your plan moves when your week changes' },
    { icon: 'eye-outline', text: 'Read-only. We never change your events' },
];

export default function OnboardingCalendarScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const { user } = useAuth();
    const [ready, setReady] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const leftRef = useRef(false);

    // Always onto the schedule questions; Main only if this somehow mounted
    // outside the funnel stack (reset to a missing route is a silent no-op).
    const goSchedule = () => {
        if (leftRef.current) return;
        leftRef.current = true;
        const routeNames: string[] = ((nav.getState?.() as any)?.routeNames) ?? [];
        if (routeNames.includes('Onboarding')) {
            nav.reset({ index: 0, routes: [{ name: 'Onboarding', params: { phase: 'schedule' } }] });
        } else {
            nav.navigate('Main');
        }
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const seen = await AsyncStorage.getItem(seenKey(user?.id)).catch(() => null);
                if (seen) { goSchedule(); return; }
                const status = await Promise.race([
                    api.getGoogleStatus(),
                    new Promise<null>((r) => setTimeout(() => r(null), STATUS_TIMEOUT_MS)),
                ]);
                if (!alive) return;
                // Nothing to offer: already linked, OAuth not set up, or switched off.
                if (!status || status.connected || !status.oauth_available || status.calendar_link_enabled === false) {
                    goSchedule();
                    return;
                }
                // Shown once: a relaunch mid-funnel goes straight to the questions.
                AsyncStorage.setItem(seenKey(user?.id), '1').catch(() => {});
                track('onboarding_step', { step: 'calendar' });
                setReady(true);
            } catch {
                goSchedule();
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onConnect = async () => {
        if (connecting) return;
        setConnecting(true);
        try {
            const outcome = await openGoogleCalendarAuth();
            const fresh = await api.getGoogleStatus().catch(() => null);
            if (fresh) qc.setQueryData(['googleStatus'], fresh);
            if (outcome === 'connected' || fresh?.connected) {
                track('onboarding_step', { step: 'calendar_connected' });
                goSchedule();
                return;
            }
            // Closed the sheet = stay quietly; real failures explain themselves.
            alertConnectOutcome(outcome);
        } catch {
            alertConnectOutcome('failed');
        } finally {
            setConnecting(false);
        }
    };

    const onSkip = () => {
        track('onboarding_step', { step: 'calendar_skipped' });
        goSchedule();
    };

    if (!ready) return <View style={styles.root} />;

    return (
        <View style={styles.root}>
            <View style={[styles.inner, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.center}>
                    <View style={styles.badge}>
                        <Ionicons name="calendar" size={30} color={INK} />
                    </View>
                    <Text style={styles.title}>{'Plan around\nyour calendar'}</Text>
                    <Text style={styles.sub}>
                        Connect Google Calendar and we'll build your day around what's already on it.
                    </Text>
                    <View style={styles.card}>
                        {POINTS.map((p, i) => (
                            <View key={p.text} style={[styles.point, i > 0 && styles.pointGap]}>
                                <Ionicons name={p.icon} size={20} color={INK} style={{ marginRight: 12 }} />
                                <Text style={styles.pointText}>{p.text}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View>
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={onConnect}
                        disabled={connecting}
                        style={styles.cta}
                        accessibilityRole="button"
                        accessibilityLabel="Connect Google Calendar"
                        accessibilityState={{ busy: connecting }}
                    >
                        {connecting ? <ActivityIndicator color={ON_INK} /> : <Text style={styles.ctaText}>Connect Google Calendar</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onSkip}
                        disabled={connecting}
                        style={styles.skip}
                        accessibilityRole="button"
                        accessibilityLabel="Not now"
                    >
                        <Text style={styles.skipText}>Not now</Text>
                    </TouchableOpacity>
                    <Text style={styles.later}>You can connect it any time in Settings.</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    inner: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'space-between' },
    center: { alignItems: 'center' },
    badge: {
        width: 64, height: 64, borderRadius: 32, backgroundColor: CARD,
        alignItems: 'center', justifyContent: 'center', marginBottom: 22, ...SOFT,
    },
    title: { fontFamily: 'Matter-Bold', fontSize: 30, color: INK, letterSpacing: -0.6, lineHeight: 36, textAlign: 'center' },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, marginTop: 12, lineHeight: 21, textAlign: 'center', paddingHorizontal: 12 },
    card: { width: '100%', marginTop: 28, padding: 18, borderRadius: 22, backgroundColor: CARD, ...SOFT },
    point: { flexDirection: 'row', alignItems: 'center' },
    pointGap: { marginTop: 14 },
    pointText: { flex: 1, fontFamily: 'Matter-Medium', fontSize: 14.5, color: INK, lineHeight: 20 },
    cta: {
        height: 56, minWidth: 200, alignSelf: 'center', paddingHorizontal: 40, borderRadius: 999,
        backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous', ...SOFT,
    },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: ON_INK, letterSpacing: 0.2 },
    skip: { alignSelf: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 },
    skipText: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: SUB },
    later: { fontFamily: 'Matter-Regular', fontSize: 12, color: SUB, textAlign: 'center', marginTop: 4, opacity: 0.8 },
});

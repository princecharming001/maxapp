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
import Svg, { Path, Text as SvgText } from 'react-native-svg';
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

/** The Google Calendar app mark, drawn so it stays crisp at any size. */
function GoogleCalendarLogo({ size }: { size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="Google Calendar">
            <Path fill="#FFFFFF" d="M152.632 47.368H47.368v105.263h105.264z" />
            <Path fill="#EA4335" d="M152.632 200L200 152.632l-23.684-4.041-23.684 4.041-4.322 21.664z" />
            <Path fill="#188038" d="M0 152.632v31.579C0 192.935 7.065 200 15.789 200h31.579l4.863-23.684-4.863-23.684-25.806-4.041z" />
            <Path fill="#1967D2" d="M200 47.368V15.789C200 7.065 192.935 0 184.211 0h-31.579c-2.881 11.746-4.322 20.39-4.322 25.931 0 5.54 1.441 12.686 4.322 21.437 10.476 3 18.37 4.5 23.684 4.5 5.314 0 13.209-1.5 23.684-4.5z" />
            <Path fill="#FBBC04" d="M200 47.368h-47.368v105.263H200z" />
            <Path fill="#34A853" d="M152.632 152.632H47.368V200h105.264z" />
            <Path fill="#4285F4" d="M152.632 0H15.789C7.065 0 0 7.065 0 15.789v136.842h47.368V47.368h105.264z" />
            <SvgText x="100" y="128" fontSize="68" fontWeight="700" fill="#4285F4" textAnchor="middle">31</SvgText>
        </Svg>
    );
}

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
            <View style={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.center}>
                    <View style={styles.logoTile}>
                        <GoogleCalendarLogo size={84} />
                    </View>
                    <Text style={styles.title}>Connect Google Calendar</Text>
                    <Text style={styles.sub}>Your plan fits around your meetings.</Text>
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
                        {connecting ? <ActivityIndicator color={ON_INK} /> : <Text style={styles.ctaText}>Connect</Text>}
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
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    inner: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'space-between' },
    // the logo sits in the optical middle of the screen; the buttons stay at the bottom
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    logoTile: {
        width: 132, height: 132, borderRadius: 34, borderCurve: 'continuous', backgroundColor: CARD,
        alignItems: 'center', justifyContent: 'center', marginBottom: 28, ...SOFT,
    },
    title: { fontFamily: 'Matter-Bold', fontSize: 26, color: INK, letterSpacing: -0.5, lineHeight: 32, textAlign: 'center' },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, marginTop: 8, lineHeight: 21, textAlign: 'center' },
    cta: {
        height: 56, minWidth: 200, alignSelf: 'center', paddingHorizontal: 40, borderRadius: 999,
        backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous', ...SOFT,
    },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: ON_INK, letterSpacing: 0.2 },
    skip: { alignSelf: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 },
    skipText: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: SUB },
});

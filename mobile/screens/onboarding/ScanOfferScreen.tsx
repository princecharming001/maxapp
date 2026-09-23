/**
 * ScanOffer — funnel V4's first screen after "Get started".
 *
 * This IS the old reveal-step scan offer (same backdrop, serif title, glass
 * buttons, copy), promoted to the funnel's front door. Only the navigation
 * changed: Yes → FaceScan capture (the analysis then loads behind the
 * question run); No → straight into the questions with the scan skipped
 * (the results gate is skipped too — intro ends at the paywall instead).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import { track } from '../../lib/analytics';
import { useAuth } from '../../context/AuthContext';
import { funnelResumeTarget, loadOnboardingDraft } from '../../lib/onboardingDraft';
import { signOutToLogin } from '../../lib/signOutToLogin';
import api from '../../services/api';

const INK = '#111113';
const GOLD = '#111113';
const MUTE = '#6B6B6B';

export default function ScanOfferScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        track('onboarding_step', { step: 'scan_offered' });
    }, []);

    // Resume guard. A returning user is forwarded to wherever they actually
    // were — the results gate, the referral step, the paywall, or the quiz
    // at its draft step — instead of being re-offered a scan they already
    // took (or declined). The decision lives in funnelResumeTarget: it only
    // treats a processing/completed scan row as "scanned"; a failed/reaped
    // analysis shows this offer again (rescan or skip), which used to be
    // unreachable — the old guard replaced this screen for a row of ANY
    // status and trapped the user in a quiz↔dead-gate loop.
    const checked = useRef(false);
    useEffect(() => {
        if (checked.current || !user?.id) return;
        checked.current = true;
        const uid = user.id;
        void (async () => {
            const [draft, scan] = await Promise.all([
                loadOnboardingDraft(uid).catch(() => null),
                api.getLatestScan().catch(() => null),
            ]);
            const routes = funnelResumeTarget({ draft, scan });
            // Only redirect while this screen is still the one on screen —
            // if the user already tapped Scan/Skip, their choice wins. A reset
            // (not a bare replace) so the quiz/gate sit beneath the resumed
            // screen and Back keeps working. Every route here is registered
            // on this (auth-unpaid) stack.
            if (routes && nav.isFocused()) {
                nav.dispatch(CommonActions.reset({ index: routes.length - 1, routes }));
            }
        })();
    }, [nav, user?.id]);

    // "Already have an account? Sign in" — the funnel stack has no Login
    // route and, until now, no sign-out either: a returning subscriber who
    // tapped "Get started" was walked through scan + quiz + paywall on a new
    // anon account with no way back. signOutToLogin drops the session and
    // App.tsx forwards to Login once the guest stack is mounted.
    const onSignIn = async () => {
        if (signingOut) return;
        setSigningOut(true);
        track('onboarding_step', { step: 'sign_in_from_scan_offer' });
        try {
            await signOutToLogin(logout);
        } finally {
            setSigningOut(false);
        }
    };

    return (
        <ScreenBackdrop style={{ backgroundColor: '#F1F1EF' }}>
            <View
                style={{
                    flex: 1,
                    paddingTop: insets.top + 28,
                    paddingHorizontal: 22,
                    paddingBottom: insets.bottom + 24,
                    justifyContent: 'center',
                }}
            >
                <Text style={styles.kicker}>TOTALLY OPTIONAL</Text>
                <Text style={styles.title}>A face scan tunes{'\n'}your plan</Text>
                <Text style={styles.sub}>
                    It rates where you are today and sharpens the skin and jaw parts of
                    your routine. Skip it and your plan still works.
                </Text>
                <View style={{ gap: 10, marginTop: 28 }}>
                    <GlassButton
                        variant="primary"
                        label="Scan now"
                        onPress={() => {
                            track('onboarding_step', { step: 'scan_started' });
                            nav.navigate('FaceScan', { funnelV4: true });
                        }}
                    />
                    <GlassButton
                        variant="glass"
                        label="Skip for now"
                        onPress={() => {
                            track('onboarding_step', { step: 'scan_skipped' });
                            nav.navigate('Onboarding', { phase: 'intro', scanSkipped: true });
                        }}
                    />
                </View>
                <TouchableOpacity
                    onPress={() => void onSignIn()}
                    disabled={signingOut}
                    style={styles.signInRow}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Already have an account? Sign in"
                >
                    <Text style={styles.signInText}>
                        Already have an account?{' '}
                        <Text style={styles.signInLink}>{signingOut ? 'Signing out…' : 'Sign in'}</Text>
                    </Text>
                </TouchableOpacity>
            </View>
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
    signInRow: { alignSelf: 'center', marginTop: 22, paddingVertical: 6 },
    signInText: { fontFamily: 'Matter-Regular', fontSize: 14, color: MUTE },
    signInLink: { fontFamily: 'Matter-SemiBold', color: INK, textDecorationLine: 'underline' },
});

/**
 * ScanOffer — funnel V4's first screen after "Get started".
 *
 * This IS the old reveal-step scan offer (same backdrop, serif title, glass
 * buttons, copy), promoted to the funnel's front door. Only the navigation
 * changed: Yes → FaceScan capture (the analysis then loads behind the
 * question run); No → straight into the questions with the scan skipped
 * (the results gate is skipped too — intro ends at the paywall instead).
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import { track } from '../../lib/analytics';
import api from '../../services/api';

const INK = '#111113';
const GOLD = '#111113';
const MUTE = '#6B6B6B';

export default function ScanOfferScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        track('onboarding_step', { step: 'scan_offered' });
    }, []);

    // Resume guard: if a scan already exists (captured on a previous session,
    // analysis maybe still processing), don't offer a re-scan — continue into
    // the question run, which resumes from its draft.
    const checked = useRef(false);
    useEffect(() => {
        if (checked.current) return;
        checked.current = true;
        void api.getLatestScan()
            .then((scan) => {
                // Only redirect while this screen is still the one on screen —
                // if the user already tapped Scan/Skip, their choice wins.
                if (scan && nav.isFocused()) nav.replace('Onboarding', { phase: 'intro' });
            })
            .catch(() => undefined);
    }, [nav]);

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
});

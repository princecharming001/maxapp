/**
 * ScanOffer — funnel V4's first screen after "Get started".
 *
 * The old reveal-step scan offer, promoted to the funnel's front door:
 * Yes → FaceScan capture (the analysis then loads behind the question run);
 * No  → straight into the questions with the scan skipped (the results gate
 * is skipped too — intro ends at the paywall instead).
 *
 * Styled like the V2 quiz (ink on soft-gray, black CTA) so the funnel reads
 * as one continuous flow.
 */
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { track } from '../../lib/analytics';

const INK = '#000000';
const BG = '#F1F1EF';
const SUB = '#6B6B6B';
const GOLD = '#B8860B';

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
            .then((scan) => { if (scan) nav.replace('Onboarding', { phase: 'intro' }); })
            .catch(() => undefined);
    }, [nav]);

    const scanNow = () => {
        track('onboarding_step', { step: 'scan_started' });
        nav.navigate('FaceScan', { funnelV4: true });
    };
    const skip = () => {
        track('onboarding_step', { step: 'scan_skipped' });
        nav.navigate('Onboarding', { phase: 'intro', scanSkipped: true });
    };

    return (
        <View style={[st.root, { paddingTop: insets.top + 14 }]}>
            <View style={st.body}>
                <View style={st.iconWrap}>
                    <Ionicons name="scan-outline" size={26} color={INK} />
                </View>
                <Text style={st.kicker}>30 SECONDS, TOTALLY OPTIONAL</Text>
                <Text style={st.title}>Start with a{'\n'}face scan?</Text>
                <Text style={st.sub}>
                    It rates where you are today and tunes the skin and jaw parts of your plan.
                    Skip it and your plan still works.
                </Text>
            </View>
            <View style={{ paddingBottom: insets.bottom + 16, gap: 10 }}>
                <TouchableOpacity style={st.cta} onPress={scanNow} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Scan my face">
                    <Text style={st.ctaText}>Yes — scan my face</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.skipBtn} onPress={skip} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Skip the scan">
                    <Text style={st.skipText}>No, skip for now</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG, paddingHorizontal: 24, maxWidth: 460, width: '100%', alignSelf: 'center' },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    iconWrap: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center', marginBottom: 18,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }
            : { elevation: 2 }),
    },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: GOLD, marginBottom: 10 },
    title: { fontFamily: 'Matter-Bold', fontSize: 30, color: INK, letterSpacing: -0.6, lineHeight: 36, textAlign: 'center' },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, textAlign: 'center', marginTop: 12, lineHeight: 22, paddingHorizontal: 8 },
    cta: {
        height: 54, borderRadius: 27, borderCurve: 'continuous', backgroundColor: INK,
        alignItems: 'center', justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 5 }),
    },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.2 },
    skipBtn: { alignItems: 'center', paddingVertical: 12 },
    skipText: { fontFamily: 'Matter-Medium', fontSize: 14, color: SUB },
});

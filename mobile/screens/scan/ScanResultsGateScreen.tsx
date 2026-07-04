/**
 * ScanResultsGate — funnel V4's locked scan-results step.
 *
 * Sits between the mid-analysis quiz question and the paywall. Shows ONLY the
 * two headline numbers — Potential and Appeal — with everything else locked;
 * the full breakdown (FaceScanResults) unlocks after purchase. If the analysis
 * is still processing (it runs in the background while the user answers the
 * effort question), this screen polls until it lands.
 *
 * Style matches OnboardingV2 (Cal AI × Stoic: ink on soft-gray canvas, white
 * pill cards) so the funnel reads as one continuous flow.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Animated, Easing, Platform, ScrollView, StyleSheet, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../lib/analytics';

const INK = '#000000';
const BG = '#F1F1EF';
const CARD = '#FFFFFF';
const SUB = '#6B6B6B';
const MUTE = '#9A9A9A';
const HAIR = 'rgba(0,0,0,0.06)';
const SOFT = {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
} as const;

function coerceAnalysis(analysis: unknown): any {
    if (analysis == null) return null;
    if (typeof analysis === 'string') {
        try { return JSON.parse(analysis); } catch { return null; }
    }
    return typeof analysis === 'object' ? analysis : null;
}

function toScore(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v));
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

/** The categories a paying user unlocks — shown locked here to make the gap
 *  concrete. Labels mirror the full results screen. */
const LOCKED_ROWS = ['Overall rating', 'Jawline', 'Skin quality', 'Masculinity', 'Symmetry', 'Your glow-up plan'];

export default function ScanResultsGateScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { isPaid, isFreeTier } = useAuth();
    const [potential, setPotential] = useState<number | null>(null);
    const [appeal, setAppeal] = useState<number | null>(null);
    const [ready, setReady] = useState(false);

    // Poll the latest scan until the analysis lands. The capture happened one
    // quiz question ago, so this is usually already done — the loader is the
    // exception, not the rule.
    const stopped = useRef(false);
    const load = useCallback(async () => {
        try {
            const scan = await api.getLatestScan();
            const a = coerceAnalysis(scan?.analysis);
            if (!a) return false;
            const pr = a?.psl_rating;
            const pot = toScore(pr?.potential) ?? toScore(a?.potential_score);
            const app = toScore(pr?.appeal);
            const overall = toScore(pr?.rating) ?? toScore(a?.overall_score);
            if (pot == null && app == null && overall == null) return false;
            setPotential(pot ?? overall);
            // Appeal is occasionally absent from older analyses — fall back to
            // overall so the card never shows a blank.
            setAppeal(app ?? overall);
            setReady(true);
            return true;
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        track('onboarding_step', { step: 'results_view' });
        stopped.current = false;
        let timer: ReturnType<typeof setTimeout>;
        const tick = async () => {
            if (stopped.current) return;
            const done = await load();
            if (!done && !stopped.current) timer = setTimeout(tick, 2500);
        };
        void tick();
        return () => { stopped.current = true; clearTimeout(timer); };
    }, [load]);

    const unlock = () => {
        track('onboarding_step', { step: 'results_unlock_tapped' });
        // Resume-resilience: an already-paid (or free-tier) user relanding here
        // skips straight to the account step.
        if (isPaid || isFreeTier) nav.navigate('CreateAccount');
        else nav.navigate('Payment');
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
            <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
                {!ready ? (
                    <Analyzing />
                ) : (
                    <>
                        <Text style={styles.title}>Your analysis{'\n'}is in.</Text>
                        <Text style={styles.sub}>Two numbers you should know — and everything underneath them is waiting.</Text>

                        <View style={styles.scoreRow}>
                            <View style={[styles.scoreCard, SOFT]}>
                                <Text style={styles.scoreValue}>{potential?.toFixed(1) ?? '–'}</Text>
                                <Text style={styles.scoreLabel}>POTENTIAL</Text>
                            </View>
                            <View style={[styles.scoreCard, SOFT]}>
                                <Text style={styles.scoreValue}>{appeal?.toFixed(1) ?? '–'}</Text>
                                <Text style={styles.scoreLabel}>APPEAL</Text>
                            </View>
                        </View>

                        <View style={[styles.lockCard, SOFT]}>
                            {LOCKED_ROWS.map((label, i) => (
                                <View key={label}>
                                    {i > 0 ? <View style={styles.hairline} /> : null}
                                    <View style={styles.lockRow}>
                                        <Ionicons name="lock-closed" size={14} color={MUTE} />
                                        <Text style={styles.lockLabel}>{label}</Text>
                                        <Text style={styles.lockValue}>?.?</Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.cta} onPress={unlock} activeOpacity={0.9} accessibilityRole="button">
                            <Text style={styles.ctaText}>Unlock my full results</Text>
                        </TouchableOpacity>
                        <Text style={styles.fine}>Your scan stays on your account — nothing is shared.</Text>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

function Analyzing() {
    const pulse = useRef(new Animated.Value(0.35)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);
    return (
        <View style={styles.analyzing}>
            <Animated.View style={{ opacity: pulse }}>
                <Ionicons name="scan-outline" size={34} color={INK} />
            </Animated.View>
            <Text style={styles.analyzingTitle}>Analyzing your face…</Text>
            <Text style={styles.analyzingSub}>Mapping landmarks, scoring features, building your plan. ~30 seconds.</Text>
            <ActivityIndicator color={INK} style={{ marginTop: 18 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, maxWidth: 460, width: '100%', alignSelf: 'center' },
    title: { fontFamily: 'Matter-Bold', fontSize: 30, color: INK, letterSpacing: -0.6, lineHeight: 36, textAlign: 'center' },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, textAlign: 'center', marginTop: 10, lineHeight: 21 },
    scoreRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    scoreCard: {
        flex: 1, backgroundColor: CARD, borderRadius: 20, borderCurve: 'continuous',
        alignItems: 'center', paddingVertical: 22,
    },
    scoreValue: { fontFamily: 'Matter-Bold', fontSize: 40, color: INK, letterSpacing: -1 },
    scoreLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: MUTE, letterSpacing: 1.4, marginTop: 6 },
    lockCard: { backgroundColor: CARD, borderRadius: 20, borderCurve: 'continuous', paddingHorizontal: 16, marginTop: 14 },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: HAIR },
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
    lockLabel: { flex: 1, fontFamily: 'Matter-Medium', fontSize: 15, color: SUB },
    lockValue: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: MUTE, letterSpacing: 1 },
    cta: {
        marginTop: 22, height: 54, borderRadius: 27, borderCurve: 'continuous', backgroundColor: INK,
        alignItems: 'center', justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 5 }),
    },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.2 },
    fine: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, textAlign: 'center', marginTop: 12 },
    analyzing: { alignItems: 'center', paddingHorizontal: 12 },
    analyzingTitle: { fontFamily: 'Matter-Bold', fontSize: 24, color: INK, marginTop: 16, letterSpacing: -0.4 },
    analyzingSub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});

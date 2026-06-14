import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, fonts } from '../../theme/dark';

interface Props {
    currentStep: number;
}

const STEP_LABELS = [
    'Uploading your photos',
    'Building your facial profile',
    'Preparing your results',
];

function targetForStep(step: number): number {
    if (step <= 0) return 22;
    if (step === 1) return 58;
    return 94;
}

function creepCeiling(step: number): number {
    if (step <= 0) return 38;
    if (step === 1) return 80;
    return 100;
}

// The rotating marble bust (Higgsfield turntable, baked on the cream canvas so
// it floats seamlessly). It IS the loader — a slow 360° spin while we analyze.
const BUST = require('../../assets/bust_rotate.mp4');
const BUST_SIZE = 248;
const TRACK_W = 232;

export default function AnalyzingScreen({ currentStep = 0 }: Props) {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const [pct, setPct] = useState(0);
    const highWater = useRef(0);
    const activeAnim = useRef<Animated.CompositeAnimation | null>(null);
    const fadeAnim = useRef(new Animated.Value(0.5)).current;

    const player = useVideoPlayer(BUST, (p) => {
        p.loop = true;
        p.muted = true;
        p.play();
    });

    // Keep the displayed % monotonically increasing.
    useEffect(() => {
        const id = progressAnim.addListener(({ value }) => {
            const clamped = Math.min(100, Math.max(0, value));
            const safe = Math.max(clamped, highWater.current);
            const rounded = Math.round(safe);
            if (rounded > highWater.current) highWater.current = rounded;
            if (rounded !== pct) setPct(rounded);
        });
        return () => progressAnim.removeListener(id);
    }, [progressAnim]);

    // Ramp toward the step target, then slowly creep beyond it.
    useEffect(() => {
        const target = targetForStep(currentStep);
        const ceiling = creepCeiling(currentStep);
        activeAnim.current?.stop();

        const startTail = (from: number) => {
            if (from >= ceiling) return;
            const remaining = ceiling - from;
            const tailDur = currentStep >= 2
                ? Math.max(8000, remaining * 600)
                : Math.max(20000, remaining * 1400);
            const tail = Animated.timing(progressAnim, {
                toValue: ceiling,
                duration: tailDur,
                easing: Easing.out(Easing.quad),
                useNativeDriver: false,
            });
            activeAnim.current = tail;
            tail.start();
        };

        progressAnim.stopAnimation((raw) => {
            const from = Math.max(typeof raw === 'number' ? raw : 0, highWater.current);
            if (from >= target) {
                startTail(from);
                return;
            }
            const dist = target - from;
            const dur = currentStep >= 2
                ? Math.max(4000, dist * 150)
                : Math.max(10000, dist * 260);
            const ramp = Animated.timing(progressAnim, {
                toValue: target, duration: dur, useNativeDriver: false,
            });
            activeAnim.current = ramp;
            ramp.start(({ finished }) => {
                if (!finished) return;
                startTail(target);
            });
        });

        return () => { activeAnim.current?.stop(); };
    }, [currentStep, progressAnim]);

    // Gentle breathing on the caption.
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0.9, duration: 1900, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 0.5, duration: 1900, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [fadeAnim]);

    const fillWidth = progressAnim.interpolate({
        inputRange: [0, 100], outputRange: [0, TRACK_W], extrapolate: 'clamp',
    });
    const label = STEP_LABELS[Math.min(currentStep, STEP_LABELS.length - 1)];

    return (
        <View style={st.container}>
            <View style={st.center}>
                {/* Rotating marble bust — the loader's hero. Cream-on-cream so it floats. */}
                <VideoView
                    style={st.bust}
                    player={player}
                    contentFit="contain"
                    nativeControls={false}
                    allowsFullscreen={false}
                    allowsPictureInPicture={false}
                    pointerEvents="none"
                />

                <Animated.Text style={[st.label, { opacity: fadeAnim }]}>{label}</Animated.Text>

                <View style={st.barRow}>
                    <View style={st.track}>
                        <Animated.View style={[st.fill, { width: fillWidth }]} />
                    </View>
                    <Text style={st.pct}>{pct}%</Text>
                </View>

                <Text style={st.hint}>Keep the app open. This takes a second.</Text>
            </View>
        </View>
    );
}

const st = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    bust: {
        width: BUST_SIZE,
        height: BUST_SIZE,
        backgroundColor: 'transparent',
    },
    label: {
        fontFamily: fonts.sansMedium,
        fontSize: 15,
        color: colors.foreground,
        letterSpacing: 0.2,
        marginTop: 30,
    },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 18,
        width: TRACK_W + 48,
    },
    track: {
        flex: 1,
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(28,26,23,0.08)',
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 2,
        backgroundColor: colors.foreground,
    },
    pct: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        color: colors.textMuted,
        width: 36,
        textAlign: 'right',
        letterSpacing: -0.2,
    },
    hint: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 12,
        opacity: 0.7,
    },
});

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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

// Ring geometry — one calm progress circle, ink on a faint track, matching the
// onboarding's thin-progress language (just wrapped into a circle here).
const RING = 212;
const R = 96;
const CIRC = 2 * Math.PI * R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function AnalyzingScreen({ currentStep = 0 }: Props) {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const [pct, setPct] = useState(0);
    const highWater = useRef(0);
    const activeAnim = useRef<Animated.CompositeAnimation | null>(null);

    const fadeAnim = useRef(new Animated.Value(0.45)).current;
    const haloSpin = useRef(new Animated.Value(0)).current;
    const heroBreath = useRef(new Animated.Value(1)).current;

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

    // Gentle breathing on the step label.
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0.85, duration: 2000, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 0.45, duration: 2000, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [fadeAnim]);

    // A single faint dotted halo, turning slowly — calm sense of motion.
    useEffect(() => {
        const spin = Animated.loop(
            Animated.timing(haloSpin, {
                toValue: 1, duration: 26000, easing: Easing.linear, useNativeDriver: true,
            }),
        );
        spin.start();
        return () => spin.stop();
    }, [haloSpin]);

    // Very gentle scale breath on the number cluster.
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(heroBreath, {
                    toValue: 1.02, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
                }),
                Animated.timing(heroBreath, {
                    toValue: 1, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [heroBreath]);

    const dashOffset = progressAnim.interpolate({
        inputRange: [0, 100], outputRange: [CIRC, 0], extrapolate: 'clamp',
    });
    const haloRot = haloSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const label = STEP_LABELS[Math.min(currentStep, STEP_LABELS.length - 1)];

    return (
        <View style={st.container}>
            <View style={st.center}>
                <View style={st.ringWrap}>
                    {/* faint dotted halo, slowly turning */}
                    <Animated.View style={[st.halo, { transform: [{ rotate: haloRot }] }]} pointerEvents="none">
                        <Svg width={RING + 44} height={RING + 44}>
                            <Circle
                                cx={(RING + 44) / 2}
                                cy={(RING + 44) / 2}
                                r={(RING + 44) / 2 - 4}
                                fill="none"
                                stroke="rgba(28,26,23,0.07)"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                strokeDasharray="1.5 13"
                            />
                        </Svg>
                    </Animated.View>

                    {/* progress ring — ink on a faint track, starting at top */}
                    <Svg width={RING} height={RING} style={st.ring}>
                        <Circle
                            cx={RING / 2} cy={RING / 2} r={R}
                            fill="none" stroke="rgba(28,26,23,0.08)" strokeWidth={4}
                        />
                        <AnimatedCircle
                            cx={RING / 2} cy={RING / 2} r={R}
                            fill="none" stroke={colors.foreground} strokeWidth={4}
                            strokeLinecap="round"
                            strokeDasharray={`${CIRC} ${CIRC}`}
                            strokeDashoffset={dashOffset}
                        />
                    </Svg>

                    {/* centered percentage */}
                    <Animated.View style={[st.heroNums, { transform: [{ scale: heroBreath }] }]} pointerEvents="none">
                        <Text style={st.num}>{pct}</Text>
                        <Text style={st.pctSign}>%</Text>
                    </Animated.View>
                </View>

                <Animated.Text style={[st.stepText, { opacity: fadeAnim }]}>
                    {label}
                </Animated.Text>
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
    ringWrap: {
        width: RING,
        height: RING,
        justifyContent: 'center',
        alignItems: 'center',
    },
    halo: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ring: {
        position: 'absolute',
        transform: [{ rotate: '-90deg' }],
    },
    heroNums: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    num: {
        fontFamily: fonts.serif,
        fontSize: 68,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -3,
        includeFontPadding: false,
    },
    pctSign: {
        fontFamily: fonts.serif,
        fontSize: 22,
        fontWeight: '400',
        color: colors.textMuted,
        marginLeft: 3,
        marginTop: 10,
        opacity: 0.6,
    },
    stepText: {
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors.foreground,
        textAlign: 'center',
        letterSpacing: 0.2,
        marginTop: 44,
    },
    hint: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 7,
        opacity: 0.7,
    },
});

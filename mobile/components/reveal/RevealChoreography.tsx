/**
 * RevealChoreography (spec 3.3 step 5 / flag revealV2) - the 3-act reveal.
 *
 * ACT 1 (0-600ms): the user's OWN anchors draw in as dim rails - their real
 *   wake/work/sleep numbers, not a stock day.
 * ACT 2: each task springs into its slot (withSpring damping 18 stiffness
 *   170, staggered ~180ms, FIRST task lands <900ms) with a Light impact per
 *   landing and the why-line fading in after.
 * ACT 3: subtle scale breath 1.0 -> 1.015 -> 1.0, ONE Success haptic, the
 *   streak ring draws to 1.
 *
 * Reduced motion: a single 300ms cross-fade of the assembled day, haptics
 * KEPT, VoiceOver announcement of the result. No fake spinners anywhere -
 * callers show the rail skeleton until data is ready.
 *
 * Reused by the post-purchase mini-reveal with `scope` ("first-day" hides
 * the streak ring moment; "new-program" announces landed tasks only).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { GlassCard } from '../glass/GlassCard';
import { useReducedMotion } from '../../hooks/useA11y';

const INK = '#1C1A17';
const GOLD = '#2C6BED';
const MUTE = '#97928A';

export type RevealRow =
    | { kind: 'struct'; time: string; label: string }
    | { kind: 'task'; time: string; title: string; why?: string };

function haptic(kind: 'light' | 'success') {
    if (Platform.OS === 'web') return;
    if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

function TaskRow({ row, index, reduced, accent }: { row: RevealRow; index: number; reduced: boolean; accent: string }) {
    const isTask = row.kind === 'task';
    // ACT 2 timing: first task lands well under 900ms, ~180ms stagger after.
    const delay = isTask ? 550 + index * 180 : 80 + index * 60;
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(isTask ? 18 : 6);
    const whyOpacity = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            opacity.value = withTiming(1, { duration: 300 });
            translateY.value = 0;
            whyOpacity.value = withTiming(1, { duration: 300 });
            return;
        }
        opacity.value = withDelay(delay, withTiming(1, { duration: isTask ? 160 : 320 }));
        translateY.value = withDelay(
            delay,
            withSpring(0, { damping: 18, stiffness: 170 }),
        );
        whyOpacity.value = withDelay(delay + 220, withTiming(1, { duration: 260 }));
        if (isTask) {
            const t = setTimeout(() => haptic('light'), delay + 120);
            return () => clearTimeout(t);
        }
    }, [reduced, delay, isTask, opacity, translateY, whyOpacity]);

    const rowStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));
    const whyStyle = useAnimatedStyle(() => ({ opacity: whyOpacity.value }));

    return (
        <Animated.View style={[styles.trow, rowStyle]}>
            <Text style={styles.trTime}>{row.time}</Text>
            <View
                style={[
                    styles.trDot,
                    { backgroundColor: isTask ? accent : 'rgba(17,17,19,0.2)' },
                ]}
            />
            <View style={{ flex: 1 }}>
                <Text
                    style={[
                        styles.trTitle,
                        !isTask && { color: MUTE, fontFamily: 'Matter-Medium' },
                    ]}
                >
                    {isTask ? (row as any).title : (row as any).label}
                </Text>
                {isTask && (row as any).why ? (
                    <Animated.Text style={[styles.trWhy, whyStyle]}>
                        {(row as any).why}
                    </Animated.Text>
                ) : null}
            </View>
        </Animated.View>
    );
}

export function RevealChoreography({
    rows,
    scope = 'first-day',
    closeLine,
    onComplete,
    mono = false,
}: {
    rows: RevealRow[];
    scope?: 'first-day' | 'new-program';
    closeLine?: string;
    onComplete?: () => void;
    /** Black-and-white palette (no blue accent) — used on the white reveal screen. */
    mono?: boolean;
}) {
    const reduced = useReducedMotion();
    const scale = useSharedValue(1);
    const [showClose, setShowClose] = useState(false);
    const announced = useRef(false);

    const taskCount = useMemo(() => rows.filter((r) => r.kind === 'task').length, [rows]);
    const lastLanding = 550 + Math.max(0, taskCount - 1) * 180 + 320;
    const settledOnce = useRef(false);

    useEffect(() => {
        // ACT 3 fires exactly ONCE - a refetch that changes `rows` must not
        // replay the success haptic / breath / onComplete.
        if (settledOnce.current) return;
        const settleAt = reduced ? 400 : lastLanding;
        const t = setTimeout(() => {
            if (settledOnce.current) return;
            settledOnce.current = true;
            // ACT 3: breath + success + ring.
            if (!reduced) {
                scale.value = withSequence(
                    withTiming(1.015, { duration: 320, easing: Easing.inOut(Easing.quad) }),
                    withTiming(1.0, { duration: 360, easing: Easing.inOut(Easing.quad) }),
                );
            }
            haptic('success');
            setShowClose(true);
            if (!announced.current) {
                announced.current = true;
                AccessibilityInfo.announceForAccessibility?.(
                    `Your day is built. ${taskCount} task${taskCount === 1 ? '' : 's'} placed around your schedule.`,
                );
            }
            onComplete?.();
        }, settleAt);
        return () => clearTimeout(t);
    }, [reduced, lastLanding, taskCount, onComplete, scale]);

    const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const accent = mono ? '#111113' : GOLD;
    let taskIndex = -1;
    let structIndex = -1;

    return (
        <View>
            <Animated.View style={cardStyle}>
                <GlassCard radius={26} intensity={40}>
                    <View style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                        {rows.map((row, i) => {
                            if (row.kind === 'task') taskIndex += 1;
                            else structIndex += 1;
                            return (
                                <TaskRow
                                    key={`${row.kind}-${i}`}
                                    row={row}
                                    index={row.kind === 'task' ? taskIndex : structIndex}
                                    reduced={reduced}
                                    accent={accent}
                                />
                            );
                        })}
                    </View>
                </GlassCard>
            </Animated.View>

            {showClose && closeLine ? (
                <Animated.Text entering={FadeIn.duration(reduced ? 200 : 400)} style={[styles.closeLine, mono && { color: '#6B6B6B' }]}>
                    {closeLine}
                </Animated.Text>
            ) : null}
        </View>
    );
}

/** Rail skeleton shown while reveal data loads (never a spinner). */
export function RevealRailSkeleton() {
    return (
        <View style={{ marginTop: 16, gap: 16 }}>
            {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.skelRow}>
                    <View style={styles.skelTime} />
                    <View style={styles.skelDot} />
                    <View style={[styles.skelBar, { width: `${50 + (i % 3) * 14}%` }]} />
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    trow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9 },
    trTime: { fontFamily: 'Matter-Medium', fontSize: 12, color: MUTE, width: 52, paddingTop: 1 },
    trDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, marginRight: 12 },
    trTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    trWhy: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 1 },
    closeLine: {
        fontFamily: 'Matter-Regular',
        fontSize: 14.5,
        color: '#5C574E',
        lineHeight: 21,
        textAlign: 'center',
        marginTop: 18,
        paddingHorizontal: 10,
    },
    skelRow: { flexDirection: 'row', alignItems: 'center' },
    skelTime: { width: 40, height: 10, borderRadius: 5, backgroundColor: 'rgba(17,17,19,0.07)' },
    skelDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(17,17,19,0.1)', marginHorizontal: 12 },
    skelBar: { height: 14, borderRadius: 7, backgroundColor: 'rgba(17,17,19,0.07)' },
});

export default RevealChoreography;

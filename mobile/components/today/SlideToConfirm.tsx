/**
 * SlideToConfirm (spec 3.6) - pill track + draggable gold knob for the
 * morning lock-in. Horizontal-only pan (activeOffsetX +-10, failOffsetY
 * +-12), knob tracks 1:1, selection haptics at 25/75%, snaps complete at
 * >=85% with a Success haptic and the track filling gold; release below
 * threshold springs back with a light bounce. Reduced motion: no overshoot.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    interpolateColor,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useReducedMotion } from '../../hooks/useA11y';

const KNOB = 46;
const TRACK_H = 54;
const GOLD = '#D4A017';

function haptic(kind: 'selection' | 'success' | 'light') {
    if (Platform.OS === 'web') return;
    if (kind === 'selection') Haptics.selectionAsync().catch(() => {});
    else if (kind === 'success')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function SlideToConfirm({
    label = 'Slide to lock in',
    confirmedLabel = 'Locked in',
    confirmed = false,
    onConfirm,
}: {
    label?: string;
    confirmedLabel?: string;
    confirmed?: boolean;
    onConfirm: () => void;
}) {
    const [trackW, setTrackW] = useState(0);
    const x = useSharedValue(0);
    const done = useSharedValue(confirmed ? 1 : 0);
    const reducedMotion = useReducedMotion();
    // Shared values, NOT React refs: the gesture callbacks run as UI-thread
    // worklets, where a ref mutation only hits the worklet's captured copy.
    const firedQuarter = useSharedValue(0);
    const firedThreeQuarter = useSharedValue(0);
    const maxX = Math.max(0, trackW - KNOB - 8);

    const finish = () => {
        haptic('success');
        onConfirm();
    };

    // Un-wedge: if the parent reverts `confirmed` (lock-in API failure), the
    // knob must come back to life instead of staying inert forever.
    React.useEffect(() => {
        if (!confirmed && done.value === 1) {
            done.value = 0;
            firedQuarter.value = 0;
            firedThreeQuarter.value = 0;
            x.value = withTiming(0, { duration: 150 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmed]);

    const pan = Gesture.Pan()
        .enabled(!confirmed)
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
            if (done.value === 1) return;
            const next = Math.min(Math.max(e.translationX, 0), maxX);
            x.value = next;
            const frac = maxX > 0 ? next / maxX : 0;
            if (frac >= 0.25 && firedQuarter.value === 0) {
                firedQuarter.value = 1;
                runOnJS(haptic)('selection');
            }
            if (frac >= 0.75 && firedThreeQuarter.value === 0) {
                firedThreeQuarter.value = 1;
                runOnJS(haptic)('selection');
            }
        })
        .onEnd(() => {
            const frac = maxX > 0 ? x.value / maxX : 0;
            if (frac >= 0.85) {
                done.value = 1;
                x.value = reducedMotion
                    ? withTiming(maxX, { duration: 150 })
                    : withSpring(maxX, { damping: 14, stiffness: 160 });
                runOnJS(finish)();
            } else {
                firedQuarter.value = 0;
                firedThreeQuarter.value = 0;
                x.value = reducedMotion
                    ? withTiming(0, { duration: 150 })
                    : withSpring(0, { damping: 12, stiffness: 140 });
                runOnJS(haptic)('light');
            }
        });

    const knobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }],
    }));
    const trackStyle = useAnimatedStyle(() => {
        const frac = maxX > 0 ? x.value / maxX : 0;
        return {
            backgroundColor: interpolateColor(
                done.value === 1 ? 1 : frac,
                [0, 1],
                ['rgba(255,255,255,0.55)', 'rgba(212,160,23,0.28)'],
            ),
        };
    });

    const isDone = confirmed;

    return (
        <GestureDetector gesture={pan}>
            <Animated.View
                onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
                style={[styles.track, trackStyle]}
                accessibilityRole="button"
                accessibilityLabel={isDone ? confirmedLabel : label}
                accessibilityHint="Slide right or double tap to confirm your day"
                accessibilityState={{ disabled: isDone }}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={(e) => {
                    if (e.nativeEvent.actionName === 'activate' && !isDone) {
                        done.value = 1;
                        x.value = maxX;
                        finish();
                    }
                }}
            >
                <Text style={[styles.label, isDone && styles.labelDone]}>
                    {isDone ? confirmedLabel : label}
                </Text>
                <Animated.View style={[styles.knob, isDone ? { left: undefined, right: 4 } : knobStyle]}>
                    <Ionicons
                        name={isDone ? 'checkmark' : 'chevron-forward'}
                        size={20}
                        color="#fff"
                    />
                </Animated.View>
            </Animated.View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    track: {
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.7)',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    label: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    labelDone: { color: '#8a6a10' },
    knob: {
        position: 'absolute',
        left: 4,
        width: KNOB,
        height: KNOB,
        borderRadius: KNOB / 2,
        backgroundColor: GOLD,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0B1220',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
    },
});

export default SlideToConfirm;

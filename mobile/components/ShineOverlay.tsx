/**
 * ShineOverlay — a quiet looksmaxxing sheen for ink ("black-pill") surfaces.
 *
 * A soft diagonal highlight sweeps across the pill on a slow loop, like light
 * catching a glossy black surface. Simple, premium, and alive without being
 * busy. Drop it inside any ink-filled button/pill that has `overflow:'hidden'`
 * and a rounded radius — it clips itself to the parent's shape.
 *
 * Reduced-motion: renders nothing (the surface stays a calm flat black).
 * Note: continuous loops appear frozen in the headless web preview (rAF is
 * throttled) but run fine on a real focused device.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue,
    withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';

const AGradient = Animated.createAnimatedComponent(LinearGradient);

export default function ShineOverlay({
    width = 460,
    intensity = 0.16,
    period = 4200,
}: {
    /** Roughly the pill's width; the streak travels a touch past both edges. */
    width?: number;
    /** Peak white opacity of the sheen (0..1). */
    intensity?: number;
    /** Full loop duration in ms (sweep + the pause between sweeps). */
    period?: number;
}) {
    const reduced = useReducedMotion();
    const t = useSharedValue(0);

    useEffect(() => {
        if (reduced) return;
        const sweep = Math.round(period * 0.34);
        t.value = withRepeat(
            withDelay(period - sweep, withTiming(1, { duration: sweep, easing: Easing.inOut(Easing.quad) })),
            -1,
            false,
        );
    }, [reduced, period, t]);

    const style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(t.value, [0, 1], [-120, width + 120]) },
            { rotate: '18deg' },
        ],
        opacity: interpolate(t.value, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
    }));

    if (reduced) return null;

    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, { pointerEvents: 'none' }]}>
            <AGradient
                colors={['transparent', `rgba(255,255,255,${intensity})`, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.streak, style]}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    clip: { overflow: 'hidden' },
    streak: { position: 'absolute', top: -24, bottom: -24, width: 86 },
});

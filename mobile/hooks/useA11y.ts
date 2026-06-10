/**
 * Accessibility foundation hooks. Every glass/animated surface consumes these:
 *
 *   useReducedMotion()      - true when the OS asks for reduced motion; swap
 *                             spring choreography for short cross-fades.
 *   useReduceTransparency() - true when the OS asks for reduced transparency;
 *                             glass primitives render a >=90% opaque solid
 *                             fill instead of blur (SolidFallback).
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

export function useReducedMotion(): boolean {
    // Reanimated's hook is cross-platform and updates live.
    return useReanimatedReducedMotion();
}

export function useReduceTransparency(): boolean {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        // iOS-only setting; Android/web have no equivalent toggle.
        if (Platform.OS !== 'ios') return;
        let mounted = true;
        AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
            if (mounted) setEnabled(value);
        });
        const sub = AccessibilityInfo.addEventListener(
            'reduceTransparencyChanged',
            setEnabled,
        );
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);

    return enabled;
}

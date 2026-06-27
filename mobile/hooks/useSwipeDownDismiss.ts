/**
 * useSwipeDownDismiss — drag-to-dismiss for bottom-sheet modals.
 *
 * Returns an Animated `translateY` to put on the sheet's transform, and
 * `panHandlers` to spread onto the sheet's TOP drag zone (the grabber + header)
 * — NOT the scrolling body, so inner ScrollViews/inputs keep working. A
 * downward drag follows the finger; releasing past a distance/velocity threshold
 * calls `onDismiss` (which may itself confirm, e.g. a discard prompt), and the
 * sheet springs back to rest so it's correct whether or not the close proceeds.
 *
 * Built on RN Animated + PanResponder — no new native modules.
 */
import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

export function useSwipeDownDismiss(
    onDismiss: () => void,
    opts?: { distance?: number; velocity?: number },
) {
    const distance = opts?.distance ?? 110;
    const velocity = opts?.velocity ?? 0.6;
    const translateY = useRef(new Animated.Value(0)).current;
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;

    const responder = useRef(
        PanResponder.create({
            // Only claim clearly-downward drags (let horizontal/upward gestures
            // and taps pass through to children).
            onMoveShouldSetPanResponder: (_e, g) =>
                g.dy > 6 && g.dy > Math.abs(g.dx) * 1.5,
            onPanResponderMove: (_e, g) => {
                if (g.dy > 0) translateY.setValue(g.dy);
            },
            onPanResponderRelease: (_e, g) => {
                const shouldDismiss = g.dy > distance || g.vy > velocity;
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 2,
                    speed: 18,
                }).start();
                if (shouldDismiss) dismissRef.current();
            },
            onPanResponderTerminate: () => {
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
            },
        }),
    ).current;

    return { translateY, panHandlers: responder.panHandlers };
}

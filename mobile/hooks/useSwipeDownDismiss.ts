/**
 * useSwipeDownDismiss — interactive drag-to-dismiss for bottom-sheet modals.
 *
 * Press and drag the sheet DOWN and it follows your finger live (on the UI
 * thread); release and it either springs back to rest (small drag) or, past a
 * distance/velocity threshold, calls `onDismiss` (which may itself confirm —
 * e.g. a discard prompt) — exactly the rubber-band behaviour iOS sheets use.
 *
 * Usage:
 *   const { gesture, animatedStyle } = useSwipeDownDismiss(onClose);
 *   <Animated.View style={[styles.sheet, animatedStyle]}>      // Reanimated view
 *     <GestureDetector gesture={gesture}>
 *       <View>{grabber + header}</View>                        // the drag zone
 *     </GestureDetector>
 *     <ScrollView>…</ScrollView>                                // body scrolls free
 *   </Animated.View>
 *
 * Built on Reanimated + gesture-handler so the drag tracks at 60fps. (The old
 * PanResponder version mixed a JS `setValue` with a native-driver spring on one
 * Animated.Value, which silently stopped the sheet from following the finger.)
 */
import { useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';

export function useSwipeDownDismiss(
    onDismiss: () => void,
    opts?: { distance?: number; velocity?: number },
) {
    // distance = px dragged before release dismisses; velocity = a flick speed
    // (px/s — gesture-handler units) that dismisses even on a short drag.
    const distance = opts?.distance ?? 120;
    const velocity = opts?.velocity ?? 900;

    const translateY = useSharedValue(0);
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;
    const fireDismiss = () => dismissRef.current();

    const gesture = useMemo(
        () =>
            Gesture.Pan()
                // Only claim a clearly-DOWNWARD drag, so taps (the X) and any
                // horizontal/upward gestures fall through to their targets.
                .activeOffsetY(12)
                .failOffsetX([-24, 24])
                .onUpdate((e) => {
                    'worklet';
                    // Follow the finger downward only; ignore upward past rest.
                    translateY.value = e.translationY > 0 ? e.translationY : 0;
                })
                .onEnd((e) => {
                    'worklet';
                    const shouldDismiss =
                        e.translationY > distance || e.velocityY > velocity;
                    // Always spring back to rest: if the dismiss is cancelled
                    // (e.g. a "discard?" prompt), the sheet is already in place.
                    translateY.value = withSpring(0, {
                        damping: 22,
                        stiffness: 240,
                        mass: 0.5,
                    });
                    if (shouldDismiss) runOnJS(fireDismiss)();
                }),
        // Thresholds are captured once; the dismiss target is read via ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return { gesture, animatedStyle };
}

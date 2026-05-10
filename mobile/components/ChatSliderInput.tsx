/**
 * Inline slider input rendered below a chat bubble when the assistant asks
 * a numeric question (e.g. "how old are you?").
 *
 * Backend protocol — see ChatResponse.input_widget on the server:
 *   {
 *     type: "slider",
 *     min: 13,
 *     max: 50,
 *     step: 1,
 *     default: 18,
 *     label: "How old are you?",
 *     unit: ""
 *   }
 *
 * UX notes — the previous version was controlled on every drag tick, which
 * caused the thumb to fight the user's finger on iOS (state update → re-render
 * → re-snap to last-committed value). Now the underlying slider is internally
 * uncontrolled after first mount: we read its drag value via onValueChange to
 * update the displayed number, and only commit to React state on
 * onSlidingComplete (or release on web). This makes scrubbing feel native.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    LayoutChangeEvent,
    PanResponder,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme/dark';

export interface SliderSpec {
    type: 'slider';
    min: number;
    max: number;
    step: number;
    default: number;
    label: string;
    unit?: string;
}

interface Props {
    spec: SliderSpec;
    onSubmit: (value: number) => void;
    disabled?: boolean;
}

export default function ChatSliderInput({ spec, onSubmit, disabled }: Props) {
    const initial = clamp(spec.default ?? Math.round((spec.min + spec.max) / 2), spec.min, spec.max);
    const [committedValue, setCommittedValue] = useState<number>(initial);
    const [displayValue, setDisplayValue] = useState<number>(initial);

    // Sync if the spec ever changes (e.g. server re-asks a different field).
    useEffect(() => {
        const next = clamp(spec.default ?? Math.round((spec.min + spec.max) / 2), spec.min, spec.max);
        setCommittedValue(next);
        setDisplayValue(next);
    }, [spec.min, spec.max, spec.default]);

    const submit = () => {
        if (disabled) return;
        onSubmit(committedValue);
    };

    return (
        <View style={styles.container}>
            {spec.label ? <Text style={styles.label}>{spec.label.toLowerCase()}</Text> : null}
            <View style={styles.valueRow}>
                <Text style={styles.value}>{displayValue}</Text>
                {spec.unit ? <Text style={styles.unit}>{spec.unit}</Text> : null}
            </View>
            <SliderTrack
                min={spec.min}
                max={spec.max}
                step={spec.step}
                initialValue={initial}
                onChangeLive={setDisplayValue}
                onCommit={setCommittedValue}
                disabled={disabled}
            />
            <View style={styles.scaleRow}>
                <Text style={styles.scaleText}>{spec.min}</Text>
                <Text style={styles.scaleText}>{spec.max}</Text>
            </View>
            <Pressable
                onPress={submit}
                disabled={disabled}
                style={({ pressed }) => [
                    styles.submit,
                    disabled && styles.submitDisabled,
                    pressed && !disabled && styles.submitPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Submit ${committedValue}`}
            >
                <Text style={styles.submitText}>confirm</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.buttonText} />
            </Pressable>
        </View>
    );
}

// --------------------------------------------------------------------------- //
//  Track — web uses native range input; native uses @rn-community/slider when
//  available, falls back to a tap-to-pick row on platforms without it.
// --------------------------------------------------------------------------- //

interface TrackProps {
    min: number;
    max: number;
    step: number;
    initialValue: number;
    onChangeLive: (v: number) => void;
    onCommit: (v: number) => void;
    disabled?: boolean;
}

function SliderTrack({ min, max, step, initialValue, onChangeLive, onCommit, disabled }: TrackProps) {
    if (Platform.OS === 'web') {
        return (
            <View style={styles.trackWeb}>
                {/* @ts-ignore - native HTML element under RN-Web */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    defaultValue={initialValue}
                    disabled={disabled}
                    onInput={(e: any) => {
                        const v = Number(e.target.value);
                        onChangeLive(v);
                    }}
                    onChange={(e: any) => {
                        const v = Number(e.target.value);
                        onChangeLive(v);
                        onCommit(v);
                    }}
                    style={{
                        width: '100%',
                        height: 36,
                        accentColor: colors.foreground,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        touchAction: 'none',
                    }}
                />
            </View>
        );
    }

    // Native (iOS/Android): custom PanResponder slider — same approach
    // as the onboarding screen. Drops the @react-native-community/slider
    // dep entirely (which wasn't installed anyway, so users on iOS were
    // hitting the snap-pill last-resort fallback). Drag-tracks via a
    // captured `startValue` + dx/trackWidth*range model so the thumb
    // follows the finger continuously without re-reading locationX.
    return (
        <PanSliderTrack
            min={min}
            max={max}
            step={step}
            initialValue={initialValue}
            onChangeLive={onChangeLive}
            onCommit={onCommit}
            disabled={disabled}
        />
    );
}


function PanSliderTrack({ min, max, step, initialValue, onChangeLive, onCommit, disabled }: TrackProps) {
    const [trackWidth, setTrackWidth] = useState(0);
    const [value, setValue] = useState(initialValue);
    const range = max - min;

    const valueRef = useRef(value);
    valueRef.current = value;
    const trackWidthRef = useRef(trackWidth);
    trackWidthRef.current = trackWidth;
    const startValueRef = useRef(value);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const ratio = trackWidth > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;
    const thumbX = ratio * trackWidth;

    const tickHaptic = useCallback(() => {
        if (Platform.OS !== 'web') {
            Haptics.selectionAsync().catch(() => {});
        }
    }, []);

    const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => !disabled,
                onMoveShouldSetPanResponder: (_e, g) => !disabled && (Math.abs(g.dx) > 1 || Math.abs(g.dy) > 1),
                onPanResponderTerminationRequest: () => false,
                onPanResponderGrant: (e) => {
                    if (disabled) return;
                    const w = trackWidthRef.current;
                    if (w <= 0) return;
                    // Tap-to-position: jump to the tap location, then drag from there.
                    const x = Math.max(0, Math.min(w, e.nativeEvent.locationX));
                    const raw = min + (x / w) * range;
                    const next = step > 0 ? Math.round(raw / step) * step : raw;
                    const clamped = Math.max(min, Math.min(max, next));
                    startValueRef.current = clamped;
                    if (clamped !== valueRef.current) {
                        setValue(clamped);
                        onChangeLive(clamped);
                        tickHaptic();
                    }
                },
                onPanResponderMove: (_e, g) => {
                    if (disabled) return;
                    const w = trackWidthRef.current;
                    if (w <= 0) return;
                    const delta = (g.dx / w) * range;
                    const raw = startValueRef.current + delta;
                    const stepped = step > 0 ? Math.round(raw / step) * step : raw;
                    const clamped = Math.max(min, Math.min(max, stepped));
                    if (clamped !== valueRef.current) {
                        setValue(clamped);
                        onChangeLive(clamped);
                        tickHaptic();
                    }
                },
                onPanResponderRelease: () => {
                    onCommit(valueRef.current);
                },
                onPanResponderTerminate: () => {
                    onCommit(valueRef.current);
                },
            }),
        [min, max, step, range, onChangeLive, onCommit, tickHaptic, disabled]
    );

    return (
        <View style={styles.panHitArea} onLayout={onLayout} {...panResponder.panHandlers}>
            <View style={styles.panTrack} pointerEvents="none">
                <View style={[styles.panFill, { width: thumbX }]} />
                <View style={[styles.panThumb, { left: Math.max(0, thumbX - 12) }]} />
            </View>
        </View>
    );
}


function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

const styles = StyleSheet.create({
    container: {
        // Compact card sized to fit comfortably on iPhone SE (320pt) and
        // up. Was overflowing on small screens before — value font was
        // 64pt with 70pt lineHeight, plus full vertical padding stacked
        // up on every layout. Trimmed every spacing axis ~30%.
        marginTop: spacing.xs,
        marginBottom: spacing.sm,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.md,
        gap: 6,
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    label: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: colors.textMuted ?? '#888',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    valueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: 6,
        marginVertical: 2,
    },
    value: {
        fontFamily: fonts.serif,
        fontSize: 44,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -1.4,
        lineHeight: 50,
        includeFontPadding: false,
    },
    unit: {
        fontFamily: fonts.sans,
        fontSize: 12,
        fontWeight: '500',
        color: colors.textMuted ?? '#888',
        letterSpacing: 0.5,
        textTransform: 'lowercase',
    },
    trackWeb: {
        paddingVertical: spacing.sm,
        paddingHorizontal: 2,
        marginTop: spacing.xs,
    },
    scaleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
        marginTop: -spacing.xs,
    },
    scaleText: {
        fontSize: 11,
        color: colors.textMuted ?? '#888',
        letterSpacing: 0.5,
        opacity: 0.7,
    },
    /* Custom PanResponder slider (native iOS/Android) — modern thin
       rail + pill thumb, matches the onboarding step's slider so the
       chat slider doesn't look like a different component. */
    panHitArea: {
        marginTop: spacing.xs,
        alignSelf: 'stretch',
        height: 40,
        justifyContent: 'center',
    },
    panTrack: {
        height: 24,
        justifyContent: 'center',
    },
    panFill: {
        position: 'absolute',
        left: 0,
        height: 3,
        backgroundColor: colors.foreground,
        borderRadius: 1.5,
    },
    panThumb: {
        position: 'absolute',
        top: 0,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.foreground,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#18181b', shadowOpacity: 0.20, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } }
            : { elevation: 3 }),
    },
    submit: {
        marginTop: 8,
        paddingVertical: 9,
        paddingHorizontal: spacing.lg,
        borderRadius: 999,
        backgroundColor: colors.foreground,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        alignSelf: 'center',
        minWidth: 140,
    },
    submitPressed: { opacity: 0.7 },
    submitDisabled: { opacity: 0.35 },
    submitText: {
        color: colors.buttonText,
        fontWeight: '600',
        fontSize: 13,
        letterSpacing: 0.6,
    },
});

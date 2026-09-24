import React, { useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fonts } from '../../theme/dark';

/**
 * Notification primer — the value-moment ask for push permission.
 *
 * Shown from Home (hooks/useNotificationNudges decides when) right after the
 * user has seen their own plan, naming their next task: "want a ping at
 * 7:30?". Only "turn on reminders" triggers the iOS system prompt — that
 * prompt appears once per install, so it is never spent cold.
 *
 * Same idiom as the first-run walkthrough card (features/mainTour): a bottom
 * ink card over a scrim, lowercase editorial copy, rendered IN-SCREEN rather
 * than as an RN <Modal> (stacked Modals are the iOS two-modal freeze).
 */

type Props = {
    visible: boolean;
    title: string;
    body: string;
    /** The system prompt is up / the token is registering. */
    busy: boolean;
    onEnable: () => void;
    /** "not now" and the scrim — snoozes the primer. */
    onNotNow: () => void;
};

export default function NotificationPrimerSheet({ visible, title, body, busy, onEnable, onNotNow }: Props) {
    const insets = useSafeAreaInsets();
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
    }, [visible, anim]);

    if (!visible) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <Pressable
                style={s.scrim}
                onPress={busy ? undefined : onNotNow}
                accessibilityRole="button"
                accessibilityLabel="Not now"
            />
            <Animated.View
                style={[
                    s.card,
                    { paddingBottom: 20 + insets.bottom },
                    {
                        opacity: anim,
                        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
                    },
                ]}
                accessibilityViewIsModal
                testID="notification-primer"
            >
                <Text style={s.kicker}>reminders</Text>
                <Text style={s.title} accessibilityRole="header">{title}</Text>
                <Text style={s.body}>{body}</Text>

                <View style={s.actions}>
                    <TouchableOpacity
                        onPress={onNotNow}
                        disabled={busy}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy }}
                        testID="notification-primer-not-now"
                    >
                        <Text style={[s.secondary, busy && s.dimmed]}>not now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={s.primaryBtn}
                        onPress={onEnable}
                        disabled={busy}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Turn on reminders"
                        accessibilityState={{ disabled: busy, busy }}
                        testID="notification-primer-enable"
                    >
                        {busy ? (
                            <ActivityIndicator size="small" color={colors.foreground} />
                        ) : (
                            <Text style={s.primaryText}>turn on reminders</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    card: {
        position: 'absolute', left: 12, right: 12, bottom: 12,
        backgroundColor: colors.foreground,
        borderRadius: borderRadius.lg + 4,
        borderCurve: 'continuous',
        paddingHorizontal: 22, paddingTop: 22,
        shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
        elevation: 10,
    },
    kicker: {
        fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.6,
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8,
    },
    title: { fontFamily: fonts.serif, fontSize: 26, color: colors.buttonText, letterSpacing: -0.4 },
    body: {
        fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21,
        color: 'rgba(255,255,255,0.72)', marginTop: 8, marginBottom: 20,
    },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 18 },
    secondary: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: 'rgba(255,255,255,0.55)' },
    dimmed: { opacity: 0.4 },
    primaryBtn: {
        backgroundColor: colors.buttonText, borderRadius: borderRadius.full,
        paddingHorizontal: 20, paddingVertical: 11, minWidth: 156, alignItems: 'center',
    },
    primaryText: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.foreground },
});

/**
 * InAppAlert — a styled, on-brand replacement for React Native's native
 * `Alert.alert`. Renders an in-app modal card instead of the OS dialog so
 * prompts match the app's editorial aesthetic (ink + cream, Fraunces title).
 *
 * Drop-in: the exported `Alert` mirrors RN's `Alert.alert` signature exactly,
 * so migrating a call site is just swapping the import — the title, message,
 * button array, and `cancel`/`destructive`/`default` styles all keep working.
 *
 *   - import { Alert } from 'react-native'
 *   + import { Alert } from '../../components/InAppAlert'
 *
 * Mount <InAppAlertHost /> exactly once near the app root (above navigation).
 * Alerts queue, so two rapid calls show one after the other like the OS does.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    type KeyboardTypeOptions,
} from 'react-native';
import { colors, fonts, spacing } from '../theme/dark';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type InAppAlertButton = {
    text?: string;
    // Receives the prompt text when shown via Alert.prompt; ignored otherwise.
    onPress?: (text?: string) => void;
    style?: AlertButtonStyle;
};

export type InAppAlertOptions = {
    cancelable?: boolean;
    onDismiss?: () => void;
};

type AlertSpec = {
    id: number;
    title: string;
    message?: string;
    buttons: InAppAlertButton[];
    options?: InAppAlertOptions;
    // Prompt mode (Alert.prompt): renders a text field; button onPress gets the text.
    isPrompt?: boolean;
    defaultValue?: string;
    keyboardType?: KeyboardTypeOptions;
    secureTextEntry?: boolean;
};

const DESTRUCTIVE = '#CC3B30';

// ── Imperative bridge ───────────────────────────────────────────────────────
// The host subscribes; `Alert.alert` enqueues. Calls made before the host
// mounts still queue and flush once it does.
let _seq = 0;
const _queue: AlertSpec[] = [];
// A STACK of host pull-callbacks. The topmost (most recently mounted) host
// renders the alert. This matters because a host mounted inside a <Modal> (e.g.
// the chat drawer) is presented ABOVE that modal, whereas the root host's modal
// would render BEHIND it — so an Alert fired from inside the drawer modal was
// invisible. A drawer mounts its own host; while it's open, alerts route there.
const _hosts: Array<() => void> = [];

function _notifyTop() {
    const top = _hosts[_hosts.length - 1];
    top?.();
}

function _enqueue(spec: Omit<AlertSpec, 'id'>) {
    _queue.push({ ...spec, id: ++_seq });
    _notifyTop();
}

type PromptType = 'default' | 'plain-text' | 'secure-text' | 'login-password';

/** RN-compatible `Alert` object — `alert()` and `prompt()` mirror React Native. */
export const Alert = {
    alert(
        title: string,
        message?: string,
        buttons?: InAppAlertButton[],
        options?: InAppAlertOptions,
    ): void {
        _enqueue({
            title: title ?? '',
            message,
            buttons: buttons && buttons.length ? buttons : [{ text: 'OK', style: 'default' }],
            options,
        });
    },

    /**
     * In-app equivalent of RN's iOS-only `Alert.prompt`. Supports the two common
     * forms: a single callback `(text) => void`, or a buttons array whose
     * onPress receives the entered text.
     */
    prompt(
        title: string,
        message?: string,
        callbackOrButtons?: ((text: string) => void) | InAppAlertButton[],
        type?: PromptType,
        defaultValue?: string,
        keyboardType?: KeyboardTypeOptions,
    ): void {
        let buttons: InAppAlertButton[];
        if (typeof callbackOrButtons === 'function') {
            const cb = callbackOrButtons;
            buttons = [
                { text: 'Cancel', style: 'cancel' },
                { text: 'OK', style: 'default', onPress: (t) => cb(t ?? '') },
            ];
        } else if (Array.isArray(callbackOrButtons) && callbackOrButtons.length) {
            buttons = callbackOrButtons;
        } else {
            buttons = [{ text: 'OK', style: 'default' }];
        }
        _enqueue({
            title: title ?? '',
            message,
            buttons,
            isPrompt: true,
            defaultValue: defaultValue ?? '',
            keyboardType,
            secureTextEntry: type === 'secure-text' || type === 'login-password',
        });
    },
};

/** Convenience imperative call when you don't want the `Alert.` namespace. */
export function showAlert(
    title: string,
    message?: string,
    buttons?: InAppAlertButton[],
    options?: InAppAlertOptions,
): void {
    Alert.alert(title, message, buttons, options);
}

// ── Host ────────────────────────────────────────────────────────────────────
export function InAppAlertHost() {
    const [current, setCurrent] = useState<AlertSpec | null>(null);
    const [inputText, setInputText] = useState('');
    const scale = useRef(new Animated.Value(0.92)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const closingRef = useRef(false);
    // Mirror `current` in a ref so the unmount cleanup can read the LATEST value
    // without needing `current` in the effect deps (which would re-subscribe the
    // host on every alert and reorder the host stack).
    const currentRef = useRef<AlertSpec | null>(null);
    currentRef.current = current;

    const pullNext = useCallback(() => {
        const next = _queue.shift() || null;
        closingRef.current = false;
        setCurrent(next);
        setInputText(next?.isPrompt ? (next.defaultValue ?? '') : '');
    }, []);

    // Subscribe the host to the imperative bridge. Hosts form a stack; only the
    // topmost pulls, so an alert fired while a drawer-hosted host is mounted
    // shows inside that drawer's modal (on top), not behind it.
    useEffect(() => {
        const pull = () => {
            // Only pull when idle; the close handler pulls the rest of the queue.
            setCurrent((c) => {
                if (c) return c;
                const next = _queue.shift() ?? null;
                setInputText(next?.isPrompt ? (next.defaultValue ?? '') : '');
                return next;
            });
        };
        _hosts.push(pull);
        // Flush anything enqueued before this (now-topmost) host mounted.
        if (!current && _queue.length) pull();
        return () => {
            const i = _hosts.lastIndexOf(pull);
            if (i >= 0) _hosts.splice(i, 1);
            // A host mounted INSIDE a dismissable surface (chat drawer, planner
            // sheet) can unmount while it is still SHOWING an alert — the parent
            // Modal closes (backdrop tap, tab blur, a failsafe unmount timer)
            // before the user answers. That alert was already `current` (shifted
            // out of `_queue`), so re-notifying `_queue` alone silently destroys
            // the visible confirm dialog AND its stranded button state — a lost
            // prompt, and (with two stacked Modals tearing down together) the
            // classic iOS two-modal deadlock that freezes every tap app-wide.
            // Re-enqueue the still-open alert so the next surviving host (the
            // root) re-presents it in its OWN modal instead.
            const stranded = currentRef.current;
            if (stranded) _queue.unshift(stranded);
            // Hand any still-queued alert (re-enqueued or otherwise) to whatever
            // host is now on top.
            if (_queue.length) _notifyTop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Animate in whenever a new alert becomes current.
    useEffect(() => {
        if (!current) return;
        scale.setValue(0.92);
        opacity.setValue(0);
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70 }),
            Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
    }, [current, scale, opacity]);

    const close = useCallback(
        (btn?: InAppAlertButton, text?: string) => {
            if (closingRef.current) return;
            closingRef.current = true;
            Animated.parallel([
                Animated.timing(scale, { toValue: 0.96, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]).start(() => {
                try {
                    btn?.onPress?.(text);
                } finally {
                    // Show the next queued alert, if any.
                    pullNext();
                }
            });
        },
        [scale, opacity, pullNext],
    );

    const onRequestClose = useCallback(() => {
        if (!current) return;
        // Android back / swipe: honor cancelable, prefer a cancel button.
        if (current.options?.cancelable === false) return;
        const cancelBtn = current.buttons.find((b) => b.style === 'cancel');
        current.options?.onDismiss?.();
        close(cancelBtn);
    }, [current, close]);

    if (!current) return null;

    const { title, message, buttons, isPrompt } = current;
    // Prompt fields stack their buttons so the text field reads top-to-bottom.
    const sideBySide = buttons.length === 2 && !isPrompt;

    return (
        <Modal visible transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent>
            <KeyboardAvoidingView
                style={styles.overlayFill}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View style={[styles.overlay, { opacity }]}>
                    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
                        {!!title && <Text style={styles.title}>{title}</Text>}
                        {!!message && <Text style={styles.message}>{message}</Text>}

                        {isPrompt && (
                            <TextInput
                                style={styles.input}
                                value={inputText}
                                onChangeText={setInputText}
                                autoFocus
                                keyboardType={current.keyboardType}
                                secureTextEntry={current.secureTextEntry}
                                placeholderTextColor={colors.textMuted}
                                selectionColor={colors.foreground}
                            />
                        )}

                        <View style={[styles.buttonRow, sideBySide ? styles.buttonRowSide : styles.buttonRowStack]}>
                            {buttons.map((btn, i) => {
                                const isDestructive = btn.style === 'destructive';
                                const isCancel = btn.style === 'cancel';
                                return (
                                    <TouchableOpacity
                                        key={`${btn.text ?? 'btn'}-${i}`}
                                        style={[
                                            styles.button,
                                            sideBySide && styles.buttonSide,
                                            sideBySide && i === 0 && styles.buttonSideFirst,
                                        ]}
                                        activeOpacity={0.7}
                                        onPress={() => close(btn, isPrompt && !isCancel ? inputText : undefined)}
                                        accessibilityRole="button"
                                        accessibilityLabel={btn.text ?? 'OK'}
                                    >
                                        <Text
                                            style={[
                                                styles.buttonText,
                                                isDestructive && { color: DESTRUCTIVE },
                                                isCancel && styles.buttonTextCancel,
                                            ]}
                                        >
                                            {btn.text ?? 'OK'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Animated.View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlayFill: { flex: 1 },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    input: {
        marginTop: 18,
        height: 46,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(17,17,19,0.18)',
        backgroundColor: colors.surfaceLight,
        paddingHorizontal: 14,
        fontFamily: fonts.sans,
        fontSize: 15,
        color: colors.foreground,
        borderCurve: 'continuous' as any,
    },
    card: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: colors.background,
        borderRadius: 24,
        paddingTop: 26,
        paddingHorizontal: 24,
        paddingBottom: 16,
        ...(({
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 12 },
            elevation: 16,
        }) as object),
        borderCurve: 'continuous' as any,
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: 21,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -0.3,
        textAlign: 'center',
    },
    message: {
        fontFamily: fonts.sans,
        fontSize: 14.5,
        color: colors.textSecondary,
        lineHeight: 21,
        textAlign: 'center',
        marginTop: 9,
    },
    buttonRow: {
        marginTop: 22,
    },
    buttonRowStack: {
        flexDirection: 'column',
        gap: 8,
    },
    buttonRowSide: {
        flexDirection: 'row',
        gap: 10,
    },
    button: {
        height: 48,
        borderRadius: 999,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        borderCurve: 'continuous' as any,
    },
    buttonSide: {
        flex: 1,
    },
    buttonSideFirst: {
        backgroundColor: colors.surface,
    },
    buttonText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15.5,
        fontWeight: '600',
        color: colors.foreground,
        letterSpacing: 0.2,
    },
    buttonTextCancel: {
        color: colors.textMuted,
    },
});

export default InAppAlertHost;

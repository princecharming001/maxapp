import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BOOT_RESTORED_KEYS } from '../lib/resilienceKeys';
import { colors, fonts } from '../theme/dark';

type Props = {
    children: React.ReactNode;
    /** Called when the user taps "Reload" — use to reset in-memory state (e.g.
     *  queryClient.clear()) before the subtree re-mounts. */
    onReset?: () => void;
    /** Optional label so nested boundaries can be told apart in logs. */
    label?: string;
};

type State = { hasError: boolean };

/**
 * App-wide crash backstop. React error boundaries catch render-phase errors in
 * their subtree and show a fallback instead of unmounting the whole tree to a
 * white screen.
 *
 * Two jobs beyond showing a fallback:
 *  1. On catch, clear the blobs that are RESTORED at boot (nav state + query
 *     cache). A crash caused by a poisoned restored blob would otherwise
 *     crash-loop every relaunch; clearing them guarantees the next mount /
 *     launch starts clean.
 *  2. "Reload" lets the user recover in-session without force-quitting — it
 *     resets error state (re-mounting children) and, via onReset, clears
 *     in-memory caches so the same poisoned state doesn't immediately re-throw.
 *
 * Note: boundaries do NOT catch errors thrown in event handlers, async
 * callbacks, or outside React's render — those are handled by the global error
 * handler (lib/globalErrorHandlers) + per-call try/catch.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Best-effort: clear poisoned boot-restored blobs so a relaunch is clean.
        AsyncStorage.multiRemove(BOOT_RESTORED_KEYS).catch(() => undefined);
        try {
            // eslint-disable-next-line no-console
            console.error(
                `[AppErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`,
                error?.message || error,
                info?.componentStack,
            );
        } catch {
            /* logging must never itself throw */
        }
    }

    handleReset = () => {
        try {
            this.props.onReset?.();
        } catch {
            /* ignore */
        }
        this.setState({ hasError: false });
        // Web has no native relaunch; a full reload re-runs boot from a clean
        // slate (the poisoned blobs were already cleared in componentDidCatch).
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try {
                window.location.reload();
            } catch {
                /* ignore */
            }
        }
    };

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <View style={styles.root}>
                <View style={styles.card}>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.body}>
                        The app hit an unexpected error. Your data is safe — tap below to reload and
                        pick up where you left off.
                    </Text>
                    <TouchableOpacity
                        style={styles.btn}
                        onPress={this.handleReset}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Reload the app"
                    >
                        <Text style={styles.btnText}>Reload</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    card: { maxWidth: 360, width: '100%', alignItems: 'center' },
    title: {
        fontFamily: fonts.serif,
        fontSize: 24,
        color: colors.foreground,
        textAlign: 'center',
        marginBottom: 10,
    },
    body: {
        fontFamily: fonts.sans,
        fontSize: 15,
        lineHeight: 22,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    btn: {
        backgroundColor: colors.foreground,
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 999,
    },
    btnText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.buttonText },
});

export default AppErrorBoundary;

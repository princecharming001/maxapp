/**
 * DevDrawer — single floating control surface for QA-style work.
 *
 * Mounts ONLY in __DEV__ builds (so production never sees it).
 * Bottom-right pill icon → tap opens a sheet with:
 *
 *   STATE       paid? · tier · scan? · onboarding?
 *   PAYWALL     Activate Chad / Activate Chadlite / Reset paywall
 *   SCAN        Mark scan complete / Reset scan
 *   ONBOARDING  Reset onboarding
 *   FULL RESET  Reset everything (re-onboard + paywall + scan)
 *   NAVIGATE    Chat · Master Schedule · Edit Lifestyle · Payment · Onboarding
 *   ACCOUNT     Sign out
 *
 * Hooks into the existing dev-only backend endpoints
 * (POST /users/dev/reset, /users/dev/mark-scan-completed,
 * /payments/test-activate). All endpoints 404 in prod, so even if this
 * component leaked into production it couldn't actually mutate anything.
 */

import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../lib/queryClient';

const FOREGROUND = '#0a0a0b';
const MUTED = '#7c7c80';
const SURFACE = '#1a1a1c';

export default function DevDrawer() {
    if (!__DEV__) return null;
    return <DevDrawerInner />;
}

function DevDrawerInner() {
    const { user, refreshUser, logout } = useAuth();
    const navigation = useNavigation<any>();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const ob = (user?.onboarding || {}) as Record<string, any>;
    const stateLine = [
        user?.is_paid ? `paid · ${user.subscription_tier ?? '?'}` : 'free',
        user?.first_scan_completed ? 'scan ✓' : 'no scan',
        ob.completed ? 'onb ✓' : 'no onb',
    ].join(' · ');

    /**
     * Run an action with a busy guard, refresh user state on success,
     * and pop a brief alert on error. Centralized so each button row
     * stays a single line.
     */
    const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(label);
        try {
            await fn();
            await refreshUser?.().catch(() => undefined);
            // Bust schedule + maxes caches since most resets touch them.
            queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
        } catch (e: any) {
            Alert.alert('Dev action failed', String(e?.message || e));
        } finally {
            setBusy(null);
        }
    }, [busy, refreshUser, queryClient]);

    const navTo = useCallback((target: string, nestedScreen?: string) => {
        setOpen(false);
        // Use a short timeout so the modal close animation runs before
        // navigation kicks in — feels less jarring.
        setTimeout(() => {
            try {
                if (nestedScreen) {
                    navigation.navigate(target as never, { screen: nestedScreen } as never);
                } else {
                    navigation.navigate(target as never);
                }
            } catch (e) {
                Alert.alert('Nav failed', `Couldn't navigate to ${target}${nestedScreen ? '/' + nestedScreen : ''}: ${String(e)}`);
            }
        }, 220);
    }, [navigation]);

    return (
        <>
            {/* Floating launcher pill — bottom-right, above tab bar. */}
            <Pressable
                onPress={() => setOpen(true)}
                style={s.launcher}
                accessibilityLabel="Open dev drawer"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                <Text style={s.launcherText}>DEV</Text>
            </Pressable>

            <Modal
                visible={open}
                animationType="slide"
                transparent
                onRequestClose={() => setOpen(false)}
            >
                <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={s.sheet} onPress={() => { /* trap clicks */ }}>
                        <View style={s.handle} />
                        <Text style={s.title}>Dev drawer</Text>
                        <Text style={s.stateLine}>{stateLine}</Text>

                        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
                            <Section label="Paywall">
                                <Btn label="Activate Chad (premium)"
                                     busy={busy === 'paid_chad'}
                                     onPress={() => run('paid_chad', () => api.testActivateSubscription('premium'))} />
                                <Btn label="Activate Chadlite (basic)"
                                     busy={busy === 'paid_lite'}
                                     onPress={() => run('paid_lite', () => api.testActivateSubscription('basic'))} />
                                <Btn label="Reset paywall (→ free)"
                                     busy={busy === 'reset_sub'}
                                     onPress={() => run('reset_sub', () => api.devReset({ subscription: true }))} />
                            </Section>

                            <Section label="Face scan">
                                <Btn label="Mark scan completed"
                                     busy={busy === 'mark_scan'}
                                     onPress={() => run('mark_scan', () => api.devMarkScanCompleted())} />
                                <Btn label="Reset scan flag"
                                     busy={busy === 'reset_scan'}
                                     onPress={() => run('reset_scan', () => api.devReset({ scan: true }))} />
                            </Section>

                            <Section label="Onboarding">
                                <Btn label="Reset onboarding"
                                     busy={busy === 'reset_onb'}
                                     onPress={() => run('reset_onb', () => api.devReset({ onboarding: true }))} />
                                <Btn label="🔥 Reset EVERYTHING"
                                     busy={busy === 'reset_all'}
                                     destructive
                                     onPress={() => {
                                         Alert.alert(
                                             'Reset everything?',
                                             'Wipes onboarding, scan flag, and subscription on this account. Requires DEBUG=true on backend.',
                                             [
                                                 { text: 'Cancel', style: 'cancel' },
                                                 {
                                                     text: 'Reset all',
                                                     style: 'destructive',
                                                     onPress: () => void run('reset_all', () => api.devReset({ all: true })),
                                                 },
                                             ],
                                         );
                                     }} />
                            </Section>

                            <Section label="Jump to">
                                <Btn label="→ Onboarding (start over)" onPress={() => navTo('Onboarding')} />
                                <Btn label="→ Payment" onPress={() => navTo('Payment')} />
                                <Btn label="→ Face scan" onPress={() => navTo('FaceScan')} />
                                <Btn label="→ Chat" onPress={() => navTo('Main', 'Chat')} />
                                <Btn label="→ Master Schedule" onPress={() => navTo('Main', 'Schedule')} />
                                <Btn label="→ Edit Lifestyle" onPress={() => navTo('EditPersonal')} />
                                <Btn label="→ Home" onPress={() => navTo('Main', 'Home')} />
                            </Section>

                            <Section label="Account">
                                <Btn label="Sign out"
                                     busy={busy === 'logout'}
                                     destructive
                                     onPress={() => {
                                         Alert.alert('Sign out?', '', [
                                             { text: 'Cancel', style: 'cancel' },
                                             { text: 'Sign out', style: 'destructive', onPress: () => void logout?.() },
                                         ]);
                                     }} />
                            </Section>

                            <View style={{ height: 24 }} />
                        </ScrollView>

                        <Pressable onPress={() => setOpen(false)} style={s.closeBtn}>
                            <Text style={s.closeText}>Close</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={s.section}>
            <Text style={s.sectionLabel}>{label}</Text>
            <View style={{ gap: 6 }}>{children}</View>
        </View>
    );
}

function Btn({
    label, onPress, busy, destructive,
}: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    destructive?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={!!busy}
            style={({ pressed }) => [
                s.btn,
                destructive && s.btnDestructive,
                pressed && { opacity: 0.7 },
                busy && { opacity: 0.5 },
            ]}
        >
            {busy ? (
                <ActivityIndicator size="small" color="#fff" />
            ) : (
                <Text style={s.btnText}>{label}</Text>
            )}
        </Pressable>
    );
}

const s = StyleSheet.create({
    launcher: {
        position: 'absolute',
        right: 14,
        bottom: 90,             // sits above the tab bar on most screens
        backgroundColor: 'rgba(10,10,11,0.85)',
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        zIndex: 999,
        elevation: 12,
    },
    launcherText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.4,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#111114',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingTop: 8,
        paddingHorizontal: 16,
        paddingBottom: 16,
        maxHeight: '88%',
    },
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#444',
        marginBottom: 8,
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    stateLine: {
        color: MUTED,
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.4,
        marginTop: 4,
        marginBottom: 12,
    },
    scroll: { maxHeight: '80%' },
    scrollContent: { paddingBottom: 8 },
    section: { marginBottom: 16 },
    sectionLabel: {
        color: MUTED,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    btn: {
        backgroundColor: SURFACE,
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#2a2a2c',
    },
    btnDestructive: { backgroundColor: '#3a1a1c', borderColor: '#5a2a2c' },
    btnText: {
        color: '#f5f5f3',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    closeBtn: {
        alignSelf: 'center',
        marginTop: 8,
        paddingVertical: 10,
        paddingHorizontal: 18,
    },
    closeText: { color: MUTED, fontSize: 13, fontWeight: '600' },
});

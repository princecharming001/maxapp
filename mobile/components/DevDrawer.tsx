/**
 * DevDrawer - floating dev control surface for QA / design review (__DEV__ only).
 *
 * Bottom-right "DEV" pill (mounted on EVERY screen, signed-in or not) opens a
 * sheet with:
 *   STATE        quick switch: Guest / Onboarding / Paid
 *   GO TO        full grouped jump list across the WHOLE app. Each jump knows
 *                the auth state its screen lives in and switches into it (faux
 *                login / logout) before navigating, so you can land anywhere.
 *   PAYWALL/SCAN/ONBOARDING resets, ACCOUNT sign out.
 *
 * Navigation uses a shared navigationRef (not useNavigation) so it works from
 * anywhere and survives the RootNavigator stack swap that a jump triggers.
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
import { useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../lib/queryClient';
import { navigationRef } from '../lib/navigationRef';

const MUTED = '#7c7c80';
const SURFACE = '#1a1a1c';

type AppState = 'guest' | 'unpaid' | 'paid';
type Jump = { label: string; state: AppState; route: string; nested?: string; params?: Record<string, unknown> };

// The whole app, grouped. `state` = the auth stack the screen lives in.
const GROUPS: { label: string; items: Jump[] }[] = [
    {
        label: 'Entry', items: [
            { label: 'Landing', state: 'guest', route: 'Landing' },
            { label: 'Log in', state: 'guest', route: 'Login' },
            { label: 'Create account', state: 'guest', route: 'Signup' },
            { label: 'Forgot password', state: 'guest', route: 'ForgotPassword' },
        ],
    },
    {
        label: 'Onboarding funnel', items: [
            { label: 'Onboarding (start)', state: 'unpaid', route: 'Onboarding' },
            { label: 'Routine reveal', state: 'unpaid', route: 'RoutineReveal' },
            { label: 'Features intro', state: 'unpaid', route: 'FeaturesIntro' },
            { label: 'Paywall (Payment)', state: 'unpaid', route: 'Payment' },
            { label: 'Payment thank-you', state: 'unpaid', route: 'PaymentThankYou' },
        ],
    },
    {
        label: 'Main tabs', items: [
            { label: 'Home', state: 'paid', route: 'Main', nested: 'Home' },
            { label: 'Schedule', state: 'paid', route: 'Main', nested: 'MasterScheduleTab' },
            { label: 'Planner', state: 'paid', route: 'Main', nested: 'PlannerTab' },
            { label: 'Explore (marketplace)', state: 'paid', route: 'Main', nested: 'Explore' },
            { label: 'Chat / Coach', state: 'paid', route: 'Main', nested: 'Chat' },
        ],
    },
    {
        label: 'Scan', items: [
            { label: 'Face scan', state: 'paid', route: 'FaceScan' },
            { label: 'Scan results', state: 'paid', route: 'FaceScanResults' },
            { label: 'Scan archive', state: 'paid', route: 'FaceScanArchive' },
            { label: 'Module select', state: 'paid', route: 'ModuleSelect' },
        ],
    },
    {
        label: 'SMS + notifications', items: [
            { label: 'SMS coaching intro', state: 'paid', route: 'SmsCoachingIntro' },
            { label: 'Sendblue connect', state: 'paid', route: 'SendblueConnect' },
            { label: 'SMS setup', state: 'paid', route: 'SmsSetup' },
            { label: 'Notification channels', state: 'paid', route: 'NotificationChannels' },
        ],
    },
    {
        label: 'Profile + settings', items: [
            { label: 'Profile', state: 'paid', route: 'Profile' },
            { label: 'Settings', state: 'paid', route: 'Settings' },
            { label: 'Edit lifestyle', state: 'paid', route: 'EditPersonal' },
            { label: 'Personal info', state: 'paid', route: 'PersonalInfo' },
            { label: 'Day planner', state: 'paid', route: 'DayPlanner' },
            { label: 'My products', state: 'paid', route: 'MyProducts' },
            { label: 'Manage subscription', state: 'paid', route: 'ManageSubscription' },
            { label: 'Progress archive', state: 'paid', route: 'ProgressArchive' },
        ],
    },
    {
        label: 'Courses + maxes', items: [
            { label: 'Course list', state: 'paid', route: 'CourseList' },
            { label: 'Schedule (course)', state: 'paid', route: 'Schedule' },
            { label: 'Maxx detail (skinmax)', state: 'paid', route: 'MaxxDetail', params: { maxxId: 'skinmax' } },
            { label: 'Fitmax plan', state: 'paid', route: 'FitmaxPlan' },
            { label: 'Fitmax workout tracker', state: 'paid', route: 'FitmaxWorkoutTracker' },
            { label: 'Fitmax calorie log', state: 'paid', route: 'FitmaxCalorieLog' },
            { label: 'Fitmax progress', state: 'paid', route: 'FitmaxProgress' },
        ],
    },
    {
        label: 'Legal', items: [
            { label: 'Privacy policy', state: 'guest', route: 'LegalDocument', params: { document: 'privacy' } },
            { label: 'Terms of service', state: 'guest', route: 'LegalDocument', params: { document: 'terms' } },
        ],
    },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function DevDrawer() {
    if (!__DEV__) return null;
    return <DevDrawerInner />;
}

function DevDrawerInner() {
    const { user, isAuthenticated, isPaid, refreshUser, logout, fauxSkipSignup, fauxFreshSignup } = useAuth() as any;
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const currentState: AppState = !isAuthenticated ? 'guest' : isPaid ? 'paid' : 'unpaid';

    const ob = (user?.onboarding || {}) as Record<string, any>;
    const stateLine = [
        currentState,
        user?.is_paid ? `paid · ${user.subscription_tier ?? '?'}` : 'free',
        user?.first_scan_completed ? 'scan ✓' : 'no scan',
        ob.completed ? 'onb ✓' : 'no onb',
    ].join(' · ');

    const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(label);
        try {
            await fn();
            await refreshUser?.().catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
        } catch (e: any) {
            Alert.alert('Dev action failed', String(e?.message || e));
        } finally {
            setBusy(null);
        }
    }, [busy, refreshUser, queryClient]);

    const ensureState = useCallback(async (target: AppState) => {
        const cur: AppState = !isAuthenticated ? 'guest' : isPaid ? 'paid' : 'unpaid';
        if (cur === target) return;
        if (target === 'guest') await logout?.();
        else if (target === 'paid') await fauxSkipSignup?.();
        else await fauxFreshSignup?.();
    }, [isAuthenticated, isPaid, logout, fauxSkipSignup, fauxFreshSignup]);

    const doNav = useCallback((item: Jump): boolean => {
        if (!navigationRef.isReady()) return false;
        try {
            if (item.nested) {
                navigationRef.navigate(item.route as never, { screen: item.nested, params: item.params } as never);
            } else {
                navigationRef.navigate(item.route as never, item.params as never);
            }
            return true;
        } catch {
            return false;
        }
    }, []);

    const jumpTo = useCallback(async (item: Jump) => {
        setOpen(false);
        try {
            await ensureState(item.state);
            // The stack may have just swapped after a state change; re-issue the
            // navigation across a short window until it lands.
            for (const d of [120, 400, 850, 1500]) {
                await sleep(d);
                doNav(item);
            }
        } catch (e: any) {
            Alert.alert('Jump failed', `${item.label}: ${String(e?.message || e)}`);
        }
    }, [ensureState, doNav]);

    const switchState = useCallback(async (target: AppState) => {
        setOpen(false);
        try { await ensureState(target); } catch (e: any) { Alert.alert('Switch failed', String(e?.message || e)); }
    }, [ensureState]);

    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                style={s.launcher}
                accessibilityLabel="Open dev drawer"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <Text style={s.launcherText}>DEV</Text>
            </Pressable>

            {open ? (
                <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={s.sheet} onPress={() => { /* trap */ }}>
                        <View style={s.handle} />
                        <Text style={s.title}>Dev drawer</Text>
                        <Text style={s.stateLine}>{stateLine}</Text>

                        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
                            <Section label="Switch state">
                                <Row>
                                    <Pill label="Guest" active={currentState === 'guest'} onPress={() => switchState('guest')} />
                                    <Pill label="Onboarding" active={currentState === 'unpaid'} onPress={() => switchState('unpaid')} />
                                    <Pill label="Paid" active={currentState === 'paid'} onPress={() => switchState('paid')} />
                                </Row>
                            </Section>

                            {GROUPS.map((g) => (
                                <Section key={g.label} label={g.label}>
                                    {g.items.map((it) => (
                                        <Btn key={it.label + it.route + (it.nested ?? '')} label={`→ ${it.label}`} onPress={() => void jumpTo(it)} />
                                    ))}
                                </Section>
                            ))}

                            <Section label="Paywall">
                                <Btn label="Activate Chad (premium)" busy={busy === 'paid_chad'} onPress={() => run('paid_chad', () => api.testActivateSubscription('premium'))} />
                                <Btn label="Activate Chadlite (basic)" busy={busy === 'paid_lite'} onPress={() => run('paid_lite', () => api.testActivateSubscription('basic'))} />
                                <Btn label="Reset paywall (→ free)" busy={busy === 'reset_sub'} onPress={() => run('reset_sub', () => api.devReset({ subscription: true }))} />
                            </Section>

                            <Section label="Face scan">
                                <Btn label="Mark scan completed" busy={busy === 'mark_scan'} onPress={() => run('mark_scan', () => api.devMarkScanCompleted())} />
                                <Btn label="Reset scan flag" busy={busy === 'reset_scan'} onPress={() => run('reset_scan', () => api.devReset({ scan: true }))} />
                            </Section>

                            <Section label="Onboarding / reset">
                                <Btn label="Reset onboarding" busy={busy === 'reset_onb'} onPress={() => run('reset_onb', () => api.devReset({ onboarding: true }))} />
                                <Btn label="🔥 Reset EVERYTHING" busy={busy === 'reset_all'} destructive
                                    onPress={() => Alert.alert('Reset everything?', 'Wipes onboarding, scan flag, and subscription. Requires DEBUG=true backend.', [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Reset all', style: 'destructive', onPress: () => void run('reset_all', () => api.devReset({ all: true })) },
                                    ])} />
                            </Section>

                            <Section label="Account">
                                <Btn label="Sign out" busy={busy === 'logout'} destructive onPress={() => void logout?.()} />
                            </Section>

                            <View style={{ height: 24 }} />
                        </ScrollView>

                        <Pressable onPress={() => setOpen(false)} style={s.closeBtn}>
                            <Text style={s.closeText}>Close</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            ) : null}
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
function Row({ children }: { children: React.ReactNode }) {
    return <View style={{ flexDirection: 'row', gap: 6 }}>{children}</View>;
}
function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={[s.pill, active && s.pillActive]}>
            <Text style={[s.pillText, active && s.pillTextActive]}>{label}</Text>
        </Pressable>
    );
}
function Btn({ label, onPress, busy, destructive }: { label: string; onPress: () => void; busy?: boolean; destructive?: boolean }) {
    return (
        <Pressable onPress={onPress} disabled={!!busy}
            style={({ pressed }) => [s.btn, destructive && s.btnDestructive, pressed && { opacity: 0.7 }, busy && { opacity: 0.5 }]}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnText}>{label}</Text>}
        </Pressable>
    );
}

const s = StyleSheet.create({
    launcher: { position: 'absolute', left: 14, bottom: 150, backgroundColor: 'rgba(10,10,11,0.92)', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, zIndex: 99999, elevation: 40 },
    launcherText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', zIndex: 10000, elevation: 40 },
    sheet: { backgroundColor: '#111114', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16, maxHeight: '90%' },
    handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: '#444', marginBottom: 8 },
    title: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    stateLine: { color: MUTED, fontSize: 11, fontWeight: '600', letterSpacing: 0.4, marginTop: 4, marginBottom: 12 },
    scroll: { maxHeight: '82%' },
    scrollContent: { paddingBottom: 8 },
    section: { marginBottom: 16 },
    sectionLabel: { color: MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 },
    btn: { backgroundColor: SURFACE, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2c' },
    btnDestructive: { backgroundColor: '#3a1a1c', borderColor: '#5a2a2c' },
    btnText: { color: '#f5f5f3', fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
    pill: { flex: 1, backgroundColor: SURFACE, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2c' },
    pillActive: { backgroundColor: '#f5f5f3', borderColor: '#f5f5f3' },
    pillText: { color: '#f5f5f3', fontSize: 12, fontWeight: '700' },
    pillTextActive: { color: '#111114' },
    closeBtn: { alignSelf: 'center', marginTop: 8, paddingVertical: 10, paddingHorizontal: 18 },
    closeText: { color: MUTED, fontSize: 13, fontWeight: '600' },
});

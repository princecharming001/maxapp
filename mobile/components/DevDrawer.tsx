import React, { useCallback, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { navigationRef } from '../lib/navigationRef';

type AppState = 'guest' | 'unpaid' | 'paid';
type Jump = { label: string; state: AppState; route: string; nested?: string; params?: Record<string, unknown> };

const SCREENS: Jump[] = [
    { label: 'Landing',              state: 'guest',  route: 'Landing' },
    { label: 'Log in',               state: 'guest',  route: 'Login' },
    { label: 'Create account',       state: 'guest',  route: 'Signup' },
    { label: 'Forgot password',      state: 'guest',  route: 'ForgotPassword' },
    { label: 'Onboarding',           state: 'unpaid', route: 'Onboarding' },
    { label: 'Routine reveal',       state: 'unpaid', route: 'RoutineReveal' },
    { label: 'Features intro',       state: 'unpaid', route: 'FeaturesIntro' },
    { label: 'Paywall',              state: 'unpaid', route: 'Payment' },
    { label: 'Payment thank-you',    state: 'unpaid', route: 'PaymentThankYou' },
    { label: 'Home',                 state: 'paid',   route: 'Main', nested: 'Home' },
    { label: 'Schedule',             state: 'paid',   route: 'Main', nested: 'MasterScheduleTab' },
    { label: 'Planner',              state: 'paid',   route: 'Main', nested: 'PlannerTab' },
    { label: 'Explore',              state: 'paid',   route: 'Main', nested: 'Explore' },
    { label: 'Chat',                 state: 'paid',   route: 'Main', nested: 'Chat' },
    { label: 'Face scan',            state: 'paid',   route: 'FaceScan' },
    { label: 'Scan results',         state: 'paid',   route: 'FaceScanResults' },
    { label: 'Scan archive',         state: 'paid',   route: 'FaceScanArchive' },
    { label: 'Progress calendar',   state: 'paid',   route: 'ProgressArchive' },
    { label: 'Profile',              state: 'paid',   route: 'Profile' },
    { label: 'Settings',             state: 'paid',   route: 'Settings' },
    { label: 'Edit lifestyle',       state: 'paid',   route: 'EditPersonal' },
    { label: 'Day planner',          state: 'paid',   route: 'DayPlanner' },
    { label: 'Manage subscription',  state: 'paid',   route: 'ManageSubscription' },
    { label: 'Course list',          state: 'paid',   route: 'CourseList' },
    { label: 'Privacy policy',       state: 'guest',  route: 'LegalDocument', params: { document: 'privacy' } },
    { label: 'Terms of service',     state: 'guest',  route: 'LegalDocument', params: { document: 'terms' } },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function DevDrawer() {
    if (!__DEV__) return null;
    return <DevDrawerInner />;
}

function DevDrawerInner() {
    const { isAuthenticated, isPaid, logout, fauxSkipSignup, fauxFreshSignup } = useAuth() as any;
    const [open, setOpen] = useState(false);

    const currentState: AppState = !isAuthenticated ? 'guest' : isPaid ? 'paid' : 'unpaid';

    const ensureState = useCallback(async (target: AppState) => {
        const cur: AppState = !isAuthenticated ? 'guest' : isPaid ? 'paid' : 'unpaid';
        if (cur === target) return;
        if (target === 'guest') await logout?.();
        else if (target === 'paid') await fauxSkipSignup?.();
        else await fauxFreshSignup?.();
    }, [isAuthenticated, isPaid, logout, fauxSkipSignup, fauxFreshSignup]);

    const switchState = useCallback(async (target: AppState) => {
        setOpen(false);
        try { await ensureState(target); } catch { /* ignore */ }
    }, [ensureState]);

    const jumpTo = useCallback(async (item: Jump) => {
        setOpen(false);
        await ensureState(item.state);
        for (const d of [120, 400, 850, 1500]) {
            await sleep(d);
            try {
                if (!navigationRef.isReady()) continue;
                if (item.nested) {
                    navigationRef.navigate(item.route as never, { screen: item.nested, params: item.params } as never);
                } else {
                    navigationRef.navigate(item.route as never, item.params as never);
                }
            } catch { /* retry */ }
        }
    }, [ensureState]);

    return (
        <>
            <View style={s.floatRoot} pointerEvents="box-none">
                <Pressable
                    onPress={() => setOpen(true)}
                    style={s.launcher}
                    accessibilityLabel="Open dev drawer"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Text style={s.launcherText}>DEV</Text>
                </Pressable>
            </View>

            <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
                <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={s.sheet} onPress={() => {}}>
                        <View style={s.handle} />

                        {/* State switcher */}
                        <View style={s.pillRow}>
                            {(['guest', 'unpaid', 'paid'] as AppState[]).map((st) => (
                                <Pressable
                                    key={st}
                                    style={[s.pill, currentState === st && s.pillActive]}
                                    onPress={() => void switchState(st)}
                                >
                                    <Text style={[s.pillText, currentState === st && s.pillTextActive]}>
                                        {st === 'unpaid' ? 'Onboarding' : st.charAt(0).toUpperCase() + st.slice(1)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={s.divider} />

                        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                            {SCREENS.map((item) => (
                                <Pressable
                                    key={item.label}
                                    style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                                    onPress={() => void jumpTo(item)}
                                >
                                    <Text style={s.rowText}>{item.label}</Text>
                                    <Text style={s.rowArrow}>→</Text>
                                </Pressable>
                            ))}
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


const s = StyleSheet.create({
    floatRoot: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 99999, elevation: 40,
    },
    launcher: {
        position: 'absolute', left: 14, bottom: 160,
        backgroundColor: 'rgba(10,10,11,0.92)',
        borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
    },
    launcherText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },

    backdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#111114', borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingTop: 8, paddingHorizontal: 16, paddingBottom: 24, maxHeight: '80%',
    },
    handle: {
        alignSelf: 'center', width: 44, height: 4,
        borderRadius: 2, backgroundColor: '#444', marginBottom: 12,
    },

    pillRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    pill: { flex: 1, backgroundColor: '#1a1a1c', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2c' },
    pillActive: { backgroundColor: '#f5f5f3', borderColor: '#f5f5f3' },
    pillText: { color: '#f5f5f3', fontSize: 12, fontWeight: '700' },
    pillTextActive: { color: '#111114' },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 4 },

    scroll: { maxHeight: '55%' },
    scrollContent: { paddingBottom: 8 },

    row: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 13, paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    rowPressed: { opacity: 0.5 },
    rowText: { color: '#f5f5f3', fontSize: 15, fontWeight: '500' },
    rowArrow: { color: 'rgba(255,255,255,0.30)', fontSize: 15 },

    closeBtn: { alignSelf: 'center', marginTop: 14, paddingVertical: 10, paddingHorizontal: 18 },
    closeText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
});

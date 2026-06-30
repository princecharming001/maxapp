import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Alert } from './InAppAlert';
import { useAuth } from '../context/AuthContext';

type AppState = 'guest' | 'unpaid' | 'paid';

export default function DevDrawer() {
    if (!__DEV__) return null;
    return <DevDrawerInner />;
}

function DevDrawerInner() {
    const { isAuthenticated, isPaid, logout, fauxSkipSignup, fauxFreshSignup } = useAuth() as any;
    const [open, setOpen] = useState(false);

    const currentState: AppState = !isAuthenticated ? 'guest' : isPaid ? 'paid' : 'unpaid';

    const switchState = useCallback(async (target: AppState) => {
        setOpen(false);
        if (target === currentState) return;
        const run = async () => {
            if (target === 'guest') await logout?.();
            else if (target === 'paid') await fauxSkipSignup?.();
            else await fauxFreshSignup?.();
        };
        const isNetworkErr = (e: any) =>
            !e?.response?.status &&
            /network|timeout|aborted|ECONN|Failed to fetch/i.test(String(e?.message || ''));
        try {
            await run();
        } catch (e: any) {
            // A bare "Network Error" usually means the local sim backend is
            // briefly unreachable (restarting). Retry once before giving up so a
            // transient hiccup doesn't dead-end the switch.
            if (isNetworkErr(e)) {
                await new Promise((r) => setTimeout(r, 900));
                try {
                    await run();
                    return;
                } catch (e2: any) {
                    console.warn(`[DevDrawer] switch to "${target}" failed after retry: ${e2?.message}`);
                    Alert.alert('Dev switch failed', 'Could not reach the backend. Is the local sim backend running on :8001?');
                    return;
                }
            }
            // Don't fail silently — a 404 here means the app is pointed at the
            // prod backend (faux-signup is gated off there). Surface it so the
            // button isn't a mystery dead-end. Fix: run a local backend +
            // mobile/.env.local pointing at it. See that file for details.
            const status = e?.response?.status;
            const hint = status === 404
                ? 'faux-signup is 404 on this backend — point the app at a LOCAL backend (see mobile/.env.local).'
                : (e?.message ?? 'unknown error');
            console.warn(`[DevDrawer] switch to "${target}" failed: ${hint}`);
            Alert.alert('Dev switch failed', hint);
        }
    }, [currentState, logout, fauxSkipSignup, fauxFreshSignup]);

    // Jump straight to the day-one reveal (the "Scan now / Skip for now" page,
    // right before the face scan) with MOCK onboarding answers — so you can test
    // that screen + the scan/paywall flow without filling in the 10 questions.
    const goToReveal = useCallback(async () => {
        setOpen(false);
        const MOCK_OB = {
            goals: ['skinmax', 'fitmax', 'hairmax'],
            motivation: 'confidence',
            wake_time: '07:00',
            sleep_time: '23:00',
            completed: false,
        };
        const navToReveal = () => {
            const { navigationRef } = require('../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('RoutineReveal', { ob: MOCK_OB });
        };
        try {
            // RoutineReveal only exists in the unpaid stack — get there first.
            if (currentState !== 'unpaid') {
                await fauxFreshSignup?.();
                setTimeout(navToReveal, 450); // let the unpaid stack remount
            } else {
                navToReveal();
            }
        } catch (e: any) {
            Alert.alert('Dev reveal failed', String(e?.message || e || 'Could not open the reveal.'));
        }
    }, [currentState, fauxFreshSignup]);

    // Jump straight to CreateAccount ("Save your results") — the account-after-scan
    // claim step — bypassing the camera-gated scan, so the claim -> referral flow
    // (and the returning-user "Sign in instead" path) can be tested on a simulator.
    const goToCreateAccount = useCallback(async () => {
        setOpen(false);
        const navTo = () => {
            const { navigationRef } = require('../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('CreateAccount');
        };
        try {
            if (currentState !== 'unpaid') {
                await fauxFreshSignup?.();
                setTimeout(navTo, 450);
            } else {
                navTo();
            }
        } catch (e: any) {
            Alert.alert('Dev create-account failed', String(e?.message || e || 'Could not open CreateAccount.'));
        }
    }, [currentState, fauxFreshSignup]);

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

            <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
                <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={s.sheet} onPress={() => {}}>
                        <View style={s.handle} />
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
                        <Pressable onPress={() => void goToReveal()} style={s.actionBtn}>
                            <Text style={s.actionText}>Reveal → scan (mock data)</Text>
                        </Pressable>
                        <Pressable onPress={() => void goToCreateAccount()} style={s.actionBtn}>
                            <Text style={s.actionText}>→ Create account (claim)</Text>
                        </Pressable>
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
    launcher: {
        position: 'absolute', left: 14, bottom: 160, zIndex: 99999, elevation: 40,
        backgroundColor: 'rgba(10,10,11,0.92)',
        borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
    },
    launcherText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: '#111114', borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingTop: 8, paddingHorizontal: 16, paddingBottom: 24,
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

    actionBtn: {
        backgroundColor: '#1a1a1c', borderRadius: 10, paddingVertical: 12,
        alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2c',
        marginBottom: 4,
    },
    actionText: { color: '#f5f5f3', fontSize: 13, fontWeight: '700' },

    closeBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 18 },
    closeText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
});

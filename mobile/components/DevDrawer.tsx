import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
        try {
            if (target === currentState) return;
            if (target === 'guest') await logout?.();
            else if (target === 'paid') await fauxSkipSignup?.();
            else await fauxFreshSignup?.();
        } catch { /* ignore */ }
    }, [currentState, logout, fauxSkipSignup, fauxFreshSignup]);

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

    closeBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 18 },
    closeText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
});

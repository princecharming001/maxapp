/**
 * ReferralCodeField — "Have a referral code?" entry on the paywall (RALPH_REFERRAL
 * Phase 5). Validate → show applied state → redeem. On a free comp the server
 * grants entitlement; we refresh auth and call onComped() so the host routes the
 * user PAST the paywall (the client never self-grants — it only reflects server
 * state).
 *
 * Hidden / no-op when the `referrals` flag is OFF, so the paywall is
 * byte-identical to today. All result states are surfaced cleanly (invalid /
 * expired / already-used / max-reached / self-referral / success).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';

import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFlag } from '../constants/featureFlags';

type Status = 'idle' | 'checking' | 'valid' | 'invalid' | 'redeeming' | 'comped' | 'error';

const INK = '#15130F';
const SUB = '#6B6B6B';
const ACCENT = '#2F6B4E';
const ERR = '#B23A2E';

export function ReferralCodeField({
    initialCode,
    onComped,
}: {
    initialCode?: string;
    onComped?: () => void;
}) {
    const enabled = useFlag('referrals');
    const { refreshUser } = useAuth();
    const [code, setCode] = useState(initialCode ?? '');
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');
    const [free, setFree] = useState(false);

    // Deep-link / referral URL pre-fills the code; auto-validate it once.
    useEffect(() => {
        if (enabled && initialCode && initialCode.trim()) {
            void onValidate(initialCode.trim());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, initialCode]);

    if (!enabled) return null;

    async function onValidate(raw?: string) {
        const c = (raw ?? code).trim();
        if (!c) return;
        setStatus('checking');
        setMessage('');
        try {
            const res = await api.validateReferral(c);
            if (res.valid) {
                setFree(!!res.free);
                setStatus('valid');
                setMessage(res.message || 'code applied.');
            } else {
                setStatus('invalid');
                setMessage(res.message || "that code isn't valid.");
            }
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setStatus('invalid');
            setMessage(detail?.message || "couldn't check that code. try again.");
        }
    }

    async function onRedeem() {
        const c = code.trim();
        if (!c) return;
        setStatus('redeeming');
        try {
            const platform: 'ios' | 'web' = Platform.OS === 'ios' ? 'ios' : 'web';
            const res = await api.redeemReferral(c, platform);
            if (res.free) {
                // Entitlement granted server-side; reflect it and route past paywall.
                await refreshUser();
                setStatus('comped');
                setMessage(res.message || 'premium is on us, welcome in.');
                onComped?.();
            } else {
                // Discount path: recognized; price applies via Apple/Stripe (or "coming").
                setStatus('valid');
                setMessage(res.message || 'code applied.');
            }
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setStatus('error');
            setMessage(detail?.message || "couldn't redeem that code.");
        }
    }

    const busy = status === 'checking' || status === 'redeeming';
    const tone = status === 'invalid' || status === 'error' ? ERR : status === 'comped' || status === 'valid' ? ACCENT : SUB;

    return (
        <View style={styles.wrap}>
            <View style={styles.row}>
                <TextInput
                    value={code}
                    onChangeText={(t) => {
                        setCode(t.toUpperCase());
                        if (status !== 'idle') setStatus('idle');
                    }}
                    placeholder="Have a referral code?"
                    placeholderTextColor={SUB}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={status !== 'comped' && !busy}
                    style={styles.input}
                    accessibilityLabel="Referral code"
                />
                {status === 'valid' && free ? (
                    <TouchableOpacity style={styles.cta} onPress={onRedeem} disabled={busy} accessibilityRole="button">
                        <Text style={styles.ctaText}>Unlock</Text>
                    </TouchableOpacity>
                ) : status === 'comped' ? (
                    <View style={[styles.cta, styles.ctaDone]}>
                        <Text style={styles.ctaText}>✓</Text>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.applyBtn} onPress={() => onValidate()} disabled={busy} accessibilityRole="button">
                        {busy ? <ActivityIndicator color={INK} size="small" /> : <Text style={styles.applyText}>Apply</Text>}
                    </TouchableOpacity>
                )}
            </View>
            {message ? <Text style={[styles.msg, { color: tone }]}>{message}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { width: '100%', marginTop: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
        flex: 1, height: 46, borderRadius: 12, paddingHorizontal: 14,
        backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.12)', color: INK, fontSize: 15, letterSpacing: 1,
    },
    applyBtn: {
        height: 46, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)',
    },
    applyText: { color: INK, fontSize: 14, fontWeight: '600' },
    cta: { height: 46, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT },
    ctaDone: { backgroundColor: ACCENT },
    ctaText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    msg: { marginTop: 6, fontSize: 12.5, paddingHorizontal: 2 },
});

export default ReferralCodeField;

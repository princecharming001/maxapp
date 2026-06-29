/**
 * ReferralCodeField — "Have a referral code?" entry (RALPH_REFERRAL Phase 5).
 * Validate → show APPLIED/APPROVED state. The HOST screen's primary button drives
 * the redeem (see ReferralCodeScreen): on a free comp the server grants premium,
 * we refresh auth and call onComped() so the host routes the user PAST the paywall
 * (the client never self-grants — it only reflects server state).
 *
 * Hidden / no-op when the `referrals` flag is OFF, so the paywall is
 * byte-identical to today. All result states are surfaced cleanly (invalid /
 * expired / already-used / max-reached / self-referral / success).
 */
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';

import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFlag } from '../constants/featureFlags';

type Status = 'idle' | 'checking' | 'valid' | 'invalid' | 'redeeming' | 'comped' | 'error';

const INK = '#15130F';
const SUB = '#6B6B6B';
const ACCENT = '#2F6B4E';
const ERR = '#B23A2E';

export type ReferralCodeHandle = {
    /** True when a valid FULL-COMP (free) code is applied and ready to redeem. */
    canComp: () => boolean;
    /** Redeem the applied code. Resolves true if it comped (host should stop here). */
    redeem: () => Promise<boolean>;
};

export const ReferralCodeField = forwardRef<ReferralCodeHandle, {
    initialCode?: string;
    onComped?: () => void;
    /** Fires after every validate so the host can light up its primary button. */
    onValidated?: (res: { valid: boolean; free: boolean }) => void;
}>(function ReferralCodeField({ initialCode, onComped, onValidated }, ref) {
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
                setMessage(res.free ? (res.message || 'approved — premium is on us.') : (res.message || 'code applied.'));
                onValidated?.({ valid: true, free: !!res.free });
            } else {
                setFree(false);
                setStatus('invalid');
                setMessage(res.message || "that code isn't valid.");
                onValidated?.({ valid: false, free: false });
            }
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setFree(false);
            setStatus('invalid');
            setMessage(detail?.message || "couldn't check that code. try again.");
            onValidated?.({ valid: false, free: false });
        }
    }

    async function onRedeem(): Promise<boolean> {
        const c = code.trim();
        if (!c) return false;
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
                return true;
            }
            // Discount path: recognized; price applies via Apple/Stripe (or "coming").
            setStatus('valid');
            setMessage(res.message || 'code applied.');
            return false;
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setStatus('error');
            setMessage(detail?.message || "couldn't redeem that code.");
            return false;
        }
    }

    useImperativeHandle(ref, () => ({
        canComp: () => status === 'valid' && free,
        redeem: onRedeem,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [status, free, code]);

    if (!enabled) return null;

    const busy = status === 'checking' || status === 'redeeming';
    const approved = (status === 'valid' && free) || status === 'comped';
    const tone = status === 'invalid' || status === 'error' ? ERR : (status === 'comped' || status === 'valid' ? ACCENT : SUB);

    return (
        <View style={styles.wrap}>
            <View style={styles.row}>
                <TextInput
                    value={code}
                    onChangeText={(t) => {
                        setCode(t.toUpperCase());
                        if (status !== 'idle') { setStatus('idle'); setFree(false); }
                    }}
                    placeholder="Have a referral code?"
                    placeholderTextColor={SUB}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={status !== 'comped' && !busy}
                    style={styles.input}
                    accessibilityLabel="Referral code"
                />
                {approved ? (
                    <View style={[styles.applyBtn, styles.approvedBtn]}>
                        <Text style={styles.approvedText}>Approved ✓</Text>
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
});

const styles = StyleSheet.create({
    wrap: { width: '100%', marginTop: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: {
        flex: 1, height: 56, borderRadius: 16, paddingHorizontal: 18,
        backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.10)', color: INK, fontSize: 16, letterSpacing: 1,
    },
    applyBtn: {
        height: 56, paddingHorizontal: 22, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)',
    },
    applyText: { color: INK, fontSize: 15.5, fontWeight: '600' },
    approvedBtn: { backgroundColor: ACCENT, borderColor: ACCENT },
    approvedText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    msg: { marginTop: 8, fontSize: 13, paddingHorizontal: 4 },
});

export default ReferralCodeField;

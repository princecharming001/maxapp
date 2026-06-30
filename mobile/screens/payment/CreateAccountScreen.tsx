/**
 * CreateAccountScreen — "Save your results". Sits between the locked scan results
 * and the referral/paywall screens (account-after-scan, Approach A). It CLAIMS the
 * anonymous account minted at "Get started" — sets a real email + password + name —
 * then routes to ReferralCode. A returning user who lands here gets a clear "email
 * already registered" error (they sign in from Landing instead).
 */
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { navigationRef } from '../../lib/navigationRef';
import { fonts } from '../../theme/dark';

const INK = '#15130F';
const SUB = '#6B6B6B';
const BG = '#F4F2ED';
const ERR = '#B23A2E';

// The claim endpoint needs a unique username; the user doesn't pick one here, so
// derive a sane one from the email + a random suffix.
function deriveUsername(email: string): string {
    const base = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user';
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}_${suffix}`.slice(0, 30);
}

export default function CreateAccountScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { claimAccount, logout } = useAuth();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8 && !busy;

    const onSubmit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError(null);
        try {
            await claimAccount(email.trim(), password, name.trim(), '', deriveUsername(email.trim()));
            nav.navigate('ReferralCode', route?.params);
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Could not save your account. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    // Returning user who tapped "Get started" by mistake: drop the throwaway anon
    // session and send them to sign in instead.
    const onSignInInstead = async () => {
        try { await logout(); } catch { /* fall through to Login regardless */ }
        // logout swaps to the unauthenticated stack; jump to Login once it's mounted.
        setTimeout(() => { if (navigationRef.isReady()) navigationRef.navigate('Login' as never); }, 350);
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity style={styles.back} onPress={() => nav.goBack()} hitSlop={12} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={26} color={INK} />
            </TouchableOpacity>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={styles.title}>Save your{'\n'}<Text style={styles.titleItalic}>results</Text></Text>
                    <Text style={styles.sub}>Create your account to keep your scan and your plan.</Text>

                    <TextInput
                        style={styles.input} value={name} onChangeText={setName}
                        placeholder="Your name" placeholderTextColor={SUB}
                        autoCapitalize="words" accessibilityLabel="Name"
                    />
                    <TextInput
                        style={styles.input} value={email} onChangeText={setEmail}
                        placeholder="Email" placeholderTextColor={SUB}
                        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                        accessibilityLabel="Email"
                    />
                    <TextInput
                        style={styles.input} value={password} onChangeText={setPassword}
                        placeholder="Password (8+ characters)" placeholderTextColor={SUB}
                        secureTextEntry accessibilityLabel="Password"
                    />

                    {error ? <Text style={styles.err}>{error}</Text> : null}

                    <TouchableOpacity
                        style={[styles.cta, !canSubmit && styles.ctaDisabled]}
                        onPress={onSubmit} disabled={!canSubmit} activeOpacity={0.85} accessibilityRole="button"
                    >
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>Save & continue</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.signin} onPress={onSignInInstead} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.signinText}>Already have an account? <Text style={styles.signinStrong}>Sign in</Text></Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },
    back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
    content: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
    title: { fontFamily: fonts.serif, fontSize: 33, color: INK, letterSpacing: -0.6, lineHeight: 37 },
    titleItalic: { fontFamily: fonts.serifItalic, fontStyle: 'italic' },
    sub: { fontFamily: fonts.sans, fontSize: 15.5, color: SUB, marginTop: 12, lineHeight: 22, marginBottom: 22 },
    input: {
        height: 54, borderRadius: 14, paddingHorizontal: 16, marginTop: 10,
        backgroundColor: '#FFFFFF', color: INK, fontFamily: fonts.sans, fontSize: 16,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#1A1714', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }
            : { elevation: 1 }),
    },
    err: { fontFamily: fonts.sans, fontSize: 13.5, color: ERR, marginTop: 12, paddingHorizontal: 2 },
    cta: {
        marginTop: 24, height: 56, borderRadius: 28, backgroundColor: INK, borderCurve: 'continuous',
        alignItems: 'center', justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 5 }),
    },
    ctaDisabled: { opacity: 0.4 },
    ctaText: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: '#FFFFFF', letterSpacing: 0.2 },
    signin: { marginTop: 18, alignItems: 'center' },
    signinText: { fontFamily: fonts.sans, fontSize: 14, color: SUB },
    signinStrong: { fontFamily: fonts.sansSemiBold, color: INK, textDecorationLine: 'underline' },
});

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
    KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { useAuth } from '../../context/AuthContext';
import { navigationRef } from '../../lib/navigationRef';
import { fonts } from '../../theme/dark';

const INK = '#15130F';
const SUB = '#6B6B6B';
const BG = '#F4F2ED';
const ERR = '#B23A2E';

// Same hero backdrop as the Landing screen, so the claim step reads as part of
// the same funnel instead of a bare cream form.
const HERO = require('../../assets/landing-hero.webp');

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

    // After a successful claim (password OR Google), continue the funnel to the
    // referral/paywall step. Unlike the guest Login/Signup screens — which live in
    // the unauthenticated stack, so signing in there flips isAuthenticated and the
    // navigator remounts onto the funnel automatically — the anon user is ALREADY
    // authenticated here, so claiming changes no stack and we must navigate explicitly.
    const goForward = () => nav.navigate('ReferralCode', route?.params);

    const onSubmit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError(null);
        try {
            await claimAccount(email.trim(), password, name.trim(), '', deriveUsername(email.trim()));
            goForward();
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
            {/* Landing hero backdrop + soft cream scrim so the form stays legible. */}
            <Image source={HERO} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(244,242,237,0.86)', 'rgba(244,242,237,0.74)', 'rgba(244,242,237,0.93)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />
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

                    <View style={styles.orRow}>
                        <View style={styles.orLine} />
                        <Text style={styles.orText}>OR</Text>
                        <View style={styles.orLine} />
                    </View>

                    <GoogleSignInButton label="Continue with Google" onAuthSuccess={goForward} />
                    <TouchableOpacity
                        style={styles.apple}
                        onPress={() => Alert.alert('Apple Sign In', 'Coming soon.')}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Continue with Apple"
                    >
                        <Ionicons name="logo-apple" size={18} color={INK} />
                        <Text style={styles.appleText}>Continue with Apple</Text>
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
    orRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 14, gap: 12 },
    orLine: { flex: 1, height: 1, backgroundColor: '#E6E2D8' },
    orText: { fontFamily: fonts.sans, fontSize: 11, color: '#A8A29A', letterSpacing: 1.2 },
    apple: {
        marginTop: 10, height: 54, borderRadius: 27, borderCurve: 'continuous',
        backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#1A1714', shadowOpacity: 0.06, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } }
            : { elevation: 2 }),
    },
    appleText: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: INK },
    signin: { marginTop: 18, alignItems: 'center' },
    signinText: { fontFamily: fonts.sans, fontSize: 14, color: SUB },
    signinStrong: { fontFamily: fonts.sansSemiBold, color: INK, textDecorationLine: 'underline' },
});

/**
 * CreateAccountScreen — "Save your results". Sits between the locked scan results
 * and the referral/paywall screens (account-after-scan, Approach A). It CLAIMS the
 * anonymous account minted at "Get started" — sets a real email + password + name —
 * then routes to ReferralCode. A returning user who lands here gets a clear "email
 * already registered" error (they sign in from Landing instead).
 */
import React, { useEffect, useRef, useState } from 'react';
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
import { track } from '../../lib/analytics';
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

// FastAPI errors: `detail` is a string for our own HTTPExceptions but an ARRAY
// of {msg,...} for 422 validation errors — unpack both so the user sees the
// actual problem ("value is not a valid email address") instead of a generic one.
function claimErrorMessage(e: any): string {
    const detail = e?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg;
    return 'Could not save your account. Please try again.';
}

const ANON_EMAIL_SUFFIX = '@anon.trymax.app';

export default function CreateAccountScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { user, claimAccount, logout, refreshUser } = useAuth();
    // The anon account this screen is claiming — captured at mount so a Google
    // sign-in can tell a CLAIM (same id) from a switch to an existing account.
    const anonIdRef = useRef(user?.id);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Chain the keyboard's Next/Go across the three fields.
    const emailRef = useRef<TextInput>(null);
    const passwordRef = useRef<TextInput>(null);

    const canSubmit = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8 && !busy;

    // Continue to the schedule questions. This screen lives in TWO stacks: the
    // funnel stack (which has 'Onboarding') and the main-app stack (reached when
    // an already-full user opens it from "unlock scan results" — that stack has
    // NO 'Onboarding' route). Navigating to a route the current navigator doesn't
    // know throws the "action REPLACE/NAVIGATE was not handled" error, so guard on
    // the registered route names and fall back to Main outside the funnel.
    const continueToSchedule = (mode: 'navigate' | 'replace' = 'navigate') => {
        const routeNames: string[] = ((nav.getState?.() as any)?.routeNames) ?? [];
        if (routeNames.includes('Onboarding')) {
            if (mode === 'replace') nav.replace('Onboarding', { phase: 'schedule' });
            else nav.navigate('Onboarding', { phase: 'schedule' });
        } else {
            nav.navigate('Main');
        }
    };

    // Funnel V4 resume-guard: this screen sits AFTER the paywall, and the account
    // may already be claimed on arrival — either a relaunch mid-funnel, OR (the
    // bug this fixes) when onboarding COMPLETES and the navigator remounts onto
    // the main stack carrying a stale CreateAccount route, which would show the
    // account form a SECOND time after the schedule questions. Captured on the
    // FIRST render so we can skip the form entirely (no flash) and redirect. A
    // fresh anon claiming ON this screen is initialClaimed=false, so the legit
    // first pass is untouched (its own goForward drives the hand-off).
    const initialClaimed = useRef<boolean | null>(null);
    if (initialClaimed.current === null) {
        initialClaimed.current = !!user && !String(user.email || '').endsWith(ANON_EMAIL_SUFFIX);
    }
    useEffect(() => {
        if (initialClaimed.current) continueToSchedule('replace');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // After a successful claim (password OR Google), continue the funnel to the
    // schedule questions (funnel V4: paywall → account → schedule → Main).
    // Unlike the guest Login/Signup screens — which live in the unauthenticated
    // stack, so signing in there flips isAuthenticated and the navigator
    // remounts automatically — the anon user is ALREADY authenticated here, so
    // claiming changes no stack and we must navigate explicitly.
    const goForward = (method: 'email' | 'google' = 'email') => {
        track('onboarding_step', { step: 'account_created', method });
        continueToSchedule('navigate');
    };

    // A Google sign-in either CLAIMED the anon account (same user id — the normal
    // save-your-results path) or matched an EXISTING account and switched the
    // session to it. The two must route differently: a claim continues the funnel;
    // an existing account resumes wherever THAT account left off.
    const onGoogleSuccess = (u?: { id: string; is_paid?: boolean; onboarding?: { completed?: boolean } }) => {
        if (!u || u.id === anonIdRef.current) { goForward('google'); return; }
        track('onboarding_step', { step: 'signed_in_existing', method: 'google' });
        // Paid account: treatAsFull flips, the navigator remounts onto Main — any
        // manual navigate here would race the remount. Do nothing.
        if (u.is_paid) return;
        // Unpaid but onboarded (legacy account): straight to the paywall.
        if (u.onboarding?.completed === true) { nav.navigate('Payment'); return; }
        // Unpaid, onboarding NOT done: run onboarding — clear the anon funnel
        // history so back-swipes can't resurface another account's scan results.
        nav.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
    };

    const onSubmit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError(null);
        try {
            // The username is auto-derived (user never sees it) — retry a couple of
            // times on a collision instead of surfacing "Username already taken"
            // for a name they never chose.
            for (let attempt = 0; ; attempt++) {
                try {
                    await claimAccount(email.trim(), password, name.trim(), '', deriveUsername(email.trim()));
                    break;
                } catch (e: any) {
                    if (e?.response?.data?.detail === 'Username already taken' && attempt < 2) continue;
                    throw e;
                }
            }
            goForward('email');
        } catch (e: any) {
            const message = claimErrorMessage(e);
            // "Already set up" can mean a PREVIOUS attempt succeeded but its
            // response was lost (timeout) — the account is claimed, we just never
            // heard back. If this session now owns a claimed account with the
            // entered email, that's exactly what happened: continue instead of
            // stranding the user on an error they can't act on.
            if (/already set up/i.test(message)) {
                try {
                    const u = await refreshUser();
                    if (u?.email && !u.email.endsWith(ANON_EMAIL_SUFFIX) && u.email.toLowerCase() === email.trim().toLowerCase()) {
                        goForward('email');
                        return;
                    }
                } catch { /* fall through to the error message */ }
            }
            setError(message);
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

    // Arrived already-claimed (post-onboarding remount / relaunch): never render
    // the account form — the effect above is redirecting us onward.
    if (initialClaimed.current) return null;

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
                        textContentType="name" autoComplete="name"
                        returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} blurOnSubmit={false}
                    />
                    <TextInput
                        ref={emailRef}
                        style={styles.input} value={email} onChangeText={setEmail}
                        placeholder="Email" placeholderTextColor={SUB}
                        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                        accessibilityLabel="Email"
                        textContentType="emailAddress" autoComplete="email"
                        returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} blurOnSubmit={false}
                    />
                    <TextInput
                        ref={passwordRef}
                        style={styles.input} value={password} onChangeText={setPassword}
                        placeholder="Password (8+ characters)" placeholderTextColor={SUB}
                        secureTextEntry accessibilityLabel="Password"
                        textContentType="newPassword" autoComplete="new-password"
                        returnKeyType="go" onSubmitEditing={onSubmit}
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

                    <GoogleSignInButton label="Continue with Google" onAuthSuccess={onGoogleSuccess} />
                    {/* Apple Sign In needs a native build (P0.3) — until it ships, a
                        dead "Coming soon" button on a conversion step only loses users,
                        so it's dev-only. */}
                    {__DEV__ ? (
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
                    ) : null}

                    <TouchableOpacity style={styles.signin} onPress={onSignInInstead} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.signinText}>Already have an account? <Text style={styles.signinStrong}>Sign in</Text></Text>
                    </TouchableOpacity>

                    {/* Simulator-only: skip the account claim and continue the
                        funnel (the anon account stays anon). Never ships — __DEV__. */}
                    {__DEV__ ? (
                        <TouchableOpacity
                            style={styles.devSkip}
                            onPress={() => goForward('email')}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Skip (dev)"
                        >
                            <Text style={styles.devSkipText}>DEV · Skip account →</Text>
                        </TouchableOpacity>
                    ) : null}
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
    devSkip: {
        marginTop: 14, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)',
    },
    devSkipText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: SUB, letterSpacing: 0.4 },
});

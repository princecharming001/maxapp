import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Animated,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fonts } from '../../theme/dark';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { AppleSignInButton } from '../../components/auth/AppleSignInButton';
import { LiquidGlass } from '../../components/glass/LiquidGlass';

// ─── Error helpers (unchanged) ────────────────────────────────────────────────

function friendlyValidation(items: any[]): { message: string; field?: string } {
    for (const it of items) {
        const loc = Array.isArray(it?.loc) ? it.loc : [];
        const field = String(loc[loc.length - 1] || '').toLowerCase();
        const type = String(it?.type || '');
        if (field === 'email') return { message: 'Please enter a valid email address.', field: 'email' };
        if (field === 'password') return { message: 'Your password needs to be at least 8 characters.', field: 'password' };
        if (field === 'username') {
            return {
                message: type.includes('pattern')
                    ? 'Usernames can only use letters, numbers, and underscores.'
                    : 'Your username needs to be at least 3 characters.',
                field: 'username',
            };
        }
        if (field === 'first_name' || field === 'name') return { message: 'Please enter your name.', field: 'firstName' };
    }
    return { message: 'Please check your details and try again.' };
}

function signupErrorMessage(error: any): string {
    const res = error?.response;
    const base = api.getBaseUrl?.() || '';

    if (!res) {
        const msg = String(error?.message || '');
        const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(msg);
        const isNetwork = /Network Error|Failed to fetch|ECONNREFUSED|ENOTFOUND/i.test(msg) || isTimeout;
        if (isNetwork) {
            const local = /127\.0\.0\.1|localhost/i.test(base);
            if (local && Platform.OS === 'web') {
                return "Can't reach the API from the browser. Start the backend (uvicorn on port 8000 from maxapp/backend), keep EXPO_PUBLIC_API_BASE_URL as http://127.0.0.1:8000/api/, and restart Metro. If the server is up, check the browser Network tab for blocked requests (CORS).";
            }
            if (local) {
                return "Can't reach the API. On a real phone, localhost doesn't point to your Mac. Set EXPO_PUBLIC_API_BASE_URL to your Mac's LAN IP (e.g. http://192.168.x.x:8000/api/) and use `npx expo start --lan`, or use the production API URL. Then restart Metro.";
            }
            return "Can't reach the server. Check your connection, that the API is running, and EXPO_PUBLIC_API_BASE_URL in mobile/.env, then restart Metro with --clear.";
        }
        return msg || 'Could not create account';
    }

    if ((res?.status ?? 0) >= 500) return 'Something went wrong on our end. Please try again in a moment.';

    const d = res?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d.length) return friendlyValidation(d).message;
    if (d && typeof d === 'object' && 'message' in d) return String((d as { message?: string }).message);
    return res?.status ? 'Please check your details and try again.' : 'Could not create account';
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const WHITE = '#FFFFFF';
const CANVAS = '#F1F1EF';   // soft off-white screen canvas (matches onboarding) — keeps inputs/buttons white so they lift off it
const INK = '#111113';
const BORDER = '#E2E2E2';
const BORDER_FOCUS = '#111113';
const BORDER_ERR = '#C0452C';
const PH = '#A0A0A0';
const MUTED = '#6B6B6B';
const ERR_COLOR = '#C0452C';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SignupScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { signup } = useAuth();

    const [firstName, setFirstName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
    const [fieldErrorMessages, setFieldErrorMessages] = useState<Record<string, string>>({});
    const [apiError, setApiError] = useState<string | null>(null);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const usernameRef = useRef<TextInput>(null);
    const emailRef = useRef<TextInput>(null);
    const phoneRef = useRef<TextInput>(null);
    const passwordRef = useRef<TextInput>(null);

    const fade = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(18)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 500, delay: 80, useNativeDriver: true }),
            Animated.timing(slide, { toValue: 0, duration: 500, delay: 80, useNativeDriver: true }),
        ]).start();
    }, []);

    const clearErr = (field: string) => {
        setFieldErrors((p) => ({ ...p, [field]: false }));
        setFieldErrorMessages((p) => ({ ...p, [field]: '' }));
        setApiError(null);
    };

    const handleSignup = async () => {
        const err: Record<string, boolean> = {};
        const msgs: Record<string, string> = {};

        if (!firstName.trim()) { err.firstName = true; msgs.firstName = 'Name is required.'; }
        if (!username.trim()) { err.username = true; msgs.username = 'Username is required.'; }
        else if (username.length < 3) { err.username = true; msgs.username = 'Username needs at least 3 characters.'; }
        else if (!/^[a-zA-Z0-9_]+$/.test(username)) { err.username = true; msgs.username = 'Letters, numbers, and underscores only.'; }
        if (!email.trim()) { err.email = true; msgs.email = 'Email is required.'; }
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { err.email = true; msgs.email = 'Enter a valid email address.'; }
        if (!password) { err.password = true; msgs.password = 'Password is required.'; }
        else if (password.length < 8) { err.password = true; msgs.password = 'Password needs at least 8 characters.'; }

        setFieldErrors(err);
        setFieldErrorMessages(msgs);
        setApiError(null);
        if (Object.keys(err).length > 0) return;

        setLoading(true);
        try {
            const nameParts = firstName.trim().split(/\s+/);
            const fn = nameParts[0] || firstName.trim();
            const ln = nameParts.slice(1).join(' ') || fn;
            await signup(email, password, fn, ln, username, phone.trim() || undefined);
        } catch (error: any) {
            setFieldErrorMessages({});
            const detail = error?.response?.data?.detail;
            if (Array.isArray(detail) && detail.length) {
                const { message, field } = friendlyValidation(detail);
                if (field) {
                    setFieldErrors((p) => ({ ...p, [field]: true }));
                    setFieldErrorMessages((p) => ({ ...p, [field]: message }));
                } else {
                    setApiError(message);
                }
                return;
            }
            const msg = signupErrorMessage(error);
            const lower = msg.toLowerCase();
            if (lower.includes('username') && lower.includes('taken')) {
                setFieldErrors((p) => ({ ...p, username: true }));
                setFieldErrorMessages((p) => ({ ...p, username: 'That username is already taken.' }));
            } else if (lower.includes('email') && lower.includes('registered')) {
                setFieldErrors((p) => ({ ...p, email: true }));
                setFieldErrorMessages((p) => ({ ...p, email: 'That email is already registered.' }));
            } else {
                setApiError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = (field: string) => [
        s.input,
        focusedField === field && s.inputFocus,
        fieldErrors[field] && s.inputError,
    ];

    return (
        <View style={s.root}>
            {/* Nav bar */}
            <View style={[s.nav, { paddingTop: Math.max(insets.top, 14) }]}>
                <TouchableOpacity
                    style={s.navBtn}
                    onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Landing')}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                >
                    <Ionicons name="arrow-back" size={20} color={INK} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>

                        {/* Wordmark + title */}
                        <Text style={s.wordmark}>max</Text>
                        <Text style={s.title}>Create your account</Text>

                        {/* Fields */}
                        <View style={s.fields}>

                            {/* Full name */}
                            <View style={s.fieldWrap}>
                                <TextInput
                                    style={inputStyle('firstName')}
                                    placeholder="Full name"
                                    placeholderTextColor={PH}
                                    value={firstName}
                                    onChangeText={(t) => { setFirstName(t); clearErr('firstName'); }}
                                    autoCapitalize="words"
                                    textContentType="name"
                                    autoComplete="name"
                                    returnKeyType="next"
                                    onSubmitEditing={() => usernameRef.current?.focus()}
                                    onFocus={() => setFocusedField('firstName')}
                                    onBlur={() => setFocusedField(null)}
                                />
                                {fieldErrorMessages.firstName ? <Text style={s.fieldErr}>{fieldErrorMessages.firstName}</Text> : null}
                            </View>

                            {/* Username */}
                            <View style={s.fieldWrap}>
                                <TextInput
                                    ref={usernameRef}
                                    style={inputStyle('username')}
                                    placeholder="Username"
                                    placeholderTextColor={PH}
                                    value={username}
                                    onChangeText={(t) => { setUsername(t); clearErr('username'); }}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    textContentType="username"
                                    autoComplete="username"
                                    returnKeyType="next"
                                    onSubmitEditing={() => emailRef.current?.focus()}
                                    onFocus={() => setFocusedField('username')}
                                    onBlur={() => setFocusedField(null)}
                                />
                                {fieldErrorMessages.username ? <Text style={s.fieldErr}>{fieldErrorMessages.username}</Text> : null}
                            </View>

                            {/* Email */}
                            <View style={s.fieldWrap}>
                                <TextInput
                                    ref={emailRef}
                                    style={inputStyle('email')}
                                    placeholder="Email address"
                                    placeholderTextColor={PH}
                                    value={email}
                                    onChangeText={(t) => { setEmail(t); clearErr('email'); }}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    textContentType="emailAddress"
                                    autoComplete="email"
                                    returnKeyType="next"
                                    onSubmitEditing={() => phoneRef.current?.focus()}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                />
                                {fieldErrorMessages.email ? <Text style={s.fieldErr}>{fieldErrorMessages.email}</Text> : null}
                            </View>

                            {/* Phone — optional (used for SMS coaching; can be added later) */}
                            <View style={s.fieldWrap}>
                                <TextInput
                                    ref={phoneRef}
                                    style={inputStyle('phone')}
                                    placeholder="Phone number (optional)"
                                    placeholderTextColor={PH}
                                    value={phone}
                                    onChangeText={(t) => { setPhone(t); clearErr('phone'); }}
                                    keyboardType="phone-pad"
                                    autoComplete="tel"
                                    textContentType="telephoneNumber"
                                    returnKeyType="next"
                                    onSubmitEditing={() => passwordRef.current?.focus()}
                                    onFocus={() => setFocusedField('phone')}
                                    onBlur={() => setFocusedField(null)}
                                />
                            </View>

                            {/* Password */}
                            <View style={s.fieldWrap}>
                                <View style={[s.input, s.passwordRow, focusedField === 'password' && s.inputFocus, fieldErrors.password && s.inputError]}>
                                    <TextInput
                                        ref={passwordRef}
                                        style={s.passwordInput}
                                        placeholder="Password"
                                        placeholderTextColor={PH}
                                        value={password}
                                        onChangeText={(t) => { setPassword(t); clearErr('password'); }}
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        textContentType="newPassword"
                                        autoComplete="new-password"
                                        returnKeyType="done"
                                        onSubmitEditing={handleSignup}
                                        onFocus={() => setFocusedField('password')}
                                        onBlur={() => setFocusedField(null)}
                                    />
                                    <TouchableOpacity
                                        style={s.eyeBtn}
                                        onPress={() => setShowPassword((v) => !v)}
                                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={MUTED} />
                                    </TouchableOpacity>
                                </View>
                                {fieldErrorMessages.password ? <Text style={s.fieldErr}>{fieldErrorMessages.password}</Text> : null}
                            </View>

                        </View>

                        {/* API-level error */}
                        {apiError ? (
                            <View style={s.errBox}>
                                <Text style={s.errBoxText}>{apiError}</Text>
                            </View>
                        ) : null}

                        {/* Continue CTA */}
                        <TouchableOpacity
                            style={[s.ctaWrap, loading && s.ctaDisabled]}
                            onPress={handleSignup}
                            disabled={loading}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Continue"
                        >
                            <LiquidGlass radius={28} contentStyle={s.ctaContent}>
                                <Text style={s.ctaText}>{loading ? 'Creating account…' : 'Continue'}</Text>
                            </LiquidGlass>
                        </TouchableOpacity>

                        {/* OR divider */}
                        <View style={s.orRow}>
                            <View style={s.orLine} />
                            <Text style={s.orText}>OR</Text>
                            <View style={s.orLine} />
                        </View>

                        {/* Social sign-in */}
                        <View style={s.social}>
                            <GoogleSignInButton label="Continue with Google" />
                            <AppleSignInButton
                                label="Continue with Apple"
                                iconColor={INK}
                                textStyle={s.appleBtnText}
                                style={{ height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)' }}
                            />
                        </View>

                        {/* Terms */}
                        <Text style={s.terms}>
                            By tapping Continue, you agree to our{' '}
                            <Text
                                style={s.termsLink}
                                onPress={() => navigation.navigate('LegalDocument', { document: 'terms' })}
                            >
                                Terms
                            </Text>
                            {' '}and{' '}
                            <Text
                                style={s.termsLink}
                                onPress={() => navigation.navigate('LegalDocument', { document: 'privacy' })}
                            >
                                Privacy Policy
                            </Text>
                            .
                        </Text>

                        {/* Sign in link */}
                        <TouchableOpacity
                            style={s.signinRow}
                            onPress={() => navigation.navigate('Login')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                        >
                            <Text style={s.signinText}>
                                Already have an account?{' '}
                                <Text style={s.signinLink}>Sign in</Text>
                            </Text>
                        </TouchableOpacity>

                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: CANVAS },

    nav: {
        paddingHorizontal: 20,
        paddingBottom: 8,
    },
    navBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#F4F4F4',
        alignItems: 'center', justifyContent: 'center',
    },

    kav: { flex: 1 },
    scroll: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        ...(Platform.OS === 'web' ? { maxWidth: 440, alignSelf: 'center' as const, width: '100%' } : {}),
    },

    wordmark: {
        fontFamily: fonts.serif,
        fontSize: 48,
        color: INK,
        letterSpacing: -1.5,
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 6,
    },
    title: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 22,
        color: INK,
        textAlign: 'center',
        letterSpacing: -0.3,
        marginBottom: 28,
    },

    fields: { gap: 12 },
    fieldWrap: { gap: 4 },

    input: {
        height: 56,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER,
        paddingHorizontal: 16,
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: INK,
        backgroundColor: WHITE,
    },
    inputFocus: { borderColor: BORDER_FOCUS },
    inputError: { borderColor: BORDER_ERR },

    passwordRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 0,
    },
    passwordInput: {
        flex: 1,
        height: 54,
        paddingHorizontal: 16,
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: INK,
    },
    eyeBtn: { paddingHorizontal: 14 },

    fieldErr: {
        fontFamily: 'Matter-Regular',
        fontSize: 12,
        color: ERR_COLOR,
        marginLeft: 4,
    },

    errBox: {
        marginTop: 12,
        backgroundColor: '#FEF2F0',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F5C6C2',
        padding: 12,
    },
    errBoxText: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: ERR_COLOR,
        lineHeight: 18,
    },

    ctaWrap: { marginTop: 20, alignSelf: 'stretch' },
    ctaContent: {
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    ctaDisabled: { opacity: 0.45 },
    ctaText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 16,
        color: INK,
        letterSpacing: 0.2,
    },

    orRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
        gap: 12,
    },
    orLine: { flex: 1, height: 1, backgroundColor: '#EBEBEB' },
    orText: {
        fontFamily: 'Matter-Medium',
        fontSize: 11,
        color: '#BBBBBB',
        letterSpacing: 1.2,
    },

    social: { gap: 10 },
    appleContent: {
        height: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 24,
    },
    appleBtnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: INK,
        letterSpacing: 0.3,
    },

    terms: {
        fontFamily: 'Matter-Regular',
        fontSize: 12,
        color: '#AAAAAA',
        textAlign: 'center',
        lineHeight: 18,
        marginTop: 22,
        paddingHorizontal: 8,
    },
    termsLink: {
        color: MUTED,
        textDecorationLine: 'underline',
    },

    signinRow: { marginTop: 18, alignItems: 'center' },
    signinText: {
        fontFamily: 'Matter-Regular',
        fontSize: 14,
        color: MUTED,
    },
    signinLink: {
        fontFamily: 'Matter-SemiBold',
        color: INK,
    },
});

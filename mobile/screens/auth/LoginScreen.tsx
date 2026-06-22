import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Animated,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { fonts } from '../../theme/dark';

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

export default function LoginScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { login } = useAuth();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const passwordRef = useRef<TextInput>(null);

    const fade = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(18)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 500, delay: 80, useNativeDriver: true }),
            Animated.timing(slide, { toValue: 0, duration: 500, delay: 80, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleLogin = async () => {
        if (!identifier.trim() || !password) {
            setApiError('Please fill in all fields.');
            return;
        }
        setLoading(true);
        setApiError(null);
        try {
            await login(identifier.trim(), password);
        } catch (error: any) {
            const msg = error.response?.data?.detail || 'Invalid credentials';
            setApiError(typeof msg === 'string' ? msg : 'Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

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
                <Animated.View
                    style={[s.inner, { opacity: fade, transform: [{ translateY: slide }] }]}
                >
                    {/* Wordmark + title */}
                    <Text style={s.wordmark}>max</Text>
                    <Text style={s.title}>welcome back</Text>

                    {/* Fields */}
                    <View style={s.fields}>

                        {/* Identifier */}
                        <TextInput
                            style={[
                                s.input,
                                focusedField === 'id' && s.inputFocus,
                                apiError && s.inputError,
                            ]}
                            placeholder="Email or username"
                            placeholderTextColor={PH}
                            value={identifier}
                            onChangeText={(t) => { setIdentifier(t); setApiError(null); }}
                            keyboardType="default"
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="username"
                            autoComplete="username"
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            onFocus={() => setFocusedField('id')}
                            onBlur={() => setFocusedField(null)}
                            testID="email-input"
                        />

                        {/* Password */}
                        <View style={[
                            s.input, s.passwordRow,
                            focusedField === 'pw' && s.inputFocus,
                            apiError && s.inputError,
                        ]}>
                            <TextInput
                                ref={passwordRef}
                                style={s.passwordInput}
                                placeholder="Password"
                                placeholderTextColor={PH}
                                value={password}
                                onChangeText={(t) => { setPassword(t); setApiError(null); }}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="password"
                                autoComplete="current-password"
                                returnKeyType="go"
                                onSubmitEditing={handleLogin}
                                onFocus={() => setFocusedField('pw')}
                                onBlur={() => setFocusedField(null)}
                                testID="password-input"
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

                    </View>

                    {/* Forgot password */}
                    <TouchableOpacity
                        style={s.forgotRow}
                        onPress={() => navigation.navigate('ForgotPassword')}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                    >
                        <Text style={s.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>

                    {/* API error */}
                    {apiError ? (
                        <View style={s.errBox}>
                            <Text style={s.errBoxText}>{apiError}</Text>
                        </View>
                    ) : null}

                    {/* Continue CTA */}
                    <TouchableOpacity
                        style={[s.cta, loading && s.ctaDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Continue"
                    >
                        <Text style={s.ctaText}>{loading ? 'Signing in…' : 'Continue'}</Text>
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
                        <TouchableOpacity
                            style={s.appleBtn}
                            activeOpacity={0.85}
                            onPress={() => Alert.alert('Apple Sign In', 'Coming soon.')}
                            accessibilityRole="button"
                            accessibilityLabel="Continue with Apple"
                        >
                            <Ionicons name="logo-apple" size={18} color={INK} />
                            <Text style={s.appleBtnText}>Continue with Apple</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Create account link */}
                    <TouchableOpacity
                        style={s.signupRow}
                        onPress={() => navigation.navigate('Signup')}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="create account"
                        testID="create-account-btn"
                    >
                        <Text style={s.signupText}>
                            New here?{' '}
                            <Text style={s.signupLink}>create account</Text>
                        </Text>
                    </TouchableOpacity>

                </Animated.View>
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
    inner: {
        flex: 1,
        paddingHorizontal: 24,
        paddingBottom: 40,
        justifyContent: 'center',
        ...(Platform.OS === 'web' ? { maxWidth: 440, alignSelf: 'center' as const, width: '100%' } : {}),
    },

    wordmark: {
        fontFamily: fonts.serif,
        fontSize: 48,
        color: INK,
        letterSpacing: -1.5,
        textAlign: 'center',
        marginBottom: 6,
    },
    title: {
        fontFamily: 'Matter-Regular',
        fontSize: 22,
        color: INK,
        textAlign: 'center',
        letterSpacing: -0.3,
        marginBottom: 28,
    },

    fields: { gap: 12 },

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

    forgotRow: { alignItems: 'flex-end', marginTop: 10, marginBottom: 4 },
    forgotText: {
        fontFamily: 'Matter-Medium',
        fontSize: 13,
        color: MUTED,
    },

    errBox: {
        marginTop: 10,
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

    cta: {
        height: 56,
        borderRadius: 999,
        backgroundColor: INK,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
    },
    ctaDisabled: { opacity: 0.45 },
    ctaText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 16,
        color: WHITE,
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
    appleBtn: {
        height: 54,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: BORDER,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: WHITE,
    },
    appleBtnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: INK,
        letterSpacing: 0.3,
    },

    signupRow: { marginTop: 22, alignItems: 'center' },
    signupText: {
        fontFamily: 'Matter-Regular',
        fontSize: 14,
        color: MUTED,
    },
    signupLink: {
        fontFamily: 'Matter-Regular',
        color: INK,
    },
});

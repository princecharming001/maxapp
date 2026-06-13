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
} from 'react-native';
import { A11yBlurView as BlurView } from '../../components/glass/SolidFallback';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassButton } from '../../components/glass/GlassButton';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { GlassInput } from '../../components/glass/GlassInput';

const isWeb = Platform.OS === 'web';

export default function LoginScreen() {
    const navigation = useNavigation<any>();
    const { login } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    const passwordRef = useRef<TextInput>(null);

    const fadeCard = useRef(new Animated.Value(0)).current;
    const slideCard = useRef(new Animated.Value(20)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeCard, { toValue: 1, duration: 500, delay: 100, useNativeDriver: true }),
            Animated.timing(slideCard, { toValue: 0, duration: 500, delay: 100, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleLogin = async () => {
        if (!identifier.trim() || !password) {
            setApiError('Please fill in all fields');
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
        <ScreenBackdrop style={isWeb ? styles.webCenter : undefined}>
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <Animated.View
                    style={[styles.cardWrap, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}
                >
                    <GlassCard radius={30} intensity={44}>
                        <View style={styles.cardInner}>
                            <Text style={styles.wordmark}>max</Text>
                            <Text style={styles.tagline}>Looksmaxxing that fits your life</Text>

                            <View style={styles.form}>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>EMAIL, USERNAME, OR PHONE</Text>
                                    <GlassInput
                                        placeholder="you@example.com"
                                        value={identifier}
                                        onChangeText={(t) => {
                                            setIdentifier(t);
                                            setApiError(null);
                                        }}
                                        keyboardType="default"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        textContentType="username"
                                        autoComplete="username"
                                        returnKeyType="next"
                                        onSubmitEditing={() => passwordRef.current?.focus()}
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>PASSWORD</Text>
                                    <View style={styles.glassField}>
                                        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
                                        <View style={styles.glassFieldInner}>
                                            <TextInput
                                                ref={passwordRef}
                                                style={styles.passwordInput}
                                                placeholder="Enter your password"
                                                placeholderTextColor="#9A9AA2"
                                                value={password}
                                                onChangeText={(t) => {
                                                    setPassword(t);
                                                    setApiError(null);
                                                }}
                                                secureTextEntry={!showPassword}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                textContentType="password"
                                                autoComplete="current-password"
                                                returnKeyType="go"
                                                onSubmitEditing={handleLogin}
                                            />
                                            <TouchableOpacity
                                                style={styles.viewPasswordBtn}
                                                onPress={() => setShowPassword((v) => !v)}
                                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                                accessibilityRole="button"
                                                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                <Ionicons
                                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                                    size={20}
                                                    color="#8A8A92"
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>

                                {apiError && (
                                    <View style={styles.apiErrorBox}>
                                        <Text style={styles.apiErrorText}>{apiError}</Text>
                                    </View>
                                )}

                                <GlassButton
                                    variant="primary"
                                    label={loading ? 'Signing in…' : 'Sign In'}
                                    onPress={handleLogin}
                                    loading={loading}
                                    style={styles.submit}
                                />

                                <View style={styles.orRow}>
                                    <View style={styles.orLine} />
                                    <Text style={styles.orText}>or</Text>
                                    <View style={styles.orLine} />
                                </View>
                                <GoogleSignInButton />

                                <TouchableOpacity
                                    onPress={() => navigation.navigate('ForgotPassword')}
                                    activeOpacity={0.6}
                                    style={styles.forgotLink}
                                    accessibilityRole="button"
                                    accessibilityLabel="Forgot password"
                                >
                                    <Text style={styles.forgotText}>Forgot password?</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                onPress={() => navigation.navigate('Signup')}
                                activeOpacity={0.6}
                                style={styles.linkContainer}
                                accessibilityRole="button"
                                accessibilityLabel="Create account"
                            >
                                <Text style={styles.linkText}>
                                    New here? <Text style={styles.linkBold}>Create account</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </GlassCard>
                </Animated.View>
            </KeyboardAvoidingView>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    webCenter: { alignItems: 'center' },
    keyboardView: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        width: '100%',
        ...(isWeb && { maxWidth: 460, alignSelf: 'center' }),
    },
    cardWrap: { width: '100%' },
    cardInner: { padding: 26 },
    wordmark: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 50,
        color: '#111113',
        letterSpacing: -1.5,
        textAlign: 'center',
        marginBottom: 6,
    },
    tagline: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: '#8A8A92',
        textAlign: 'center',
        marginBottom: 30,
        letterSpacing: 0.4,
    },
    form: { gap: 16 },
    inputGroup: { gap: 7 },
    label: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 10.5,
        letterSpacing: 1.4,
        color: '#8A8A92',
        marginLeft: 2,
    },
    glassField: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        borderCurve: 'continuous',
    },
    glassFieldInner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.78)',
    },
    passwordInput: {
        flex: 1,
        height: 54,
        paddingLeft: 16,
        paddingRight: 8,
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: '#111113',
    },
    viewPasswordBtn: { paddingVertical: 12, paddingHorizontal: 12, marginRight: 4 },
    apiErrorBox: {
        backgroundColor: 'rgba(178,58,58,0.08)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(178,58,58,0.18)',
    },
    apiErrorText: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#B23A3A' },
    submit: { marginTop: 4 },
    orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
    orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(17,17,19,0.15)' },
    orText: { fontFamily: 'Matter-Medium', fontSize: 12, color: '#8A8A92' },
    forgotLink: { marginTop: 10, alignItems: 'center' },
    forgotText: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#8A8A92' },
    linkContainer: { marginTop: 22, alignItems: 'center' },
    linkText: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#8A8A92' },
    linkBold: { fontFamily: 'Matter-SemiBold', color: '#111113' },
});

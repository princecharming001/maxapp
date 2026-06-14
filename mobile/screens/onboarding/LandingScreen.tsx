import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { A11yBlurView as BlurView } from '../../components/glass/SolidFallback';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { GlassCard } from '../../components/glass/GlassCard';
import { PastelCard } from '../../components/glass/PastelCard';
import { GlassButton } from '../../components/glass/GlassButton';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';

const isWeb = Platform.OS === 'web';
const WEB_MAX_WIDTH = 440;

export default function LandingScreen() {
    const navigation = useNavigation<any>();
    const { fauxSignup, fauxSkipSignup, fauxFreshSignup } = useAuth();
    const [demoLoading, setDemoLoading] = useState(false);
    const [skipLoading, setSkipLoading] = useState(false);
    const [freshLoading, setFreshLoading] = useState(false);

    const handleTryNow = async () => {
        if (demoLoading) return;
        setDemoLoading(true);
        try {
            await fauxSignup();
        } catch (e: any) {
            const msg = e?.response?.data?.detail ?? e?.message ?? 'Something went wrong';
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert('Error', msg);
            }
        } finally {
            setDemoLoading(false);
        }
    };

    const handleDevOnboarding = async () => {
        // DEV ONLY: throwaway account with empty onboarding so we land on
        // the first onboarding question. Lets us replay the flow without
        // typing the signup form every time.
        if (freshLoading) return;
        setFreshLoading(true);
        try {
            await fauxFreshSignup();
        } catch (e: any) {
            const msg = e?.response?.data?.detail ?? e?.message ?? 'Something went wrong';
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Error', msg);
        } finally {
            setFreshLoading(false);
        }
    };

    const handleSkip = async () => {
        if (skipLoading) return;
        setSkipLoading(true);
        // eslint-disable-next-line no-console
        console.log('[Skip] click → calling fauxSkipSignup…');
        try {
            await fauxSkipSignup();
            // eslint-disable-next-line no-console
            console.log('[Skip] fauxSkipSignup resolved — auth state should switch to Main; if it does not within 1.5s we hard-reload');
            if (Platform.OS === 'web') {
                // Belt-and-braces: if RootNavigator's reactive re-route doesn't kick in
                // (stale stackKey, mid-transition focus), force a reload so the boot
                // path picks up the now-stored tokens and routes to Main.
                window.setTimeout(() => {
                    if (typeof window !== 'undefined' && window.location?.pathname && !/\/(home|main)/i.test(window.location.pathname || '')) {
                        // eslint-disable-next-line no-console
                        console.log('[Skip] reactive re-route did not fire — reloading to /');
                        window.location.replace('/');
                    }
                }, 1500);
            }
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error('[Skip] fauxSkipSignup failed:', e);
            const msg = e?.response?.data?.detail ?? e?.message ?? 'Something went wrong';
            if (Platform.OS === 'web') {
                window.alert(`Skip failed: ${msg}`);
            } else {
                Alert.alert('Error', msg);
            }
        } finally {
            setSkipLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            {/* Craft aesthetic: flat warm paper, no orbs/blur. */}
            {isWeb ? (
                <TouchableOpacity
                    style={styles.skipPill}
                    activeOpacity={0.8}
                    onPress={handleSkip}
                    disabled={skipLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Skip to home"
                >
                    <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={styles.skipPillInner}>
                        {skipLoading ? (
                            <ActivityIndicator size="small" color="#1C1A17" />
                        ) : (
                            <>
                                <Text style={styles.skipPillText}>Skip</Text>
                                <Ionicons name="chevron-forward" size={14} color="#1C1A17" />
                            </>
                        )}
                    </View>
                </TouchableOpacity>
            ) : null}

            <View style={styles.content}>
                <View style={styles.hero}>
                    <Text style={styles.heroLogo}>max</Text>
                    <Text style={styles.heroLine1}>Your AI <Text style={{ fontFamily: 'Fraunces-Italic', fontSize: 17, color: '#1C1A17' }}>looksmaxxing</Text> coach.</Text>
                    <Text style={styles.heroLine2}>Personalized advice, texted daily.</Text>
                </View>

                <PastelCard tone="blue" radius={28} style={styles.ctaCard}>
                    <View style={styles.ctaInner}>
                        <GlassButton
                            variant="primary"
                            label="Sign In"
                            onPress={() => navigation.navigate('Login')}
                        />
                        <GlassButton
                            variant="glass"
                            label="Create account"
                            onPress={() => navigation.navigate('Signup')}
                        />
                        <GoogleSignInButton />
                        {isWeb ? (
                            <GlassButton
                                variant="ghost"
                                label="Try it first. No account needed"
                                onPress={handleTryNow}
                                loading={demoLoading}
                            />
                        ) : null}
                        {/* DEV-only buttons: bypass signup form to test specific
                            app states. Compiled out in prod builds. */}
                        {__DEV__ ? (
                            <View style={styles.devStack}>
                                <TouchableOpacity
                                    style={styles.devButton}
                                    activeOpacity={0.7}
                                    onPress={handleDevOnboarding}
                                    disabled={freshLoading}
                                >
                                    {freshLoading ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.devButtonText}>DEV → Test onboarding flow</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.devButton}
                                    activeOpacity={0.7}
                                    onPress={handleSkip}
                                    disabled={skipLoading}
                                >
                                    {skipLoading ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.devButtonText}>DEV → Skip to home (paid demo)</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ) : null}
                    </View>
                </PastelCard>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#F7F0EA',
        ...(isWeb && { alignItems: 'center' as const }),
    },
    content: {
        flex: 1,
        width: '100%',
        paddingHorizontal: 28,
        paddingTop: 104,
        paddingBottom: 56,
        justifyContent: 'space-between',
        ...(isWeb && { maxWidth: WEB_MAX_WIDTH }),
    },
    hero: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroLogo: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 66,
        fontWeight: '300',
        color: '#1C1A17',
        letterSpacing: -2,
        marginBottom: 28,
        lineHeight: 72,
    },
    heroLine1: {
        fontFamily: 'Matter-Medium',
        fontSize: 16,
        color: '#5C574E',
        marginBottom: 8,
        textAlign: 'center',
        letterSpacing: 0.2,
        lineHeight: 24,
    },
    heroLine2: {
        fontFamily: 'Matter-Regular',
        fontSize: 16,
        color: '#97928A',
        textAlign: 'center',
        letterSpacing: 0.2,
        lineHeight: 24,
    },
    ctaCard: {
        width: '100%',
    },
    ctaInner: {
        padding: 16,
        gap: 10,
    },
    devStack: {
        marginTop: 6,
        gap: 6,
    },
    devButton: {
        backgroundColor: 'rgba(10,10,11,0.85)',
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
    },
    devButtonText: {
        color: '#fff',
        fontFamily: 'Matter-Bold',
        fontSize: 11,
        letterSpacing: 1.2,
    },
    skipPill: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 28,
        right: 20,
        zIndex: 10,
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        minWidth: 70,
        minHeight: 34,
        ...(isWeb && { cursor: 'pointer' as const }),
    },
    skipPillInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingVertical: 7,
        paddingLeft: 14,
        paddingRight: 10,
        backgroundColor: 'rgba(255,255,255,0.45)',
    },
    skipPillText: {
        fontFamily: 'Matter-Medium',
        fontSize: 12,
        letterSpacing: 0.3,
        color: '#1C1A17',
    },
});

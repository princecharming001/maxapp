import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
    Alert,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import ShineOverlay from '../../components/ShineOverlay';

const isWeb = Platform.OS === 'web';
const WEB_MAX_WIDTH = 440;

const INK = '#1C1A17';
const CREAM = '#F7F0EA';

// Editorial face hero — leads the screen with a man's face (media-centric),
// fading into cream where the brand + auth live.
const HERO = require('../../assets/landing-hero.webp');

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
            <View style={styles.phone}>
                <Image source={HERO} style={styles.heroImg} resizeMode="cover" />
                {/* Cream scrim — face up top, fades to solid cream for the brand + CTAs. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(247,240,234,0)', 'rgba(247,240,234,0)', CREAM, CREAM]}
                    locations={[0, 0.4, 0.58, 1]}
                    style={StyleSheet.absoluteFill}
                />

                {isWeb ? (
                    <TouchableOpacity
                        style={styles.skipPill}
                        activeOpacity={0.7}
                        onPress={handleSkip}
                        disabled={skipLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Skip to home"
                    >
                        {skipLoading ? (
                            <ActivityIndicator size="small" color={INK} />
                        ) : (
                            <>
                                <Text style={styles.skipPillText}>Skip</Text>
                                <Ionicons name="chevron-forward" size={13} color={INK} />
                            </>
                        )}
                    </TouchableOpacity>
                ) : null}

                <View style={styles.content}>
                    {/* ── Brand, set over the cream like an editorial cover line ── */}
                    <View style={styles.brand}>
                        <Text style={styles.heroLogo}>max</Text>
                        <Text style={styles.heroLine}>
                            Your <Text style={styles.heroItalic}>looksmaxxing</Text> coach.
                        </Text>
                    </View>

                    {/* ── Auth: one primary, one quiet social, sign-in as a link ── */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.primaryBtn}
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('Signup')}
                            accessibilityRole="button"
                            accessibilityLabel="Create account"
                        >
                            <ShineOverlay />
                            <Text style={styles.primaryBtnText}>Create account</Text>
                        </TouchableOpacity>

                        <GoogleSignInButton />

                        <View style={styles.signinRow}>
                            <Text style={styles.signinMuted}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={8} activeOpacity={0.7}>
                                <Text style={styles.signinLink}>Sign in</Text>
                            </TouchableOpacity>
                        </View>

                        {isWeb ? (
                            <TouchableOpacity
                                style={styles.tryLink}
                                activeOpacity={0.7}
                                onPress={handleTryNow}
                                disabled={demoLoading}
                                accessibilityRole="button"
                                accessibilityLabel="Try it first, no account needed"
                            >
                                {demoLoading ? (
                                    <ActivityIndicator size="small" color="#97928A" />
                                ) : (
                                    <Text style={styles.tryLinkText}>Try it first — no account needed</Text>
                                )}
                            </TouchableOpacity>
                        ) : null}

                        {/* DEV-only: bypass signup to test app states. Compiled out in prod. */}
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
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: CREAM,
        ...(isWeb && { alignItems: 'center' as const }),
    },
    phone: {
        flex: 1,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#E7DFCF',
        ...(isWeb && { maxWidth: WEB_MAX_WIDTH }),
    },
    heroImg: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
    },
    content: {
        flex: 1,
        width: '100%',
        paddingHorizontal: 28,
        paddingTop: 104,
        paddingBottom: 44,
        justifyContent: 'flex-end',
    },

    // ── Brand ──
    brand: {
        alignItems: 'flex-start',
        marginBottom: 26,
    },
    heroLogo: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 64,
        fontWeight: '300',
        color: INK,
        letterSpacing: -2.5,
        lineHeight: 66,
        marginBottom: 10,
    },
    heroLine: {
        fontFamily: 'Matter-Medium',
        fontSize: 16.5,
        color: '#5C574E',
        textAlign: 'left',
        letterSpacing: 0.2,
        lineHeight: 24,
    },
    heroItalic: {
        fontFamily: 'Fraunces-Italic',
        fontSize: 17.5,
        color: INK,
    },

    // ── Actions ──
    actions: {
        width: '100%',
        gap: 12,
    },
    signinRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    signinMuted: {
        fontFamily: 'Matter-Regular',
        fontSize: 13.5,
        color: '#97928A',
    },
    signinLink: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13.5,
        color: INK,
    },
    primaryBtn: {
        backgroundColor: INK,
        borderRadius: 999,
        paddingVertical: 17,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    primaryBtnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: CREAM,
        letterSpacing: 0.1,
    },
    tryLink: {
        alignItems: 'center',
        paddingVertical: 12,
        marginTop: 2,
    },
    tryLinkText: {
        fontFamily: 'Matter-Medium',
        fontSize: 13.5,
        color: '#97928A',
        letterSpacing: 0.2,
    },

    // ── DEV ──
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

    // ── Skip ──
    skipPill: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 28,
        right: 20,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.6)',
        backgroundColor: 'rgba(247,240,234,0.7)',
        paddingVertical: 8,
        paddingLeft: 15,
        paddingRight: 11,
        ...(isWeb && { cursor: 'pointer' as const }),
    },
    skipPillText: {
        fontFamily: 'Matter-Medium',
        fontSize: 13,
        letterSpacing: 0.2,
        color: INK,
    },
});

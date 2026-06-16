import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import ShineOverlay from '../../components/ShineOverlay';

const isWeb = Platform.OS === 'web';
const WEB_MAX_WIDTH = 440;

const INK = '#1C1A17';
const WHITE = '#FFFFFF';

// The whole screen is the face; brand + auth live in a frosted window at the
// bottom (reference: a "scan your face" hero).
const HERO = require('../../assets/landing-hero.webp');

export default function LandingScreen() {
    const navigation = useNavigation<any>();

    return (
        <View style={styles.root}>
            <View style={styles.phone}>
                <Image source={HERO} style={styles.heroImg} resizeMode="cover" />

                {/* Bottom-up scrim so the headline reads over the photo. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(26,18,12,0)', 'rgba(26,18,12,0)', 'rgba(26,18,12,0.42)']}
                    locations={[0, 0.48, 1]}
                    style={StyleSheet.absoluteFill}
                />

                {/* ── Headline overlay + frosted auth window ── */}
                <View style={styles.bottomStack}>
                    <Text style={styles.headline}>Your looks,{'\n'}maxed.</Text>

                    <BlurView intensity={42} tint="light" style={styles.glass}>
                        <View style={styles.glassTint} pointerEvents="none" />
                        <View style={styles.handle} />

                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={styles.primaryBtn}
                                activeOpacity={0.9}
                                onPress={() => navigation.navigate('Signup')}
                                accessibilityRole="button"
                                accessibilityLabel="Get started"
                            >
                                <ShineOverlay />
                                <Text style={styles.primaryBtnText}>Get started</Text>
                            </TouchableOpacity>

                            <GoogleSignInButton variant="glass" />

                            <View style={styles.signinRow}>
                                <Text style={styles.signinMuted}>Already have an account? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={8} activeOpacity={0.7}>
                                    <Text style={styles.signinLink}>Sign in</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </BlurView>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#1B140E',
        ...(isWeb && { alignItems: 'center' as const }),
    },
    phone: {
        flex: 1,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#A99A88',
        ...(isWeb && { maxWidth: WEB_MAX_WIDTH }),
    },
    heroImg: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
    },

    // ── Bottom stack (headline over the face + frosted window) ──
    bottomStack: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
    headline: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 42,
        fontWeight: '400',
        color: WHITE,
        letterSpacing: -1.6,
        lineHeight: 44,
        paddingHorizontal: 30,
        marginBottom: 18,
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 12,
    },

    // ── Frosted window ──
    glass: {
        borderTopLeftRadius: 34,
        borderTopRightRadius: 34,
        overflow: 'hidden',
        paddingTop: 12,
        paddingHorizontal: 24,
        paddingBottom: isWeb ? 30 : 46,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.35)',
    },
    glassTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(120,96,72,0.42)',
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.5)',
        marginBottom: 18,
    },

    // ── Actions ──
    actions: {
        width: '100%',
        gap: 12,
    },
    primaryBtn: {
        height: 56,
        backgroundColor: WHITE,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderCurve: 'continuous',
    },
    primaryBtnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15.5,
        color: INK,
        letterSpacing: 0.2,
    },
    signinRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
    },
    signinMuted: {
        fontFamily: 'Matter-Regular',
        fontSize: 13.5,
        color: 'rgba(255,255,255,0.82)',
    },
    signinLink: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13.5,
        color: WHITE,
    },
});

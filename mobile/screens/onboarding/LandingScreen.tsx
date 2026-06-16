import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import ShineOverlay from '../../components/ShineOverlay';

const isWeb = Platform.OS === 'web';
const WEB_MAX_WIDTH = 440;

const INK = '#1C1A17';
const WHITE = '#FFFFFF';

// Full-bleed editorial face — the whole screen IS the image. Brand + auth float
// over a bottom scrim, no panel.
const HERO = require('../../assets/landing-hero.webp');

export default function LandingScreen() {
    const navigation = useNavigation<any>();

    return (
        <View style={styles.root}>
            <View style={styles.phone}>
                <Image source={HERO} style={styles.heroImg} resizeMode="cover" />

                {/* Bottom-up scrim so the brand + buttons stay legible over the photo. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(18,15,12,0)', 'rgba(18,15,12,0)', 'rgba(18,15,12,0.5)', 'rgba(18,15,12,0.96)']}
                    locations={[0, 0.34, 0.6, 1]}
                    style={StyleSheet.absoluteFill}
                />
                {/* Faint top scrim to seat the brand pill. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(18,15,12,0.35)', 'rgba(18,15,12,0)']}
                    locations={[0, 1]}
                    style={styles.topScrim}
                />

                {/* Brand pill, top-center. */}
                <View style={styles.brandPill}>
                    <Text style={styles.brandPillText}>max</Text>
                </View>

                {/* ── Floating brand + auth ── */}
                <View style={styles.bottom}>
                    <Text style={styles.heroLogo}>Your looks,{'\n'}maxed.</Text>
                    <Text style={styles.heroLine}>
                        Your <Text style={styles.heroItalic}>looksmaxxing</Text> coach.
                    </Text>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.primaryBtn}
                            activeOpacity={0.9}
                            onPress={() => navigation.navigate('Signup')}
                            accessibilityRole="button"
                            accessibilityLabel="Create account"
                        >
                            <ShineOverlay />
                            <Text style={styles.primaryBtnText}>Create account</Text>
                        </TouchableOpacity>

                        <GoogleSignInButton variant="glass" />

                        <View style={styles.signinRow}>
                            <Text style={styles.signinMuted}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={8} activeOpacity={0.7}>
                                <Text style={styles.signinLink}>Sign in</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#100D0A',
        ...(isWeb && { alignItems: 'center' as const }),
    },
    phone: {
        flex: 1,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#100D0A',
        ...(isWeb && { maxWidth: WEB_MAX_WIDTH }),
    },
    heroImg: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
    },
    topScrim: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 130,
    },

    // ── Top brand pill ──
    brandPill: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 26,
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.4)',
        zIndex: 10,
    },
    brandPillText: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 19,
        fontWeight: '500',
        letterSpacing: -0.5,
        color: WHITE,
    },

    // ── Floating bottom content ──
    bottom: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 28,
        paddingBottom: isWeb ? 36 : 50,
    },
    heroLogo: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 46,
        fontWeight: '400',
        color: WHITE,
        letterSpacing: -1.8,
        lineHeight: 48,
        marginBottom: 10,
    },
    heroLine: {
        fontFamily: 'Matter-Medium',
        fontSize: 15,
        color: 'rgba(255,255,255,0.78)',
        letterSpacing: 0.2,
        lineHeight: 22,
        marginBottom: 26,
    },
    heroItalic: {
        fontFamily: 'Fraunces-Italic',
        fontSize: 16,
        color: WHITE,
    },

    // ── Actions ──
    actions: {
        width: '100%',
        gap: 12,
    },
    primaryBtn: {
        height: 54,
        backgroundColor: WHITE,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderCurve: 'continuous',
    },
    primaryBtnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: INK,
        letterSpacing: 0.2,
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
        color: 'rgba(255,255,255,0.7)',
    },
    signinLink: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13.5,
        color: WHITE,
    },
});

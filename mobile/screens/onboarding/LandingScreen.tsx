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
const CREAM = '#F7F0EA';

// Media-centric hero — a real frontal face (web photo), with auth living in a
// frosted translucent window over it.
const HERO = require('../../assets/landing-hero.webp');

export default function LandingScreen() {
    const navigation = useNavigation<any>();

    return (
        <View style={styles.root}>
            <View style={styles.phone}>
                <Image source={HERO} style={styles.heroImg} resizeMode="cover" />

                {/* Soft top vignette so the brand pill stays legible. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(20,17,14,0.16)', 'rgba(20,17,14,0)']}
                    locations={[0, 1]}
                    style={styles.topVignette}
                />

                {/* Brand pill, top-center — echoes the reference's status pill. */}
                <View style={styles.brandPill}>
                    <Text style={styles.brandPillText}>max</Text>
                </View>

                {/* ── Frosted translucent window with the brand + auth ── */}
                <BlurView intensity={48} tint="light" style={styles.glass}>
                    <View style={styles.glassTint} pointerEvents="none" />
                    <View style={styles.handle} />

                    <View style={styles.brand}>
                        <Text style={styles.heroLogo}>Your looks,{'\n'}maxed.</Text>
                        <Text style={styles.heroLine}>
                            Your <Text style={styles.heroItalic}>looksmaxxing</Text> coach.
                        </Text>
                    </View>

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
                    </View>
                </BlurView>
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
        backgroundColor: '#C7CBD0',
        ...(isWeb && { maxWidth: WEB_MAX_WIDTH }),
    },
    heroImg: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
    },
    topVignette: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 150,
    },

    // ── Top brand pill (frosted) ──
    brandPill: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 26,
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.7)',
        zIndex: 10,
    },
    brandPillText: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 19,
        fontWeight: '500',
        letterSpacing: -0.5,
        color: INK,
    },

    // ── Frosted window ──
    glass: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: 34,
        borderTopRightRadius: 34,
        overflow: 'hidden',
        paddingTop: 10,
        paddingHorizontal: 26,
        paddingBottom: isWeb ? 34 : 46,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    glassTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(247,240,234,0.62)',
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(28,26,23,0.18)',
        marginBottom: 16,
    },

    // ── Brand (inside window) ──
    brand: {
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    heroLogo: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 34,
        fontWeight: '400',
        color: INK,
        letterSpacing: -1.2,
        lineHeight: 36,
        marginBottom: 8,
    },
    heroLine: {
        fontFamily: 'Matter-Medium',
        fontSize: 14.5,
        color: '#5C574E',
        textAlign: 'left',
        letterSpacing: 0.2,
        lineHeight: 21,
    },
    heroItalic: {
        fontFamily: 'Fraunces-Italic',
        fontSize: 15.5,
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
        color: '#6F6A61',
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
});

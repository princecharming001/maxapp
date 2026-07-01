import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import ShineOverlay from '../../components/ShineOverlay';

const isWeb = Platform.OS === 'web';
const WEB_MAX_WIDTH = 440;

const INK = '#1C1A17';
const WHITE = '#FFFFFF';

// The whole screen is the face — it bleeds edge-to-edge into a soft gradient;
// brand + auth float over it (no panel). A pixelated-but-realistic portrait
// rendered entirely in the brand orange/blue (Explore icon hues).
const HERO = require('../../assets/landing-hero.webp');

export default function LandingScreen() {
    const navigation = useNavigation<any>();
    const { startAnon } = useAuth();
    const [starting, setStarting] = useState(false);

    // "Get started" mints a free anonymous account; the RootNavigator then switches
    // to the funnel (onboarding -> scan). The account is claimed before the paywall.
    const onGetStarted = async () => {
        if (starting) return;
        setStarting(true);
        try {
            await startAnon();
        } catch (e: any) {
            setStarting(false);  // keep the button tappable so a retry works
            // The anon-signup endpoint is rate-limited per IP; a 429 (e.g. rapid
            // taps, or many users behind one NAT) needs a "try again shortly"
            // message, not the generic error.
            if (e?.response?.status === 429) {
                Alert.alert('One moment', 'Too many attempts right now. Please try again in a minute.');
            } else {
                Alert.alert('Something went wrong', 'Could not get you started just now. Please try again.');
            }
        }
    };

    return (
        <View style={styles.root}>
            <View style={styles.phone}>
                <Image source={HERO} style={styles.heroImg} resizeMode="cover" />

                {/* Edge-to-edge scrim — the photo dissolves into black at the base. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(14,10,7,0)', 'rgba(14,10,7,0)', 'rgba(14,10,7,0.55)', 'rgba(14,10,7,0.92)']}
                    locations={[0, 0.4, 0.72, 1]}
                    style={StyleSheet.absoluteFill}
                />

                <View style={styles.bottom}>
                    <Text style={styles.headline}>Your looks,{'\n'}maxed.</Text>
                    <Text style={styles.sub}>Scan your face. Get your plan. Glow up.</Text>

                    <TouchableOpacity
                        style={styles.primaryBtn}
                        activeOpacity={0.9}
                        onPress={onGetStarted}
                        disabled={starting}
                        accessibilityRole="button"
                        accessibilityLabel="Get started"
                    >
                        <ShineOverlay />
                        <Text style={styles.primaryBtnText}>Get started</Text>
                        <Ionicons name="arrow-forward" size={18} color={INK} style={styles.primaryArrow} />
                    </TouchableOpacity>

                    <View style={styles.signinRow}>
                        <Text style={styles.signinMuted}>Already have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={8} activeOpacity={0.7} accessibilityLabel="Sign in">
                            <Text style={styles.signinLink}>Sign in</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#0E0A07',
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

    bottom: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 28,
        paddingBottom: isWeb ? 40 : 52,
    },
    headline: {
        fontFamily: 'PlayfairDisplay',
        fontSize: 50,
        fontWeight: '400',
        color: WHITE,
        letterSpacing: -2,
        lineHeight: 52,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 14,
    },
    sub: {
        fontFamily: 'Matter-Medium',
        fontSize: 15,
        color: 'rgba(255,255,255,0.82)',
        letterSpacing: 0.2,
        lineHeight: 22,
        marginTop: 12,
        marginBottom: 28,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 10,
    },

    // ── Primary CTA ──
    primaryBtn: {
        height: 58,
        backgroundColor: WHITE,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderCurve: 'continuous',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }
            : { elevation: 8 }),
    },
    primaryBtnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 16,
        color: INK,
        letterSpacing: 0.2,
    },
    primaryArrow: {
        marginLeft: 9,
    },

    signinRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 18,
    },
    signinMuted: {
        fontFamily: 'Matter-Regular',
        fontSize: 13.5,
        color: 'rgba(255,255,255,0.78)',
    },
    signinLink: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13.5,
        color: WHITE,
    },
});

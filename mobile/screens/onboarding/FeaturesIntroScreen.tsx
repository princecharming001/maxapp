import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, useWindowDimensions, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassFill } from '../../components/glass/LiquidGlass';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fonts } from '../../theme/dark';
import { useAuth } from '../../context/AuthContext';
import OnairosConnectModal from '../../components/OnairosConnectModal';
import { useOnairosConfig } from '../../hooks/useOnairosConfig';

const ONAIROS_PROMPTED_KEY = 'onairos_onboarding_prompted_v1';

const HERO = require('../../assets/scan-hero.png');
const INK = '#16131A';

// The three frosted windows that float at the bottom — a preview of the score
// breakdown the scan returns. Sample fills are decorative (locked until scan).
const METRICS = [
    { label: 'Rating', value: 82 },
    { label: 'Jawline', value: 80 },
    { label: 'Skin', value: 74 },
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SZ = 56;
const RING_STK = 5;
const RING_R = (RING_SZ - RING_STK) / 2;
const RING_CIRC = 2 * Math.PI * RING_R;

function Ring({ pct, delay = 0 }: { pct: number; delay?: number }) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: pct,
            duration: 900,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, []);

    const dashOffset = anim.interpolate({
        inputRange: [0, 100],
        outputRange: [RING_CIRC, 0],
        extrapolate: 'clamp',
    });

    return (
        <View style={r.wrap}>
            <Svg width={RING_SZ} height={RING_SZ} style={r.svg}>
                <Circle
                    cx={RING_SZ / 2} cy={RING_SZ / 2} r={RING_R}
                    stroke="rgba(255,255,255,0.22)" strokeWidth={RING_STK} fill="none"
                />
                <AnimatedCircle
                    cx={RING_SZ / 2} cy={RING_SZ / 2} r={RING_R}
                    stroke="#FFFFFF" strokeWidth={RING_STK} fill="none"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset={dashOffset}
                />
            </Svg>
            <Text style={r.pct}>{pct}</Text>
        </View>
    );
}

export default function FeaturesIntroScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { width: winW, height: winH } = useWindowDimensions();
    const { user, isPaid } = useAuth();

    const hasScan = user?.first_scan_completed;

    const [onairosVisible, setOnairosVisible] = useState(false);
    const { enabled: onairosEnabled } = useOnairosConfig();

    // First-time-only Onairos prompt: shown on initial entry to this screen
    // for users who haven't scanned yet. Skip if env key is missing or user
    // already saw it. Errors in storage just suppress the prompt — never block.
    useEffect(() => {
        if (!onairosEnabled || hasScan) return;
        let cancelled = false;
        (async () => {
            try {
                const seen = await AsyncStorage.getItem(ONAIROS_PROMPTED_KEY);
                if (!cancelled && !seen) {
                    setOnairosVisible(true);
                }
            } catch {
                // ignore — never block onboarding on a storage hiccup
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [onairosEnabled, hasScan]);

    const dismissOnairos = async () => {
        setOnairosVisible(false);
        try {
            await AsyncStorage.setItem(ONAIROS_PROMPTED_KEY, '1');
        } catch {
            // ignore
        }
    };

    const showResults = hasScan && !isPaid;
    const onCta = () => navigation.navigate(showResults ? 'FaceScanResults' : 'FaceScan');

    return (
        <View style={s.container}>
            {/* Full-bleed, forward-facing portrait on a light backdrop. Explicit
                window dimensions so `cover` centre-crops the face reliably on web
                (absoluteFill can anchor the crop to a corner there). */}
            <Image source={HERO} style={{ position: 'absolute', top: 0, left: 0, width: winW, height: winH }} resizeMode="cover" />

            {/* Dark gradient — photo stays bright at the face, fades to black at the bottom */}
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.90)']}
                locations={[0, 0.42, 0.68, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/* Scan-frame brackets — a large area around the face */}
            <View pointerEvents="none" style={[s.scanFrame, { top: insets.top + 66 }]}>
                <View style={[c.base, c.tl]} />
                <View style={[c.base, c.tr]} />
                <View style={[c.base, c.bl]} />
                <View style={[c.base, c.br]} />
            </View>

            {/* Top bar — back only when there's somewhere to go back to */}
            <View style={[s.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
                {navigation.canGoBack() ? (
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                >
                    <View style={s.backBtn}>
                        <LiquidGlassFill idSuffix="introback" />
                        <Ionicons name="arrow-back" size={20} color={INK} />
                    </View>
                </TouchableOpacity>
                ) : null}

                <View />
            </View>

            {/* Bottom: headline + frosted score windows + CTA */}
            <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 28) + 16 }]}>
                <View style={s.bottomInner}>
                    <Text style={s.headline} numberOfLines={1} adjustsFontSizeToFit>Built for your face</Text>
                    <Text style={s.subline}>AI reads your features to personalize everything.</Text>

                    <TouchableOpacity
                        style={s.ctaWrap}
                        onPress={onCta}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={showResults ? 'View my results' : 'Start face scan'}
                    >
                        <View style={s.cta}>
                            {/* Canonical liquid glass over the dark hero — clear
                                see-through pane, corner specular, luminous rim.
                                Keep it translucent (low intensity) so the dark
                                hero shows through and the WHITE label stays legible
                                — over-lightening it would wash the text out. */}
                            <LiquidGlassFill idSuffix="introcta" intensity={45} />
                            <Text style={s.ctaText}>{showResults ? 'View my results' : 'Start scan'}</Text>
                            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            <OnairosConnectModal
                visible={onairosVisible}
                onClose={dismissOnairos}
                onConnected={dismissOnairos}
            />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    },
    brandPill: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, height: 34, borderRadius: 17,
        overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    brandPillText: { fontFamily: 'Matter-Bold', fontSize: 12, letterSpacing: 1.6, color: INK },

    scanFrame: {
        position: 'absolute',
        left: 20, right: 20, height: 530,
    },

    bottom: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    bottomInner: { width: '100%', maxWidth: 440, alignItems: 'center' },
    headline: {
        fontFamily: fonts.serif,
        fontSize: 42,
        color: '#FFFFFF',
        letterSpacing: -1,
        lineHeight: 46,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 8,
    },
    subline: {
        fontFamily: 'Matter-Medium',
        fontSize: 14.5,
        color: 'rgba(255,255,255,0.68)',
        textAlign: 'center',
        marginTop: 12,
    },

    metrics: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginTop: 24,
        marginBottom: 26,
        width: '100%',
    },
    metricCard: {
        flex: 1,
        maxWidth: 120,
        alignItems: 'center',
        paddingVertical: 16,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.45)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    metricLabel: { fontFamily: 'Matter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 12, letterSpacing: 0.2 },

    ctaWrap: {
        width: '100%',
        marginTop: 28,
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 6 }),
    },
    cta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        width: '100%',
        height: 58,
    },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.2 },
});

// Score ring — soft full track, a bright accent arc, value centered.
const r = StyleSheet.create({
    wrap: { width: RING_SZ, height: RING_SZ, alignItems: 'center', justifyContent: 'center' },
    svg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
    pct: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: '#FFFFFF' },
});

// Scan-frame corner brackets (larger).
const BR = 38;
const BW = 2.5;
const BC = 'rgba(255,255,255,0.50)';
const c = StyleSheet.create({
    base: { position: 'absolute', width: BR, height: BR },
    tl: { top: 0, left: 0, borderTopWidth: BW, borderLeftWidth: BW, borderColor: BC, borderTopLeftRadius: 10 },
    tr: { top: 0, right: 0, borderTopWidth: BW, borderRightWidth: BW, borderColor: BC, borderTopRightRadius: 10 },
    bl: { bottom: 0, left: 0, borderBottomWidth: BW, borderLeftWidth: BW, borderColor: BC, borderBottomLeftRadius: 10 },
    br: { bottom: 0, right: 0, borderBottomWidth: BW, borderRightWidth: BW, borderColor: BC, borderBottomRightRadius: 10 },
});

/**
 * CourseHero — a living, dimensional course opener.
 *
 * The jelly mascot floats in a slow-drifting aurora of brand light with a soft
 * blurred contact shadow beneath it — an "object in light," not an icon in a
 * container. Creator courses (no jelly) get a crafted frosted-glass icon token
 * (real blur + sheen + rim + shadow), never a giant flat letter. Editorial
 * Fraunces title, byline, stats sit below on cream.
 *
 * Motion: a multi-second vertical float on the icon (shadow breathes inversely)
 * + a slow aurora drift. Cheap, native-driver transforms; all decoration is
 * pointerEvents="none" so taps reach the back button.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassFill } from './glass/LiquidGlass';
import Svg, { Defs, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing } from '../theme/dark';
import { courseJellyIcon } from '../data/courseIcons';
import { hexA } from '../utils/scheduleAggregation';

export type CourseHeroStat = { number: string | number; label: string };

export type CourseCreatorMini = { name: string; verified?: boolean; tagline?: string };

export type CourseHeroProps = {
    title: string;
    description?: string;
    accent: string;
    iconName?: string;
    /** Native maxx id — resolves the glossy jelly mascot for the hero. */
    maxxId?: string;
    creator?: CourseCreatorMini | null;
    stats?: CourseHeroStat[];
    onBack: () => void;
};

/** Lighten a #rrggbb hex toward white by `amt` (0–1). */
function lighten(hex: string, amt: number): string {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const ch = (i: number) => {
        const v = parseInt(full.slice(i, i + 2), 16);
        return Math.round(v + (255 - v) * amt);
    };
    return `rgb(${ch(0)}, ${ch(2)}, ${ch(4)})`;
}

/** Slow-drifting aurora of brand light — layered radial blooms with real falloff
 *  over warm near-white. Purely decorative. */
function HeroAurora({ accent }: { accent: string }) {
    const light = lighten(accent, 0.6);
    const deep = accent;
    return (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
                <RadialGradient id="ah-main" cx="50%" cy="46%" r="58%">
                    <Stop offset="0%" stopColor={deep} stopOpacity={0.40} />
                    <Stop offset="46%" stopColor={deep} stopOpacity={0.15} />
                    <Stop offset="100%" stopColor={deep} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="ah-light" cx="14%" cy="2%" r="62%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.7} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="ah-cool" cx="96%" cy="100%" r="62%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.5} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="ah-deep" cx="6%" cy="98%" r="52%">
                    <Stop offset="0%" stopColor={deep} stopOpacity={0.22} />
                    <Stop offset="100%" stopColor={deep} stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#ah-light)" />
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#ah-cool)" />
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#ah-deep)" />
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#ah-main)" />
        </Svg>
    );
}

/** Soft blurred contact shadow ellipse — grounds the floating icon. */
function ContactShadow() {
    return (
        <Svg width="160" height="46" pointerEvents="none">
            <Defs>
                <RadialGradient id="ch-shadow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#2A2118" stopOpacity={0.30} />
                    <Stop offset="60%" stopColor="#2A2118" stopOpacity={0.12} />
                    <Stop offset="100%" stopColor="#2A2118" stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Ellipse cx="80" cy="23" rx="78" ry="20" fill="url(#ch-shadow)" />
        </Svg>
    );
}

export default function CourseHero({
    title,
    description,
    accent,
    iconName = 'sparkles-outline',
    maxxId,
    creator,
    stats,
    onBack,
}: CourseHeroProps) {
    const insets = useSafeAreaInsets();
    const jelly = courseJellyIcon(maxxId);

    // Motion: a gentle vertical float on the icon + a slow aurora drift.
    const float = useRef(new Animated.Value(0)).current;
    const drift = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const mk = (v: Animated.Value, dur: number, easing: (n: number) => number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.timing(v, { toValue: 1, duration: dur, easing, useNativeDriver: true }),
                    Animated.timing(v, { toValue: 0, duration: dur, easing, useNativeDriver: true }),
                ]),
            );
        const a = mk(float, 3200, Easing.inOut(Easing.sin));
        const b = mk(drift, 13000, Easing.inOut(Easing.quad));
        a.start();
        b.start();
        return () => { a.stop(); b.stop(); };
    }, [float, drift]);

    const iconY = float.interpolate({ inputRange: [0, 1], outputRange: [5, -9] });
    const shadowScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });
    const shadowOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });
    const driftX = drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 10] });
    const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [7, -7] });
    const driftScale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.13] });

    return (
        <View style={styles.wrap}>
            {/* ── Edgeless brand bloom — the jelly floats in light and dissolves
                into the cream page. No boxed plate, no border (airy, editorial,
                like Explore). ──────────────────────────────────────────────── */}
            <View style={styles.heroBloom}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: driftX }, { translateY: driftY }, { scale: driftScale }] }]}>
                        <HeroAurora accent={accent} />
                    </Animated.View>
                    {/* dissolve the bloom into the cream page (bottom + a touch at top) */}
                    <LinearGradient
                        pointerEvents="none"
                        colors={[colors.background, 'rgba(241,241,239,0)', 'rgba(241,241,239,0)', colors.background]}
                        locations={[0, 0.18, 0.62, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                </View>

                {/* Floating icon cluster (contact shadow + jelly / glass token) */}
                <View pointerEvents="none" style={styles.iconStage}>
                    <Animated.View style={[styles.shadowWrap, { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }, { scaleY: shadowScale }] }]}>
                        <ContactShadow />
                    </Animated.View>
                    <Animated.View style={{ transform: [{ translateY: iconY }] }}>
                        {jelly ? (
                            <Image source={jelly} style={styles.heroJelly} contentFit="contain" transition={220} />
                        ) : (
                            <View style={[styles.token, { borderColor: hexA(accent, 0.3) }]}>
                                {/* Canonical liquid-glass optics (material +
                                    speculars + rim), with the course accent as a
                                    sheer tint on top so the chip keeps its hue. */}
                                <LiquidGlassFill idSuffix="coursetoken" />
                                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexA(accent, 0.14) }]} />
                                <Text style={[styles.tokenInitial, { color: accent }]}>
                                    {(title || 'M').trim().charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </Animated.View>
                </View>

                <TouchableOpacity
                    onPress={onBack}
                    style={[styles.backBtn, { top: Math.max(insets.top, 12) + 2 }]}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Back"
                    activeOpacity={0.8}
                >
                    <Ionicons name="chevron-back" size={22} color={colors.foreground} />
                </TouchableOpacity>
            </View>

            {/* ── Title block (below the bloom, ink on cream) ──────── */}
            <View style={styles.titleBlock}>
                <View style={styles.heroEyebrowWrap}>
                    <View style={[styles.eyebrowDot, { backgroundColor: accent }]} />
                    <Text style={styles.heroEyebrow}>{creator ? 'CREATOR COURSE' : 'COURSE'}</Text>
                </View>

                {creator ? (
                    <View style={styles.bylineRow}>
                        <Text style={styles.bylineLabel}>BY {creator.name.toUpperCase()}</Text>
                        {creator.verified ? (
                            <Ionicons name="checkmark-circle" size={13} color={accent} style={{ marginLeft: 5 }} />
                        ) : null}
                    </View>
                ) : null}

                <Text style={styles.title}>{title}</Text>

                {description ? <Text style={styles.description}>{description}</Text> : null}

                {stats && stats.length > 0 ? (
                    <View style={styles.statsRow}>
                        {stats.slice(0, 3).map((s, i) => (
                            <View key={`${s.label}-${i}`} style={[styles.statBlock, i > 0 && styles.statSpacer]}>
                                <Text style={styles.statNumber}>{s.number}</Text>
                                <Text style={styles.statLabel}>{s.label.toUpperCase()}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        backgroundColor: colors.background,
    },
    heroBloom: {
        height: 312,
        overflow: 'hidden',
        backgroundColor: colors.background,
    },
    iconStage: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shadowWrap: {
        position: 'absolute',
        bottom: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroJelly: {
        width: 176,
        height: 176,
    },
    token: {
        width: 92,
        height: 92,
        borderRadius: 26,
        overflow: 'hidden',
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tokenInitial: {
        fontFamily: fonts.serif,
        fontSize: 46,
        marginTop: -2,
    },
    backBtn: {
        position: 'absolute',
        top: 14,
        left: 14,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }
            : { elevation: 2 }),
    },
    heroEyebrowWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        marginBottom: 14,
    },
    eyebrowDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    heroEyebrow: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 2,
        color: colors.textSecondary,
    },

    titleBlock: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
    },
    bylineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    bylineLabel: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 1.6,
        color: colors.textMuted,
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: 40,
        fontWeight: '400',
        letterSpacing: -1.2,
        lineHeight: 44,
        color: colors.foreground,
    },
    description: {
        fontFamily: fonts.sans,
        fontSize: 15.5,
        lineHeight: 23,
        color: colors.textSecondary,
        marginTop: 14,
        maxWidth: 380,
    },

    statsRow: {
        flexDirection: 'row',
        marginTop: spacing.xl,
    },
    statBlock: {
        alignItems: 'flex-start',
    },
    statSpacer: {
        marginLeft: 40,
    },
    statNumber: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 30,
        letterSpacing: -0.6,
        lineHeight: 34,
        color: colors.foreground,
    },
    statLabel: {
        fontFamily: fonts.sansMedium,
        fontSize: 10.5,
        letterSpacing: 1.5,
        color: colors.textMuted,
        marginTop: 6,
    },
});

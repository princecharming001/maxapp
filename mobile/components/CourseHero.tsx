/**
 * CourseHero — modern course opener.
 *
 * A soft brand-bloom hero plate (PaywallDust-style radial wisps fading into a
 * warm near-white) with the course's glossy jelly mascot floating in light
 * (native), or a refined frosted-glass monogram token (creator courses) — then
 * below it: serif title, optional creator byline, gray description, big editorial
 * stats. No flat accent slab, no giant watermark letter; the jelly is the focal
 * point and the depth comes from soft light, not a saturated gradient.
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
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

/** Soft brand-bloom backdrop — radial wisps of the accent fading into warm
 *  near-white (PaywallDust language). Purely decorative. */
function HeroBloom({ accent }: { accent: string }) {
    const light = lighten(accent, 0.55);
    return (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
                <RadialGradient id="ch-main" cx="74%" cy="42%" r="62%">
                    <Stop offset="0%" stopColor={accent} stopOpacity={0.30} />
                    <Stop offset="52%" stopColor={accent} stopOpacity={0.12} />
                    <Stop offset="100%" stopColor={accent} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="ch-light" cx="18%" cy="8%" r="58%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.55} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="#FBF9F6" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#ch-light)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#ch-main)" />
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

    return (
        <View style={styles.wrap}>
            {/* ── Hero plate — soft brand bloom, the jelly floats in light ─── */}
            <View style={[styles.heroCard, { marginTop: Math.max(insets.top, 12) + 4 }]}>
                <HeroBloom accent={accent} />

                {jelly ? (
                    <Image
                        source={jelly}
                        style={styles.heroJelly}
                        contentFit="contain"
                        transition={220}
                    />
                ) : (
                    // Refined frosted-glass monogram token (no giant watermark letter)
                    <View style={[styles.token, { borderColor: hexA(accent, 0.28) }]}>
                        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexA(accent, 0.12) }]} />
                        <View pointerEvents="none" style={styles.tokenRim} />
                        <Text style={[styles.tokenInitial, { color: accent }]}>
                            {(title || 'M').trim().charAt(0).toUpperCase()}
                        </Text>
                    </View>
                )}

                <TouchableOpacity
                    onPress={onBack}
                    style={styles.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Back"
                    activeOpacity={0.8}
                >
                    <Ionicons name="chevron-back" size={22} color={colors.foreground} />
                </TouchableOpacity>

                <View style={styles.heroEyebrowWrap}>
                    <View style={[styles.eyebrowDot, { backgroundColor: accent }]} />
                    <Text style={styles.heroEyebrow}>{creator ? 'CREATOR COURSE' : 'COURSE'}</Text>
                </View>
            </View>

            {/* ── Title block (below the card, ink on cream) ──────── */}
            <View style={styles.titleBlock}>
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
    heroCard: {
        height: 188,
        marginHorizontal: spacing.lg,
        borderRadius: 26,
        overflow: 'hidden',
        justifyContent: 'flex-start',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.06)',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#3A352B', shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } }
            : { elevation: 6 }),
    },
    heroJelly: {
        position: 'absolute',
        right: 8,
        bottom: -10,
        width: 168,
        height: 168,
    },
    token: {
        position: 'absolute',
        right: 22,
        bottom: 26,
        width: 88,
        height: 88,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tokenRim: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    tokenInitial: {
        fontFamily: fonts.serif,
        fontSize: 44,
        marginTop: -2,
    },
    backBtn: {
        position: 'absolute',
        top: 14,
        left: 14,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.78)',
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }
            : { elevation: 2 }),
    },
    heroEyebrowWrap: {
        position: 'absolute',
        left: 18,
        bottom: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
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
        paddingTop: spacing.lg,
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
        fontFamily: fonts.serif,
        fontSize: 34,
        fontWeight: '400',
        letterSpacing: -0.6,
        lineHeight: 38,
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

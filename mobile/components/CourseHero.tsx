/**
 * CourseHero — Pliability-style course opener.
 *
 * Full-bleed accent hero card (rounded, inset) with a large watermark icon,
 * a floating frosted back button, then below it: big serif title, optional
 * creator byline, gray description, and a row of big editorial stats.
 *
 * No per-course photo asset exists, so the hero is a rich accent gradient
 * tinted with the course's own color (the craft.do color-pocket feel).
 * Scrolls with the page (rendered inside the screen's ScrollView).
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing } from '../theme/dark';
import { courseJellyIcon } from '../data/courseIcons';

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

/** Darken a #rrggbb hex by `amt` (0–1) for the gradient's deep stop. */
function darken(hex: string, amt: number): string {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = Math.max(0, Math.round(parseInt(full.slice(0, 2), 16) * (1 - amt)));
    const g = Math.max(0, Math.round(parseInt(full.slice(2, 4), 16) * (1 - amt)));
    const b = Math.max(0, Math.round(parseInt(full.slice(4, 6), 16) * (1 - amt)));
    return `rgb(${r}, ${g}, ${b})`;
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
            {/* ── Hero card ───────────────────────────────────────── */}
            <View style={[styles.heroCard, { marginTop: Math.max(insets.top, 12) + 4 }]}>
                <LinearGradient
                    colors={[accent, darken(accent, 0.34)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                {/* Glossy jelly mascot bleeding off the bottom-right corner — the
                    brand visual language, NOT a flat Ionicons watermark. Creator
                    courses with no native jelly fall back to a faint serif initial. */}
                {jelly ? (
                    <Image
                        source={jelly}
                        style={styles.heroJelly}
                        contentFit="contain"
                        transition={220}
                    />
                ) : (
                    <Text style={styles.heroMonogram}>{(title || 'M').trim().charAt(0).toUpperCase()}</Text>
                )}
                {/* Soft floor shadow so the title below has contrast room */}
                <LinearGradient
                    pointerEvents="none"
                    colors={['transparent', 'rgba(0,0,0,0.22)']}
                    style={styles.heroFloor}
                />

                <TouchableOpacity
                    onPress={onBack}
                    style={styles.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Back"
                    activeOpacity={0.8}
                >
                    <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.heroEyebrowWrap}>
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
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#3A352B', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } }
            : { elevation: 6 }),
    },
    heroJelly: {
        position: 'absolute',
        right: -18,
        bottom: -22,
        width: 176,
        height: 176,
        opacity: 0.95,
    },
    heroMonogram: {
        position: 'absolute',
        right: 6,
        bottom: -30,
        fontFamily: fonts.serif,
        fontSize: 196,
        lineHeight: 210,
        color: 'rgba(255,255,255,0.16)',
    },
    heroFloor: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 80,
    },
    backBtn: {
        position: 'absolute',
        top: 14,
        left: 14,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroEyebrowWrap: {
        position: 'absolute',
        left: 18,
        bottom: 16,
    },
    heroEyebrow: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.92)',
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

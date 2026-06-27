/**
 * CourseTimeline — Alan-style vertical "path" of chapters.
 *
 *   ●───  CHAPTER 01
 *   │     The Coloring Mindset
 *   ╎     Your face is color, not just bone.
 *   │       1.1  Color, Not Just Bone
 *   ╎       1.2  The Seven Pillars
 *   │       +3 more lessons
 *   │     [ See lessons → ]
 *   ●───  CHAPTER 02
 *   ...
 *
 * Each chapter is a node on a connected rail. Chapter 1 is the "start here"
 * node (accent-filled); the rest are open rings. Tapping the card opens the
 * reader at the chapter's first lesson; tapping a listed lesson opens that
 * lesson directly.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import type { CourseModule } from '../data/courseContent';
import { sectionJellyIcon } from '../data/courseIcons';
import { colors, fonts, spacing } from '../theme/dark';
import { hexA } from '../utils/scheduleAggregation';

const PREVIEW_LESSONS = 3;

export type CourseTimelineProps = {
    course: CourseModule;
    accent: string;
    onOpenSection: (sectionId: string) => void;
};

/** A floating jelly tile node. The active (start) node gets an accent rim + a
 *  slow "you are here" radar pulse. Cream tile + soft shadow — a crafted journey
 *  step, not a number-in-a-ring. */
function TimelineNode({ jelly, number, accent, active }: { jelly: any | null; number: number; accent: string; active: boolean }) {
    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!active) return;
        const loop = Animated.loop(
            Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        );
        loop.start();
        return () => loop.stop();
    }, [active, pulse]);
    const pScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.4] });
    const pOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] });

    return (
        <View style={styles.nodeWrap}>
            {active ? (
                <Animated.View
                    pointerEvents="none"
                    style={[styles.nodePulse, { borderColor: accent, opacity: pOpacity, transform: [{ scale: pScale }] }]}
                />
            ) : null}
            <View style={[styles.nodeTile, active && { borderColor: accent, borderWidth: 1.5 }]}>
                {jelly ? (
                    <Image source={jelly} style={styles.nodeJelly} contentFit="contain" />
                ) : (
                    <Text style={[styles.nodeNum, { color: accent }]}>{number}</Text>
                )}
            </View>
        </View>
    );
}

export default function CourseTimeline({ course, accent, onOpenSection }: CourseTimelineProps) {
    return (
        <View style={styles.wrap}>
            <Text style={styles.header}>Course path</Text>

            {course.chapters.map((ch, i) => {
                const isFirst = i === 0;
                const isLast = i === course.chapters.length - 1;
                const numLabel = ch.number.toString().padStart(2, '0');
                const preview = ch.sections.slice(0, PREVIEW_LESSONS);
                const moreCount = ch.sections.length - preview.length;
                const chJelly = sectionJellyIcon(course.maxxId, ch.icon);

                return (
                    <View key={ch.id} style={styles.row}>
                        {/* ── Left rail: connector + node ─────────────── */}
                        <View style={styles.rail}>
                            {/* top connector segment (hidden on first) */}
                            <View
                                style={[
                                    styles.connector,
                                    styles.connectorTop,
                                    { backgroundColor: hexA(accent, 0.32) },
                                    isFirst && styles.connectorHidden,
                                ]}
                            />
                            <TimelineNode jelly={chJelly} number={ch.number} accent={accent} active={isFirst} />
                            {/* bottom connector segment (hidden on last) */}
                            <View
                                style={[
                                    styles.connector,
                                    styles.connectorBottom,
                                    { backgroundColor: hexA(accent, 0.32) },
                                    isLast && styles.connectorHidden,
                                ]}
                            />
                        </View>

                        {/* ── Right: chapter content ──────────────────── */}
                        <TouchableOpacity
                            style={[styles.card, isLast && styles.cardLast]}
                            activeOpacity={0.7}
                            onPress={() => onOpenSection(ch.sections[0].id)}
                        >
                            <View style={styles.cardHead}>
                                <Text style={[styles.chapterEyebrow, { color: accent }]}>CHAPTER {numLabel}</Text>
                                {isFirst ? (
                                    <View style={[styles.startPill, { backgroundColor: hexA(accent, 0.14) }]}>
                                        <Text style={[styles.startPillText, { color: accent }]}>START HERE</Text>
                                    </View>
                                ) : null}
                            </View>

                            <Text style={styles.chapterTitle} numberOfLines={2}>
                                {ch.title}
                            </Text>
                            <Text style={styles.chapterSub} numberOfLines={2}>
                                {ch.subtitle}
                            </Text>

                            {/* lesson preview list */}
                            <View style={styles.lessonList}>
                                {preview.map((s) => (
                                    <TouchableOpacity
                                        key={s.id}
                                        style={styles.lessonRow}
                                        activeOpacity={0.6}
                                        onPress={() => onOpenSection(s.id)}
                                    >
                                        <View style={[styles.lessonTick, { backgroundColor: hexA(accent, 0.55) }]} />
                                        <Text style={[styles.lessonNum, { color: accent }]}>{s.number}</Text>
                                        <Text style={styles.lessonTitle} numberOfLines={1}>
                                            {s.title}
                                        </Text>
                                        {s.eta ? <Text style={styles.lessonEta}>{s.eta}</Text> : null}
                                    </TouchableOpacity>
                                ))}
                                {moreCount > 0 ? (
                                    <Text style={styles.moreText}>
                                        +{moreCount} more lesson{moreCount === 1 ? '' : 's'}
                                    </Text>
                                ) : null}
                            </View>

                            <View style={[styles.seePill, { borderColor: hexA(accent, 0.4) }]}>
                                <Text style={[styles.seePillText, { color: accent }]}>See lessons</Text>
                                <Ionicons name="arrow-forward" size={13} color={accent} />
                            </View>
                        </TouchableOpacity>
                    </View>
                );
            })}
        </View>
    );
}

const NODE = 44;
const RAIL_W = 52;

const styles = StyleSheet.create({
    wrap: {
        marginTop: spacing.sm,
    },
    header: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginLeft: spacing.lg,
        marginBottom: spacing.sm,
    },

    row: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
    },

    /* left rail */
    rail: {
        width: RAIL_W,
        alignItems: 'center',
    },
    connector: {
        width: 3,
        borderRadius: 2,
        flexGrow: 0,
    },
    connectorTop: {
        height: 14,
    },
    connectorBottom: {
        flex: 1,
        marginTop: 0,
    },
    connectorHidden: {
        backgroundColor: 'transparent',
    },
    /* floating jelly tile node (crafted journey step) */
    nodeWrap: {
        width: NODE,
        height: NODE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nodePulse: {
        position: 'absolute',
        width: NODE + 6,
        height: NODE + 6,
        borderRadius: 17,
        borderWidth: 1.5,
    },
    nodeTile: {
        width: NODE,
        height: NODE,
        borderRadius: 15,
        backgroundColor: colors.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#3A352B', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }
            : { elevation: 3 }),
    },
    nodeNum: {
        fontFamily: fonts.serif,
        fontSize: 17,
        fontWeight: '400',
    },
    nodeJelly: {
        width: 30,
        height: 30,
    },

    /* right card */
    card: {
        flex: 1,
        marginLeft: spacing.md,
        paddingBottom: spacing.xl,
    },
    cardLast: {
        paddingBottom: spacing.lg,
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 2,
    },
    chapterEyebrow: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10.5,
        letterSpacing: 1.4,
    },
    startPill: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    startPillText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 9,
        letterSpacing: 1,
    },
    chapterTitle: {
        fontFamily: fonts.serif,
        fontSize: 22,
        fontWeight: '400',
        letterSpacing: -0.4,
        lineHeight: 27,
        color: colors.foreground,
        marginTop: 6,
    },
    chapterSub: {
        fontFamily: fonts.sans,
        fontSize: 13.5,
        lineHeight: 19,
        color: colors.textSecondary,
        marginTop: 5,
    },

    lessonList: {
        marginTop: 14,
        gap: 2,
    },
    lessonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 7,
    },
    lessonTick: {
        width: 3,
        height: 13,
        borderRadius: 2,
        marginRight: 13,
        marginLeft: 2,
    },
    lessonNum: {
        fontFamily: fonts.sansMedium,
        fontSize: 11.5,
        letterSpacing: 0.4,
        width: 30,
    },
    lessonTitle: {
        flex: 1,
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors.textPrimary,
        letterSpacing: -0.05,
    },
    lessonEta: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: colors.textMuted,
        marginLeft: 8,
    },
    moreText: {
        fontFamily: fonts.sansMedium,
        fontSize: 12,
        color: colors.textMuted,
        paddingVertical: 6,
        paddingLeft: 48,
    },

    seePill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        marginTop: 14,
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
    },
    seePillText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        letterSpacing: 0.2,
    },
});

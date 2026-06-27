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
            <View style={styles.nodeTile}>
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
                const lessons = ch.sections;
                const chJelly = sectionJellyIcon(course.maxxId, ch.icon);

                return (
                    <View key={ch.id} style={styles.row}>
                        {/* ── Continuous spine — anchored to the ROW so it spans the
                            full card height; chapters chain into one unbroken line.
                            Starts at the first node, ends at the last. ─────────── */}
                        <View
                            pointerEvents="none"
                            style={[
                                styles.spine,
                                { backgroundColor: hexA(accent, 0.32), top: isFirst ? NODE_CENTER : 0 },
                                isLast ? { height: isFirst ? 0 : NODE_CENTER } : { bottom: 0 },
                            ]}
                        />
                        {/* ── Left rail: the floating node ─────────────── */}
                        <View style={styles.rail}>
                            <View style={{ height: NODE_TOP }} />
                            <TimelineNode jelly={chJelly} number={ch.number} accent={accent} active={isFirst} />
                        </View>

                        {/* ── Right: chapter content ──────────────────── */}
                        <TouchableOpacity
                            style={[styles.card, isLast && styles.cardLast]}
                            activeOpacity={0.7}
                            onPress={() => onOpenSection(ch.sections[0].id)}
                        >
                            <View style={styles.cardHead}>
                                <Text style={[styles.chapterEyebrow, { color: accent }]}>CHAPTER {numLabel}</Text>
                            </View>

                            <Text style={styles.chapterTitle} numberOfLines={2}>
                                {ch.title}
                            </Text>
                            <Text style={styles.chapterSub} numberOfLines={2}>
                                {ch.subtitle}
                            </Text>

                            {/* all lessons */}
                            <View style={styles.lessonList}>
                                {lessons.map((s, idx) => (
                                    <TouchableOpacity
                                        key={s.id}
                                        style={[styles.lessonRow, idx > 0 && styles.lessonRowDivider]}
                                        activeOpacity={0.6}
                                        onPress={() => onOpenSection(s.id)}
                                    >
                                        <Text style={[styles.lessonNum, { color: accent }]}>{s.number}</Text>
                                        <Text style={styles.lessonTitle} numberOfLines={1}>
                                            {s.title}
                                        </Text>
                                        {s.eta ? <Text style={styles.lessonEta}>{s.eta}</Text> : null}
                                    </TouchableOpacity>
                                ))}
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
const NODE_TOP = 14;                      // node's top offset within the rail
const NODE_CENTER = NODE_TOP + NODE / 2;  // y of the node centre (spine anchor)

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
        marginBottom: spacing.xl,
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
    spine: {
        position: 'absolute',
        width: 2,
        borderRadius: 1,
        left: (RAIL_W - 2) / 2,
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    nodeNum: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 16,
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
        marginTop: 16,
    },
    lessonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
    },
    lessonRowDivider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.06)',
    },
    lessonNum: {
        fontFamily: fonts.sansMedium,
        fontSize: 12.5,
        letterSpacing: 0.2,
        width: 34,
    },
    lessonTitle: {
        flex: 1,
        fontFamily: fonts.sans,
        fontSize: 14.5,
        color: colors.textPrimary,
        letterSpacing: -0.05,
    },
    lessonEta: {
        fontFamily: fonts.sans,
        fontSize: 11.5,
        color: colors.textMuted,
        marginLeft: 8,
    },
    moreText: {
        fontFamily: fonts.sansMedium,
        fontSize: 12.5,
        color: colors.textMuted,
        paddingTop: 12,
        paddingLeft: 34,
    },

    seeLink: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        marginTop: 16,
    },
    seeLinkText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13.5,
        letterSpacing: 0.2,
    },
});

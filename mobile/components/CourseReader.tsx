/**
 * CourseReader — full-screen reader. Editorial / magazine layout.
 *
 * Drops the icon-on-disc visual in favor of typography. The accent color
 * appears only as a hairline rule, a tiny bullet mark, and the next-arrow
 * tint. Everything else is type and whitespace.
 *
 *   ┌──────────────────────────────────────┐
 *   │  CH 07 · § 7.3                    ✕  │
 *   │  Actives — The Power Tools           │   small chapter title
 *   │  ─────                                │   thin accent rule
 *   │                                       │
 *   │  Retinoids                            │   massive serif
 *   │  The single best-studied anti-aging   │   subtitle
 *   │  + acne ingredient.                   │
 *   │                                       │
 *   │   ·  OTC: adapalene 0.1% — best entry │
 *   │   ·  Stronger: tretinoin 0.025–0.1%   │
 *   │   ·  Start 2× / week, ramp slowly     │
 *   │                                       │
 *   │  Retinoids accelerate cell turnover…  │   body in italic serif
 *   │                                       │
 *   ├──────────────────────────────────────┤
 *   │  ‹       12 / 64           accent →  │
 *   │  ▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱                  │
 *   └──────────────────────────────────────┘
 *
 * Pager flows seamlessly across chapter boundaries; chapter title in the
 * top bar updates as the user crosses one.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Defs, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import {
    flattenSections,
    type CourseChapter,
    type CourseModule,
    type CourseSection,
} from '../data/courseContent';
import { sectionJellyIcon } from '../data/courseIcons';
import { colors, fonts, spacing, typography } from '../theme/dark';

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

/** Calm field of brand light the jelly floats in — a bright core "light well"
 *  behind the icon + soft warm/cool mesh, low-contrast so the lesson reads. */
function SlideField({ accent }: { accent: string }) {
    const light = lighten(accent, 0.62);
    return (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
                <RadialGradient id="sf-core" cx="50%" cy="47%" r="46%">
                    <Stop offset="0%" stopColor={accent} stopOpacity={0.30} />
                    <Stop offset="38%" stopColor={accent} stopOpacity={0.13} />
                    <Stop offset="100%" stopColor={accent} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="sf-warm" cx="22%" cy="6%" r="60%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.4} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="sf-cool" cx="90%" cy="98%" r="58%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.3} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#sf-warm)" />
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#sf-cool)" />
            <Rect x="-20%" y="-20%" width="140%" height="140%" fill="url(#sf-core)" />
        </Svg>
    );
}

/** Soft blurred contact shadow ellipse — grounds the floating jelly. */
function SlideShadow() {
    return (
        <Svg width="150" height="40" pointerEvents="none">
            <Defs>
                <RadialGradient id="sf-shadow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#2A2118" stopOpacity={0.24} />
                    <Stop offset="62%" stopColor="#2A2118" stopOpacity={0.09} />
                    <Stop offset="100%" stopColor="#2A2118" stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Ellipse cx="75" cy="20" rx="73" ry="17" fill="url(#sf-shadow)" />
        </Svg>
    );
}

export type CourseReaderProps = {
    visible: boolean;
    course: CourseModule | null;
    initialSectionId: string | null;
    onClose: () => void;
};

export default function CourseReader({
    visible,
    course,
    initialSectionId,
    onClose,
}: CourseReaderProps) {
    const insets = useSafeAreaInsets();
    const flatRef = useRef<FlatList<any>>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [activeIndex, setActiveIndex] = useState(0);

    const slides = useMemo(
        () => (course ? flattenSections(course) : []),
        [course]
    );

    useEffect(() => {
        if (!visible || !course || !slides.length) return;
        const start = initialSectionId
            ? Math.max(0, slides.findIndex((s) => s.section.id === initialSectionId))
            : 0;
        setActiveIndex(start);
        const t = setTimeout(() => {
            try {
                flatRef.current?.scrollToIndex({ index: start, animated: false });
            } catch {
                /* not laid out yet */
            }
        }, 50);
        return () => clearTimeout(t);
    }, [visible, course, initialSectionId, slides.length]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerWidth(e.nativeEvent.layout.width);
    }, []);

    const onMomentumScrollEnd = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (!containerWidth) return;
            const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
            if (idx !== activeIndex) setActiveIndex(idx);
        },
        [activeIndex, containerWidth]
    );

    const goPrev = useCallback(() => {
        if (activeIndex <= 0) return;
        flatRef.current?.scrollToIndex({ index: activeIndex - 1, animated: true });
        setActiveIndex(activeIndex - 1);
    }, [activeIndex]);

    const goNext = useCallback(() => {
        if (activeIndex >= slides.length - 1) return;
        flatRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
        setActiveIndex(activeIndex + 1);
    }, [activeIndex, slides.length]);

    const renderItem = useCallback(
        ({ item }: { item: { chapter: CourseChapter; section: CourseSection } }) => (
            <Slide
                chapter={item.chapter}
                section={item.section}
                course={course!}
                width={containerWidth}
            />
        ),
        [course, containerWidth]
    );

    if (!course) return null;

    const current = slides[activeIndex];
    const progress = slides.length ? (activeIndex + 1) / slides.length : 0;
    const atStart = activeIndex <= 0;
    const atEnd = activeIndex >= slides.length - 1;

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={[styles.root, { paddingTop: insets.top }]} onLayout={onLayout}>
                {/* ── Top bar ─────────────────────────────────────────── */}
                <View style={styles.topBar}>
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.closeBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel="Close reader"
                    >
                        <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.chapterRow}>
                    <Text style={styles.chapterTitleSmall} numberOfLines={1}>
                        {current?.chapter.title}
                    </Text>
                    <View style={[styles.accentRule, { backgroundColor: course.accent }]} />
                </View>

                {/* ── Pager ───────────────────────────────────────────── */}
                {containerWidth > 0 && (
                    <FlatList
                        ref={flatRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        data={slides}
                        keyExtractor={(s) => s.section.id}
                        renderItem={renderItem}
                        initialScrollIndex={activeIndex}
                        getItemLayout={(_, i) => ({
                            length: containerWidth,
                            offset: containerWidth * i,
                            index: i,
                        })}
                        onMomentumScrollEnd={onMomentumScrollEnd}
                        windowSize={3}
                        initialNumToRender={1}
                        maxToRenderPerBatch={2}
                    />
                )}

                {/* ── Bottom controls ─────────────────────────────────── */}
                <View
                    style={[
                        styles.bottomBar,
                        { paddingBottom: Math.max(insets.bottom + 6, spacing.md) },
                    ]}
                >
                    <View style={styles.controlsRow}>
                        <TouchableOpacity
                            onPress={goPrev}
                            disabled={atStart}
                            style={styles.arrowBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel="Previous section"
                        >
                            <Ionicons
                                name="arrow-back"
                                size={18}
                                color={atStart ? colors.textMuted : colors.foreground}
                            />
                        </TouchableOpacity>

                        <Text style={styles.progressText}>
                            <Text style={styles.progressBold}>{activeIndex + 1}</Text>
                            <Text style={styles.progressSlash}> / </Text>
                            {slides.length}
                        </Text>

                        <TouchableOpacity
                            onPress={goNext}
                            disabled={atEnd}
                            style={styles.arrowBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel="Next section"
                        >
                            <Ionicons
                                name="arrow-forward"
                                size={18}
                                color={atEnd ? colors.textMuted : course.accent}
                            />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${progress * 100}%`,
                                    backgroundColor: course.accent,
                                },
                            ]}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* ── Slide ────────────────────────────────────────────────────────────── */

type SlideProps = {
    chapter: CourseChapter;
    section: CourseSection;
    course: CourseModule;
    width: number;
};

function Slide({ section, course, width }: SlideProps) {
    const { accent } = course;
    const jelly = sectionJellyIcon(course.maxxId, section.icon);

    // Gentle float — the jelly drifts in its field of light (shadow breathes).
    const float = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(float, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(float, { toValue: 0, duration: 3600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [float]);
    const iconY = float.interpolate({ inputRange: [0, 1], outputRange: [4, -7] });
    const shScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] });
    const shOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.74] });

    return (
        <View style={[slide.outer, { width }]}>
            <ScrollView
                contentContainerStyle={slide.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero visual ──────────────────────────────────────
                    The jelly floats in a calm field of brand light (a bright
                    core glow + soft warm/cool mesh) with a blurred contact
                    shadow — no rings, no flat disc. Purely decorative. */}
                <View style={slide.visualBlock}>
                    <Animated.View
                        pointerEvents="none"
                        style={[slide.shadowWrap, { opacity: shOpacity, transform: [{ scaleX: shScale }, { scaleY: shScale }] }]}
                    >
                        <SlideShadow />
                    </Animated.View>
                    <Animated.View pointerEvents="none" style={{ transform: [{ translateY: iconY }] }}>
                        {jelly ? (
                            <Image source={jelly} style={slide.heroJelly} contentFit="contain" transition={200} />
                        ) : (
                            <Ionicons name={section.icon as any} size={48} color={accent} />
                        )}
                    </Animated.View>
                </View>

                <Text style={[slide.eyebrow, { color: accent }]}>
                    {section.number.toUpperCase()}
                    {section.eta ? `   ·   ${section.eta.toUpperCase()}` : ''}
                </Text>

                <Text style={slide.title}>{section.title}</Text>
                <Text style={slide.subtitle}>{section.subtitle}</Text>

                <View style={slide.bullets}>
                    {section.bullets.map((b, i) => (
                        <View key={i} style={slide.bulletRow}>
                            <View style={[slide.bulletMark, { backgroundColor: accent }]} />
                            <Text style={slide.bulletText}>{b}</Text>
                        </View>
                    ))}
                </View>

                {section.body ? (
                    <Text style={slide.body}>{section.body}</Text>
                ) : null}
            </ScrollView>
        </View>
    );
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.background,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: 6,
    },
    topMeta: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 1.6,
        color: colors.textSecondary,
    },
    closeBtn: {
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chapterRow: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
    },
    chapterTitleSmall: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        letterSpacing: -0.2,
        color: colors.foreground,
        marginBottom: 10,
    },
    accentRule: {
        width: 28,
        height: 2,
        borderRadius: 1,
    },

    bottomBar: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    arrowBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressText: {
        fontFamily: fonts.sansMedium,
        fontSize: 12,
        letterSpacing: 1.4,
        color: colors.textSecondary,
    },
    progressBold: {
        color: colors.foreground,
        fontFamily: fonts.sansSemiBold,
    },
    progressSlash: {
        color: colors.textMuted,
    },
    progressTrack: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        overflow: 'hidden',
    },
    progressFill: {
        height: 1,
    },
});

const slide = StyleSheet.create({
    outer: {
        flex: 1,
        paddingHorizontal: spacing.lg,
    },
    scroll: {
        paddingTop: spacing.xs,
        paddingBottom: spacing.lg,
    },
    /* Hero visual: the jelly floats in a field of brand light + contact shadow */
    visualBlock: {
        height: 176,
        marginHorizontal: -spacing.lg, // bleed past slide padding for full-width feel
        marginTop: -spacing.xs,
        marginBottom: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    shadowWrap: {
        position: 'absolute',
        bottom: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroJelly: {
        width: 128,
        height: 128,
    },
    eyebrow: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 1.8,
        marginBottom: spacing.md,
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: 34,
        fontWeight: '400',
        letterSpacing: -0.8,
        color: colors.foreground,
        lineHeight: 40,
        marginBottom: 10,
    },
    subtitle: {
        fontFamily: fonts.sans,
        fontSize: 16,
        lineHeight: 24,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
    },
    bullets: {
        marginTop: spacing.xs,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 8,
    },
    bulletMark: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 9,
        marginRight: 14,
    },
    bulletText: {
        flex: 1,
        fontFamily: fonts.sans,
        fontSize: 15,
        lineHeight: 22,
        color: colors.textPrimary,
        letterSpacing: -0.05,
    },
    body: {
        marginTop: spacing.lg,
        fontFamily: fonts.sans,
        fontSize: 15,
        lineHeight: 23,
        color: colors.textSecondary,
    },
});

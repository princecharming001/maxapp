/**
 * TaskGuideScreen — full-screen horizontal pager for step-by-step task guides.
 *
 * Architecture:
 *   • One full-screen page per step (intro + N steps + done page)
 *   • Reanimated ScrollView with pagingEnabled; scrollX drives every interpolation
 *   • No new native deps — pure Reanimated 4.1 / RN 0.81 scrollView approach
 *   • Moti is NOT used (no Reanimated 4 support)
 *
 * Visual language: editorial ink/cream, Fraunces serif titles, parallax color wash,
 * ghost step numerals, segmented progress bar, left tick-rail, spring CTA.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Platform,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
    withSpring,
    runOnJS,
    type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTaskGuide } from '../../hooks/useTaskGuide';
import { colors, fonts } from '../../theme/dark';
import api from '../../services/api';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

// ── Types ──────────────────────────────────────────────────────────────────

type RouteParams = {
    TaskGuide: {
        scheduleId: string;
        taskId: string;
        moduleColor?: string;
        moduleLabel?: string;
        done?: boolean;
    };
};

type Step = {
    n: number;
    title: string;
    body: string;
    tip: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_TYPES = { INTRO: 'intro', STEP: 'step', DONE: 'done' } as const;
const INK = '#111113';
const CREAM = '#F7F6F2';
const MUTE = '#9A9A9A';
const TRACK = '#E5E4E0';

// ── Helpers ────────────────────────────────────────────────────────────────

function hapticTick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
function hapticSuccess() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

function padN(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Segmented progress bar — one slot per step, the active one fills left-to-right. */
function ProgressBar({ total, scrollX, pageWidth }: { total: number; scrollX: SharedValue<number>; pageWidth: number }) {
    if (total === 0) return null;
    return (
        <View style={pb.row}>
            {Array.from({ length: total }).map((_, i) => {
                // page i+1 is the step (page 0 = intro, page 1…N = steps, page N+1 = done)
                const pageIndex = i + 1;
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const fillStyle = useAnimatedStyle(() => {
                    const w = interpolate(
                        scrollX.value,
                        [(pageIndex - 1) * pageWidth, pageIndex * pageWidth, (pageIndex + 1) * pageWidth],
                        [0, 1, 1],
                        Extrapolation.CLAMP,
                    );
                    return { flex: w };
                });
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const emptyStyle = useAnimatedStyle(() => {
                    const w = interpolate(
                        scrollX.value,
                        [(pageIndex - 1) * pageWidth, pageIndex * pageWidth],
                        [1, 0],
                        Extrapolation.CLAMP,
                    );
                    return { flex: w };
                });
                return (
                    <View key={i} style={pb.seg}>
                        <Animated.View style={[pb.fill, fillStyle]} />
                        <Animated.View style={[pb.empty, emptyStyle]} />
                    </View>
                );
            })}
        </View>
    );
}

const pb = StyleSheet.create({
    row: { flexDirection: 'row', gap: 4, paddingHorizontal: 24 },
    seg: { flex: 1, height: 2.5, flexDirection: 'row', borderRadius: 2, overflow: 'hidden', backgroundColor: TRACK },
    fill: { height: '100%', backgroundColor: INK },
    empty: { height: '100%', backgroundColor: TRACK },
});

/** Left tick-rail — active dot is solid, others are outlines. */
function TickRail({ total, currentPage }: { total: number; currentPage: number }) {
    return (
        <View style={tr.col}>
            {Array.from({ length: total }).map((_, i) => {
                const active = i === currentPage - 1;
                return (
                    <React.Fragment key={i}>
                        <View style={[tr.dot, active ? tr.dotActive : tr.dotInert]} />
                        {i < total - 1 && (
                            <View style={[tr.line, i < currentPage - 1 ? tr.lineActive : tr.lineInert]} />
                        )}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

const tr = StyleSheet.create({
    col: { width: 16, alignItems: 'center', paddingTop: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotActive: { backgroundColor: INK },
    dotInert: { borderWidth: 1.5, borderColor: TRACK, backgroundColor: 'transparent' },
    line: { width: 1.5, flex: 1, minHeight: 20, marginVertical: 4 },
    lineActive: { backgroundColor: INK },
    lineInert: { backgroundColor: TRACK },
});

// ── Main screen ────────────────────────────────────────────────────────────

export default function TaskGuideScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<RouteParams, 'TaskGuide'>>();
    const { scheduleId, taskId, moduleColor, moduleLabel, done: alreadyDone } = route.params;

    const { data: guide, isLoading, isError } = useTaskGuide(scheduleId, taskId);

    const scrollX = useSharedValue(0);
    const scrollRef = useRef<ScrollView>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [markedDone, setMarkedDone] = useState(alreadyDone ?? false);
    const [markingDone, setMarkingDone] = useState(false);
    const doneBtnScale = useSharedValue(0);

    // Screen dimensions — can't use useWindowDimensions inside animatedStyle hooks
    // so we capture once on mount (layout change listener would be overkill here)
    const [pageWidth, setPageWidth] = useState(0);

    const accent = moduleColor && /^#/.test(moduleColor) ? moduleColor : '#D4A017';

    // Pages: intro (0) + steps (1…N) + done (N+1)
    const steps: Step[] = guide?.steps ?? [];
    const totalPages = steps.length > 0 ? steps.length + 2 : 0; // intro + steps + done

    const onScroll = useAnimatedScrollHandler({
        onScroll(e) {
            scrollX.value = e.contentOffset.x;
        },
        onMomentumEnd(e) {
            if (pageWidth > 0) {
                const page = Math.round(e.contentOffset.x / pageWidth);
                runOnJS(setCurrentPage)(page);
                runOnJS(hapticTick)();
                // Animate the done button in when we land on the last page
                if (page === totalPages - 1) {
                    doneBtnScale.value = withSpring(1, { damping: 14, stiffness: 140 });
                } else {
                    doneBtnScale.value = withSpring(0, { damping: 18, stiffness: 200 });
                }
            }
        },
    });

    const goToPage = useCallback(
        (page: number) => {
            if (!scrollRef.current || pageWidth === 0) return;
            (scrollRef.current as any).scrollTo({ x: page * pageWidth, animated: true });
        },
        [pageWidth],
    );

    const handleMarkDone = useCallback(async () => {
        if (markedDone || markingDone) return;
        setMarkingDone(true);
        hapticSuccess();
        try {
            await api.completeScheduleTask(scheduleId, taskId);
            setMarkedDone(true);
        } catch {
            // Optimistic — stay marked
            setMarkedDone(true);
        } finally {
            setMarkingDone(false);
        }
    }, [markedDone, markingDone, scheduleId, taskId]);

    const doneBtnStyle = useAnimatedStyle(() => ({
        transform: [{ scale: doneBtnScale.value }],
        opacity: doneBtnScale.value,
    }));

    // ── Loading / error states ────────────────────────────────────────────
    if (isLoading) {
        return (
            <View style={[s.screen, { paddingTop: insets.top }]}>
                <View style={s.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                        <Ionicons name="close" size={20} color={INK} />
                    </TouchableOpacity>
                </View>
                <View style={s.loadCenter}>
                    <ActivityIndicator color={MUTE} />
                    <Text style={s.loadText}>Preparing your guide…</Text>
                </View>
            </View>
        );
    }

    if (isError || !guide) {
        return (
            <View style={[s.screen, { paddingTop: insets.top }]}>
                <View style={s.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                        <Ionicons name="close" size={20} color={INK} />
                    </TouchableOpacity>
                </View>
                <View style={s.loadCenter}>
                    <Text style={s.errorText}>Couldn't load guide. Try again.</Text>
                </View>
            </View>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <View
            style={[s.screen, { paddingTop: insets.top }]}
            onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
        >
            {/* Header: close button + progress bar */}
            <View style={s.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={s.closeBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close guide"
                >
                    <Ionicons name="close" size={20} color={INK} />
                </TouchableOpacity>

                {steps.length > 0 && pageWidth > 0 && (
                    <View style={s.progressWrap}>
                        <ProgressBar total={steps.length} scrollX={scrollX} pageWidth={pageWidth} />
                    </View>
                )}
            </View>

            {/* Module label chip */}
            {moduleLabel ? (
                <View style={[s.chip, { backgroundColor: accent + '22' }]}>
                    <Text style={[s.chipText, { color: accent }]}>{moduleLabel.toUpperCase()}</Text>
                </View>
            ) : null}

            {/* The pager */}
            {pageWidth > 0 && (
                <AnimatedScrollView
                    ref={scrollRef as any}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    decelerationRate="fast"
                    bounces={false}
                    style={s.pager}
                    contentContainerStyle={{ width: pageWidth * totalPages }}
                >
                    {/* ── Page 0: Intro ── */}
                    <IntroPage
                        width={pageWidth}
                        title={guide.title}
                        overview={guide.overview}
                        duration={guide.duration_minutes}
                        products={guide.products ?? []}
                        accent={accent}
                        scrollX={scrollX}
                        onNext={() => goToPage(1)}
                    />

                    {/* ── Pages 1…N: Steps ── */}
                    {steps.map((step, i) => (
                        <StepPage
                            key={step.n}
                            step={step}
                            stepIndex={i}
                            totalSteps={steps.length}
                            width={pageWidth}
                            accent={accent}
                            scrollX={scrollX}
                            currentPage={currentPage}
                            onNext={() => goToPage(i + 2)}
                            isLast={i === steps.length - 1}
                        />
                    ))}

                    {/* ── Page N+1: Done ── */}
                    <DonePage
                        width={pageWidth}
                        accent={accent}
                        whyItMatters={guide.why_it_matters}
                        markedDone={markedDone}
                        markingDone={markingDone}
                        doneBtnStyle={doneBtnStyle}
                        onMarkDone={handleMarkDone}
                        onClose={() => navigation.goBack()}
                    />
                </AnimatedScrollView>
            )}
        </View>
    );
}

// ── IntroPage ──────────────────────────────────────────────────────────────

function IntroPage({
    width, title, overview, duration, products, accent, scrollX, onNext,
}: {
    width: number; title: string; overview: string; duration: number;
    products: { name: string; note: string }[];
    accent: string; scrollX: SharedValue<number>; onNext: () => void;
}) {
    const heroStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollX.value, [0, width], [1, 0.4], Extrapolation.CLAMP),
        transform: [
            {
                translateX: interpolate(
                    scrollX.value,
                    [0, width],
                    [0, -width * 0.18],
                    Extrapolation.CLAMP,
                ),
            },
        ],
    }));

    return (
        <Animated.View style={[ip.page, { width }, heroStyle]}>
            {/* Accent wash */}
            <View style={[ip.wash, { backgroundColor: accent + '18' }]} />

            <View style={ip.body}>
                <Text style={ip.kicker}>YOUR GUIDE</Text>
                <Text style={ip.title}>{title}</Text>
                <Text style={ip.overview}>{overview}</Text>

                {products.length > 0 && (
                    <View style={ip.products}>
                        <Text style={ip.productsLabel}>WHAT YOU'LL NEED</Text>
                        {products.map((p, i) => (
                            <View key={`${p.name}-${i}`} style={ip.productRow}>
                                <View style={[ip.productDot, { backgroundColor: accent }]} />
                                <Text style={ip.productText}>
                                    <Text style={ip.productName}>{p.name}</Text>
                                    {p.note ? <Text style={ip.productNote}>{`  ·  ${p.note}`}</Text> : null}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={ip.durationRow}>
                    <Ionicons name="time-outline" size={14} color={MUTE} />
                    <Text style={ip.durationText}>{duration} min</Text>
                </View>
            </View>

            <TouchableOpacity style={[ip.nextBtn, { backgroundColor: accent }]} onPress={onNext} activeOpacity={0.82}>
                <Text style={ip.nextBtnText}>Start</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
        </Animated.View>
    );
}

const ip = StyleSheet.create({
    page: { flex: 1, paddingHorizontal: 28, paddingBottom: 40, position: 'relative', justifyContent: 'space-between' },
    wash: { ...StyleSheet.absoluteFillObject, borderRadius: 0 },
    body: { flex: 1, justifyContent: 'center', paddingTop: 24 },
    kicker: { fontFamily: fonts.sansBold, fontSize: 10, color: MUTE, letterSpacing: 2, marginBottom: 12 },
    title: { fontFamily: fonts.serif, fontSize: 38, color: INK, lineHeight: 44, letterSpacing: -1, marginBottom: 18 },
    overview: { fontFamily: fonts.sans, fontSize: 16, color: '#555', lineHeight: 24 },
    products: { marginTop: 22, gap: 9 },
    productsLabel: { fontFamily: fonts.sansBold, fontSize: 10, color: MUTE, letterSpacing: 2, marginBottom: 4 },
    productRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    productDot: { width: 6, height: 6, borderRadius: 3 },
    productText: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: INK, lineHeight: 20 },
    productName: { fontFamily: fonts.sansMedium, color: INK },
    productNote: { fontFamily: fonts.sans, color: MUTE },
    durationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16 },
    durationText: { fontFamily: fonts.sansMedium, fontSize: 13, color: MUTE },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, height: 52, borderRadius: 999, marginTop: 32,
        ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as any } : {}),
    },
    nextBtnText: { fontFamily: fonts.sansBold, fontSize: 16, color: '#fff', fontWeight: '700' },
});

// ── StepPage ───────────────────────────────────────────────────────────────

function StepPage({
    step, stepIndex, totalSteps, width, accent, scrollX, currentPage, onNext, isLast,
}: {
    step: Step; stepIndex: number; totalSteps: number; width: number; accent: string;
    scrollX: SharedValue<number>; currentPage: number;
    onNext: () => void; isLast: boolean;
}) {
    const pageIndex = stepIndex + 1; // page 0 = intro, page 1 = step 0, …
    const leftEdge = (pageIndex - 1) * width;
    const center = pageIndex * width;
    const rightEdge = (pageIndex + 1) * width;

    // Content fades + scales in as page centres
    const contentStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollX.value, [leftEdge, center, rightEdge], [0.3, 1, 0.3], Extrapolation.CLAMP),
        transform: [
            {
                scale: interpolate(
                    scrollX.value,
                    [leftEdge, center, rightEdge],
                    [0.94, 1, 0.94],
                    Extrapolation.CLAMP,
                ),
            },
            {
                translateY: interpolate(
                    scrollX.value,
                    [leftEdge, center, rightEdge],
                    [10, 0, 10],
                    Extrapolation.CLAMP,
                ),
            },
        ],
    }));

    // Ghost numeral slides in from the right and fades
    const ghostStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollX.value, [leftEdge, center, rightEdge], [0, 0.06, 0], Extrapolation.CLAMP),
        transform: [
            {
                translateX: interpolate(
                    scrollX.value,
                    [leftEdge, center, rightEdge],
                    [40, 0, -40],
                    Extrapolation.CLAMP,
                ),
            },
        ],
    }));

    // Background wash parallax (trails the swipe at 0.5×)
    const washStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: interpolate(
                    scrollX.value,
                    [leftEdge, center, rightEdge],
                    [-width * 0.12, 0, width * 0.12],
                    Extrapolation.CLAMP,
                ),
            },
        ],
    }));

    return (
        <View style={[sp.page, { width }]}>
            {/* Parallax colour wash */}
            <Animated.View style={[sp.wash, { backgroundColor: accent + '12' }, washStyle]} />

            {/* Ghost numeral */}
            <Animated.Text style={[sp.ghost, ghostStyle]}>{padN(step.n)}</Animated.Text>

            <Animated.View style={[sp.contentWrap, contentStyle]}>
                {/* Step kicker */}
                <Text style={sp.kicker}>STEP {padN(step.n)} OF {padN(totalSteps)}</Text>

                <View style={sp.rail}>
                    {/* Left tick-rail */}
                    <TickRail total={totalSteps} currentPage={stepIndex + 1} />

                    {/* Step body */}
                    <View style={sp.textBlock}>
                        <Text style={sp.stepTitle}>{step.title}</Text>
                        <Text style={sp.stepBody}>{step.body}</Text>

                        {step.tip ? (
                            <View style={sp.tipBox}>
                                <Text style={sp.tipLabel}>TIP</Text>
                                <Text style={sp.tipText}>{step.tip}</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </Animated.View>

            {/* Next / Finish CTA */}
            <TouchableOpacity
                style={[sp.nextBtn, { borderColor: accent }]}
                onPress={onNext}
                activeOpacity={0.8}
            >
                <Text style={[sp.nextBtnText, { color: accent }]}>{isLast ? 'Finish' : 'Next step'}</Text>
                <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color={accent} />
            </TouchableOpacity>
        </View>
    );
}

const sp = StyleSheet.create({
    page: { flex: 1, paddingHorizontal: 28, paddingBottom: 40, position: 'relative', justifyContent: 'space-between', overflow: 'hidden' },
    wash: { ...StyleSheet.absoluteFillObject },
    ghost: {
        position: 'absolute', bottom: 80, right: 20,
        fontFamily: fonts.serifSemiBold, fontSize: 160, color: '#111113',
        lineHeight: 160, includeFontPadding: false,
    },
    contentWrap: { flex: 1, justifyContent: 'center', paddingTop: 16 },
    kicker: { fontFamily: fonts.sansBold, fontSize: 10, color: MUTE, letterSpacing: 2, marginBottom: 20 },
    rail: { flexDirection: 'row', gap: 20, flex: 1 },
    textBlock: { flex: 1 },
    stepTitle: { fontFamily: fonts.serif, fontSize: 32, color: INK, lineHeight: 38, letterSpacing: -0.8, marginBottom: 14 },
    stepBody: { fontFamily: fonts.sans, fontSize: 16, color: '#444', lineHeight: 25 },
    tipBox: { marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: TRACK },
    tipLabel: { fontFamily: fonts.sansBold, fontSize: 10, color: MUTE, letterSpacing: 1.5, marginBottom: 4 },
    tipText: { fontFamily: fonts.serifItalic, fontSize: 15, color: '#666', lineHeight: 21 },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, height: 50, borderRadius: 999, borderWidth: 1.5, marginTop: 28,
        ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as any } : {}),
    },
    nextBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 15, fontWeight: '600' },
});

// ── DonePage ───────────────────────────────────────────────────────────────

function DonePage({
    width, accent, whyItMatters, markedDone, markingDone,
    doneBtnStyle, onMarkDone, onClose,
}: {
    width: number; accent: string; whyItMatters: string;
    markedDone: boolean; markingDone: boolean;
    doneBtnStyle: any; onMarkDone: () => void; onClose: () => void;
}) {
    return (
        <View style={[dp.page, { width }]}>
            <View style={[dp.wash, { backgroundColor: accent + '14' }]} />

            <View style={dp.body}>
                <Text style={dp.checkmark}>{markedDone ? '✓' : '○'}</Text>
                <Text style={dp.heading}>{markedDone ? 'Done!' : 'You\'re ready'}</Text>
                <Text style={dp.sub}>{whyItMatters}</Text>
            </View>

            <Animated.View style={[dp.btnWrap, doneBtnStyle]}>
                {!markedDone ? (
                    <TouchableOpacity
                        style={[dp.doneBtn, { backgroundColor: accent }]}
                        onPress={onMarkDone}
                        activeOpacity={0.82}
                        disabled={markingDone}
                    >
                        {markingDone
                            ? <ActivityIndicator color="#fff" />
                            : <>
                                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                                <Text style={dp.doneBtnText}>Mark done</Text>
                            </>
                        }
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[dp.doneBtn, { backgroundColor: INK }]}
                        onPress={onClose}
                        activeOpacity={0.82}
                    >
                        <Text style={dp.doneBtnText}>Close</Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        </View>
    );
}

const dp = StyleSheet.create({
    page: { flex: 1, paddingHorizontal: 28, paddingBottom: 52, position: 'relative', justifyContent: 'space-between' },
    wash: { ...StyleSheet.absoluteFillObject },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 32 },
    checkmark: { fontSize: 56, color: '#111113', marginBottom: 24 },
    heading: { fontFamily: fonts.serif, fontSize: 40, color: INK, textAlign: 'center', marginBottom: 16, letterSpacing: -1 },
    sub: { fontFamily: fonts.sans, fontSize: 16, color: '#555', lineHeight: 24, textAlign: 'center' },
    btnWrap: { marginTop: 24 },
    doneBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, height: 54, borderRadius: 999,
        ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as any } : {}),
    },
    doneBtnText: { fontFamily: fonts.sansBold, fontSize: 16, color: '#fff', fontWeight: '700' },
});

// ── Root styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FAFAF8' },
    header: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        paddingVertical: 12, gap: 16,
    },
    closeBtn: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: CREAM,
        alignItems: 'center', justifyContent: 'center',
    },
    progressWrap: { flex: 1 },
    chip: {
        alignSelf: 'flex-start', marginHorizontal: 24, marginBottom: 4,
        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
    },
    chipText: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.5 },
    pager: { flex: 1 },
    loadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadText: { fontFamily: fonts.sans, fontSize: 14, color: MUTE },
    errorText: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', paddingHorizontal: 32 },
});

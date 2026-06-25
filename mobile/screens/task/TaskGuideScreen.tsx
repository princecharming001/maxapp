/**
 * TaskGuideScreen — full-screen VERTICAL pager of step-only task-guide pages.
 *
 * Editorial recipe layout (per RALPH_TASK_STEPS §2): full-bleed hero photo at the top
 * that fades into the cream page, a "Step NN" kicker, a big Fraunces instruction, a left
 * vertical progress rail, a "Tip" block, and a horizontally-scrolling ingredient row.
 *
 * Architecture:
 *   • One full-screen page per STEP — no Intro page, no Done / "Mark done" page.
 *   • Swipe UP = next step, swipe DOWN = previous step (vertical pagingEnabled).
 *   • Reanimated 4.1 Animated.ScrollView; scrollY drives every interpolation on the UI
 *     thread (parallax hero + fade/scale/translate content) — no setState animation.
 *   • No new native deps. expo-image (hero + product tiles), expo-linear-gradient (the
 *     seamless fade), expo-video (the optional "Watch" button).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Platform,
    Linking,
    Modal,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
    runOnJS,
    type SharedValue,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTaskGuide, type TaskGuideStep, type TaskGuideIngredient } from '../../hooks/useTaskGuide';
import { fonts } from '../../theme/dark';
import api from '../../services/api';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

// ── Editorial palette (cream/ink — reuse, do not invent) ─────────────────────
const INK = '#111113';
const CREAM = '#F7F6F2';
const MUTE = '#9A9A9A';
const HAIRLINE = '#E2E0DA';

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function hapticTick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
function padN(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}
function initials(name: string): string {
    const words = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '·';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// ── Ingredient card ──────────────────────────────────────────────────────────
function IngredientCard({ item, index, stepN }: { item: TaskGuideIngredient; index: number; stepN: number }) {
    const img = api.resolveAttachmentUrl(item.image);
    const tappable = !!item.url;
    const testID = `ingredient-card-${stepN}-${index}`;
    const a11y = `Ingredient ${item.name}${item.note ? `, ${item.note}` : ''}`;
    const Inner = (
        <View style={c.card}>
            <View style={c.tile}>
                {img ? (
                    <ExpoImage source={{ uri: img }} style={c.tileImg} contentFit="cover" transition={150} />
                ) : (
                    <Text style={c.tileInitials}>{initials(item.name)}</Text>
                )}
            </View>
            <View style={c.cardText}>
                <Text style={c.cardName} numberOfLines={2}>{item.name}</Text>
                {item.note ? <Text style={c.cardNote} numberOfLines={1}>{item.note}</Text> : null}
            </View>
        </View>
    );
    if (tappable) {
        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => Linking.openURL(item.url!).catch(() => {})}
                testID={testID}
                accessibilityLabel={a11y}
                accessibilityRole="button"
            >
                {Inner}
            </TouchableOpacity>
        );
    }
    return (
        <View testID={testID} accessibilityLabel={a11y}>
            {Inner}
        </View>
    );
}

const c = StyleSheet.create({
    card: {
        width: 150, marginRight: 12, borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIRLINE, borderRadius: 14, backgroundColor: '#FFFFFF',
        padding: 10, flexDirection: 'row', gap: 10, alignItems: 'center',
        ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as any } : {}),
    },
    tile: {
        width: 44, height: 44, borderRadius: 9, backgroundColor: CREAM,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
    },
    tileImg: { width: '100%', height: '100%' },
    tileInitials: { fontFamily: fonts.sansBold, fontSize: 14, color: INK, letterSpacing: 0.5 },
    cardText: { flex: 1 },
    cardName: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: INK, lineHeight: 16 },
    cardNote: { fontFamily: fonts.sans, fontSize: 11.5, color: MUTE, marginTop: 2 },
});

// ── Left vertical progress rail ──────────────────────────────────────────────
function ProgressRail({ total, current }: { total: number; current: number }) {
    return (
        <View style={pr.rail} accessibilityLabel={`Step ${current} of ${total}`}>
            {Array.from({ length: total }).map((_, i) => (
                <View key={i} style={[pr.dash, i <= current - 1 ? pr.dashOn : pr.dashOff]} />
            ))}
        </View>
    );
}
const pr = StyleSheet.create({
    rail: { width: 4, alignItems: 'center', gap: 6, paddingTop: 8 },
    dash: { width: 4, height: 16, borderRadius: 2 },
    dashOn: { backgroundColor: INK },
    dashOff: { backgroundColor: HAIRLINE },
});

// ── One step page ────────────────────────────────────────────────────────────
function StepPage({
    step, index, total, height, heroUri, scrollY, onWatch,
}: {
    step: TaskGuideStep;
    index: number;
    total: number;
    height: number;
    heroUri?: string;
    scrollY: SharedValue<number>;
    onWatch: (url: string) => void;
}) {
    const insets = useSafeAreaInsets();
    // Responsive hero: smaller on short screens (iPhone SE) so the instruction, tip,
    // and the Ingredients row all fit on one page without clipping (SC5).
    const isSmall = height < 740;
    const heroHeight = Math.round(height * (isSmall ? 0.38 : 0.48));
    const top = index * height;
    const range = [top - height, top, top + height];

    // Hero parallaxes (translates slower than the page) + slight zoom.
    const heroStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(scrollY.value, range, [70, 0, -70], Extrapolation.CLAMP) },
            { scale: interpolate(scrollY.value, range, [1.08, 1, 1.08], Extrapolation.CLAMP) },
        ],
    }));

    // Content fades + scales + translates in as the page reaches centre.
    const contentStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, range, [0.15, 1, 0.15], Extrapolation.CLAMP),
        transform: [
            { translateY: interpolate(scrollY.value, range, [26, 0, 26], Extrapolation.CLAMP) },
            { scale: interpolate(scrollY.value, range, [0.96, 1, 0.96], Extrapolation.CLAMP) },
        ],
    }));

    const ingredients = step.ingredients ?? [];

    return (
        <View style={[sp.page, { height }]} testID={`guide-step-${step.n}`} accessibilityLabel={`Step ${step.n}`}>
            {/* Hero photo — bleeds from the top, behind the top row + first text lines */}
            {heroUri ? (
                <Animated.View style={[sp.heroWrap, { height: heroHeight }, heroStyle]} pointerEvents="none">
                    <ExpoImage source={{ uri: heroUri }} style={sp.hero} contentFit="cover" transition={200} />
                </Animated.View>
            ) : null}
            {/* Seamless fade: hero → cream. No hard rectangular edge. */}
            <LinearGradient
                pointerEvents="none"
                colors={['transparent', 'transparent', CREAM]}
                locations={[0, 0.72, 1]}
                style={[sp.fade, { height: heroHeight + 8 }]}
            />

            {/* Watch ▶ pill — only when the step has a video */}
            {step.video ? (
                <TouchableOpacity
                    style={[sp.watch, { top: insets.top + 8 }]}
                    activeOpacity={0.85}
                    onPress={() => onWatch(step.video!)}
                    testID="guide-watch"
                    accessibilityLabel="Watch video"
                >
                    <Text style={sp.watchText}>Watch</Text>
                    <Ionicons name="play" size={12} color={INK} />
                </TouchableOpacity>
            ) : null}

            {/* Content. Column layout: kicker + (instruction region that auto-fits) +
                tip + ingredients PINNED at the bottom so the Ingredients row is always
                visible/reachable on every device (SC5). The page itself never scrolls,
                so full-screen swipe-to-page (SC6) is preserved. */}
            <Animated.View
                style={[sp.content, { paddingTop: heroHeight - 40, paddingBottom: insets.bottom + 20 }, contentStyle]}
            >
                <Text style={sp.kicker}>Step {padN(step.n)}</Text>

                {/* Instruction grows to fill the space above tip+ingredients; long
                    bodies shrink to fit (adjustsFontSizeToFit) instead of pushing the
                    Ingredients row off-screen. */}
                <View style={sp.railRow}>
                    <ProgressRail total={total} current={step.n} />
                    <View style={sp.instructionWrap}>
                        <Text
                            style={[sp.instruction, isSmall && sp.instructionSmall]}
                            adjustsFontSizeToFit
                            minimumFontScale={0.55}
                            numberOfLines={isSmall ? 11 : 16}
                        >
                            {step.body}
                        </Text>
                    </View>
                </View>

                {step.tip ? (
                    <View style={sp.tipBlock}>
                        <Text style={sp.tipLabel}>Tip</Text>
                        <Text style={sp.tipText} numberOfLines={3}>{step.tip}</Text>
                    </View>
                ) : null}

                {ingredients.length > 0 ? (
                    <View
                        style={sp.ingredients}
                        testID={`guide-ingredients-${step.n}`}
                        accessibilityLabel={`Ingredients for step ${step.n}`}
                    >
                        <Text style={sp.ingredientsLabel}>Ingredients</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={sp.ingredientsRow}
                        >
                            {ingredients.map((it, i) => (
                                <IngredientCard key={`${it.name}-${i}`} item={it} index={i} stepN={step.n} />
                            ))}
                        </ScrollView>
                    </View>
                ) : null}
            </Animated.View>
        </View>
    );
}

const sp = StyleSheet.create({
    page: { width: '100%', backgroundColor: CREAM, overflow: 'hidden' },
    heroWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
    hero: { width: '100%', height: '100%' },
    fade: { position: 'absolute', top: 0, left: 0, right: 0 },
    watch: {
        position: 'absolute', right: 16, zIndex: 5,
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
    },
    watchText: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: INK },
    content: { flex: 1, paddingHorizontal: 24 },
    kicker: { fontFamily: fonts.sansMedium, fontSize: 13, color: MUTE, letterSpacing: 0.5, marginBottom: 12 },
    // flex:1 — grows to fill the gap above tip+ingredients, keeping the row pinned/visible.
    railRow: { flexDirection: 'row', gap: 16, flex: 1 },
    instructionWrap: { flex: 1, justifyContent: 'flex-start' },
    instruction: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 37, color: INK, letterSpacing: -0.4 },
    instructionSmall: { fontSize: 22, lineHeight: 30 },
    tipBlock: { marginTop: 16 },
    tipLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK, marginBottom: 4 },
    tipText: { fontFamily: fonts.serifItalic, fontSize: 14.5, lineHeight: 21, color: MUTE },
    ingredients: { marginTop: 18 },
    ingredientsLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK, marginBottom: 12 },
    ingredientsRow: { paddingRight: 24 },
});

// ── Screen ───────────────────────────────────────────────────────────────────
export default function TaskGuideScreen() {
    const insets = useSafeAreaInsets();
    const { height: winH } = useWindowDimensions();
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<RouteParams, 'TaskGuide'>>();
    const { scheduleId, taskId } = route.params;

    const { data: guide, isLoading, isError } = useTaskGuide(scheduleId, taskId);

    const scrollY = useSharedValue(0);
    const lastPage = useRef(0);
    const [pageH, setPageH] = useState(0);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    const player = useVideoPlayer(videoUrl ?? '', (p) => { if (videoUrl) { p.loop = false; p.play(); } });

    const onScroll = useAnimatedScrollHandler({
        onScroll(e) {
            scrollY.value = e.contentOffset.y;
        },
        onMomentumEnd(e) {
            if (pageH > 0) {
                const page = Math.round(e.contentOffset.y / pageH);
                if (page !== lastPage.current) {
                    lastPage.current = page;
                    runOnJS(hapticTick)();
                }
            }
        },
    });

    const steps = guide?.steps ?? [];
    const heroUri = useMemo(
        () => api.resolveAttachmentUrl(guide?.hero_image),
        [guide?.hero_image],
    );

    const handleWatch = useCallback((url: string) => setVideoUrl(url), []);

    // ── Loading / error ──────────────────────────────────────────────────────
    if (isLoading || isError || !guide) {
        return (
            <View style={[s.screen, { paddingTop: insets.top }]}>
                <CloseButton onPress={() => navigation.goBack()} top={insets.top} />
                <View style={s.center}>
                    {isLoading ? (
                        <>
                            <ActivityIndicator color={MUTE} />
                            <Text style={s.dim}>Preparing your guide…</Text>
                        </>
                    ) : (
                        <Text style={s.dim}>Couldn't load guide. Try again.</Text>
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={s.screen} onLayout={(e) => setPageH(e.nativeEvent.layout.height)}>
            {pageH > 0 && (
                <AnimatedScrollView
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    pagingEnabled
                    snapToInterval={pageH}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    bounces={false}
                >
                    {steps.map((step, i) => (
                        <StepPage
                            key={step.n}
                            step={step}
                            index={i}
                            total={steps.length}
                            height={pageH}
                            heroUri={api.resolveAttachmentUrl(step.image) || heroUri}
                            scrollY={scrollY}
                            onWatch={handleWatch}
                        />
                    ))}
                </AnimatedScrollView>
            )}

            {/* Global ✕ — closes from any step */}
            <CloseButton onPress={() => navigation.goBack()} top={insets.top} />

            {/* Video modal (expo-video) */}
            <Modal visible={!!videoUrl} animationType="slide" onRequestClose={() => setVideoUrl(null)}>
                <View style={s.videoModal}>
                    <CloseButton onPress={() => setVideoUrl(null)} top={insets.top + 4} dark />
                    {videoUrl ? (
                        <VideoView style={s.video} player={player} allowsFullscreen contentFit="contain" />
                    ) : null}
                </View>
            </Modal>
        </View>
    );
}

// ── Close button (rounded square, hairline border) ──────────────────────────
function CloseButton({ onPress, top, dark }: { onPress: () => void; top: number; dark?: boolean }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[s.close, { top: top + 8 }, dark && s.closeDark]}
            accessibilityRole="button"
            accessibilityLabel="Close guide"
            testID="guide-close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <Ionicons name="close" size={20} color={dark ? '#fff' : INK} />
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: CREAM },
    close: {
        position: 'absolute', left: 16, zIndex: 20,
        width: 38, height: 38, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
        ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as any } : {}),
    },
    closeDark: { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.2)' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    dim: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', paddingHorizontal: 32 },
    videoModal: { flex: 1, backgroundColor: '#000' },
    video: { flex: 1 },
});

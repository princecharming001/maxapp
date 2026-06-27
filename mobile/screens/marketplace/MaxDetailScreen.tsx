/**
 * MaxDetailScreen — the page you land on when you tap a max (or creator course)
 * in Explore. Minimalist + editorial: a calm cream page, Fraunces serif title,
 * the max's colour used only as a small accent.
 *
 * The information shown ADAPTS to what you're looking at:
 *   • A native max ($3.99/wk, ongoing) is lean — the one-line promise, "does it
 *     fit my real week", what you'll get, and one honest line of proof. No fake
 *     curriculum / instructor / FAQ filler.
 *   • A creator course (one payment, fixed weeks) earns the deeper page —
 *     curriculum, instructor, reviews, FAQ, guarantee.
 *
 * Card data from route params renders instantly; GET /marketplace/item/{id}
 * fills the rest in.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Animated,
    Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { Alert } from '../../components/InAppAlert';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api, { type MarketplaceItem } from '../../services/api';
import { getCourseForMaxx, isCreatorCourse } from '../../data/courseContent';
import { hexA, maxMeta } from '../../utils/scheduleAggregation';
import { HABIT_CATALOG } from '../../data/habitCatalog';
import { track } from '../../lib/analytics';

const CANVAS = '#FFFFFF';
const CARD = '#FFFFFF';
const INK = '#111113';
const MUTE = '#9A9A9A';
const SUB = '#555555';
const GOLD = '#2C6BED';
const ACCENT = '#2F6B4E';
const HAIRLINE = 'rgba(0,0,0,0.08)';
const SERIF = 'Fraunces';

function fmtK(n?: number): string {
    if (!n) return '';
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}

// Glossy 3D "jelly" icons (background-removed) for the native maxes — the brand
// visual language. 1:1 by lowercased id. Creator courses have no jelly icon and
// fall back to a brand-tinted serif monogram (NO photos anywhere).
const NATIVE_THUMBS_CUT: Record<string, any> = {
    skinmax: require('../../assets/maxxThumbs/cut/skinmax.png'),
    heightmax: require('../../assets/maxxThumbs/cut/heightmax.png'),
    hairmax: require('../../assets/maxxThumbs/cut/hairmax.png'),
    fitmax: require('../../assets/maxxThumbs/cut/fitmax.png'),
    bonemax: require('../../assets/maxxThumbs/cut/bonemax.png'),
};
function jellyThumb(id?: string): any | null {
    return NATIVE_THUMBS_CUT[String(id || '').toLowerCase()] || null;
}

/** Brand-tinted serif initial — replaces every avatar/photo on this page. */
function Monogram({ name, color, size = 42 }: { name?: string; color: string; size?: number }) {
    const ch = (name || '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexA(color, 0.14),
            borderWidth: StyleSheet.hairlineWidth, borderColor: hexA(color, 0.42),
        }}>
            <Text style={{ fontFamily: SERIF, fontSize: Math.round(size * 0.44), color, marginTop: -1 }}>{ch}</Text>
        </View>
    );
}

const VERDICT = {
    green: { color: ACCENT, line: 'Fits your real week' },
    amber: { color: '#B07D10', line: 'Tight, but workable' },
    red: { color: '#C0452C', line: 'Your week is packed' },
};

/** "Fits your real week" — the moat, made visible. A clean card. */
function Feasibility({ id, color }: { id: string; color: string }) {
    const q = useQuery({
        queryKey: ['feasibility', id],
        queryFn: () => api.getPlannerFeasibility(id),
        staleTime: 5 * 60_000,
    });
    const d = q.data;
    if (q.isLoading || !d) return <View style={[styles.card, { height: 112 }]} />;
    const meta = VERDICT[d.verdict] ?? VERDICT.amber;
    return (
        <View style={styles.card}>
            <View style={styles.rowCenter}>
                <Ionicons name="checkmark-circle" size={16} color={meta.color} />
                <Text style={[styles.feasVerdict, { color: meta.color }]}>{meta.line}</Text>
            </View>
            <Text style={styles.feasLine}>
                Max fits {d.fits_n_of_m.fits} of {d.fits_n_of_m.of} weekly sessions into your real week.
            </Text>
            <View style={styles.ghostRow}>
                {d.ghost_week.map((g) => {
                    const n = g.slots.length;
                    const on = n > 0;
                    // True intensity: bar height scales with that day's session count.
                    const barH = on ? Math.min(12 + (n - 1) * 5, 24) : 6;
                    return (
                        <View key={g.day} style={styles.ghostDay}>
                            <View style={styles.ghostBarWrap}>
                                <View
                                    style={[
                                        styles.ghostBar,
                                        on
                                            ? { height: barH, backgroundColor: color, shadowColor: color, shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } }
                                            : { height: barH, backgroundColor: 'rgba(28,26,23,0.12)' },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.ghostLetter, on && { color: INK }]}>{g.day[0]}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function Stars({ n }: { n: number }) {
    return (
        <View style={{ flexDirection: 'row', gap: 1 }}>
            {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons key={i} name={i <= Math.round(n) ? 'star' : 'star-outline'} size={12} color="#E0A500" />
            ))}
        </View>
    );
}

function Accordion({ title, badge, children, open, onToggle }: {
    title: string; badge?: string; children?: React.ReactNode; open: boolean; onToggle: () => void;
}) {
    return (
        <View style={styles.accItem}>
            <TouchableOpacity style={styles.accHead} activeOpacity={0.7} onPress={onToggle}>
                <Text style={styles.accTitle}>{title}</Text>
                {badge ? <Text style={styles.freeBadge}>{badge}</Text> : null}
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={MUTE} />
            </TouchableOpacity>
            {open ? <View style={styles.accBody}>{children}</View> : null}
        </View>
    );
}

/** Lighten a #rrggbb hex toward white by `amt` (0–1). */
function lightenHex(hex: string, amt: number): string {
    const h = (hex || '#000000').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const ch = (i: number) => {
        const v = parseInt(full.slice(i, i + 2), 16);
        return Math.round(v + (255 - v) * amt);
    };
    return `rgb(${ch(0)}, ${ch(2)}, ${ch(4)})`;
}

/** Soft brand aurora mesh — layered radial blooms (warm→cool) over warm white. */
function HeroAuroraMD({ base }: { base: string }) {
    const light = lightenHex(base, 0.58);
    return (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
                {/* main pool of brand light, centered on the icon, fades out all ways */}
                <RadialGradient id="md-main" cx="50%" cy="38%" r="46%">
                    <Stop offset="0%" stopColor={base} stopOpacity={0.36} />
                    <Stop offset="42%" stopColor={base} stopOpacity={0.13} />
                    <Stop offset="100%" stopColor={base} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="md-warm" cx="14%" cy="2%" r="52%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.55} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="md-cool" cx="92%" cy="14%" r="50%">
                    <Stop offset="0%" stopColor={light} stopOpacity={0.4} />
                    <Stop offset="100%" stopColor={light} stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Rect x="-20%" y="-20%" width="140%" height="120%" fill="url(#md-warm)" />
            <Rect x="-20%" y="-20%" width="140%" height="120%" fill="url(#md-cool)" />
            <Rect x="-20%" y="-20%" width="140%" height="120%" fill="url(#md-main)" />
        </Svg>
    );
}

/** Soft blurred contact shadow under the floating icon — a tight pool, not a band. */
function HeroShadowMD() {
    return (
        <Svg width="132" height="40" pointerEvents="none">
            <Defs>
                <RadialGradient id="md-shadow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#2A2118" stopOpacity={0.22} />
                    <Stop offset="58%" stopColor="#2A2118" stopOpacity={0.07} />
                    <Stop offset="100%" stopColor="#2A2118" stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Ellipse cx="66" cy="20" rx="62" ry="15" fill="url(#md-shadow)" />
        </Svg>
    );
}

/**
 * Photo-free, object-in-light hero. The max's glossy 3D "jelly" icon floats in a
 * soft brand aurora with a blurred contact shadow (a gentle idle float + scroll
 * parallax) — no flat color wash, no flat solid glow disc. Creator courses with
 * no jelly icon fall back to a brand-tinted serif monogram. Serif title beneath.
 */
function JellyHero({ item, base, scrollY }: { item: MarketplaceItem; base: string; scrollY: Animated.Value }) {
    const thumb = jellyThumb(item.id);
    const translateY = scrollY.interpolate({ inputRange: [-150, 0, 300], outputRange: [-26, 0, 80], extrapolate: 'clamp' });
    const scale = scrollY.interpolate({ inputRange: [-150, 0], outputRange: [1.12, 1], extrapolateRight: 'clamp' });
    const opacity = scrollY.interpolate({ inputRange: [0, 220, 300], outputRange: [1, 0.55, 0.2], extrapolate: 'clamp' });

    // Gentle idle float (shadow breathes inversely) — the icon lives in the light.
    const float = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(float, { toValue: 1, duration: 3400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(float, { toValue: 0, duration: 3400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [float]);
    const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [5, -9] });
    const shScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });
    const shOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });

    return (
        <View style={styles.hero}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <HeroAuroraMD base={base} />
            </View>
            <Animated.View style={[styles.heroIconWrap, { opacity, transform: [{ translateY }, { scale }] }]}>
                <Animated.View
                    pointerEvents="none"
                    style={[styles.heroShadowWrap, { opacity: shOpacity, transform: [{ scaleX: shScale }, { scaleY: shScale }] }]}
                >
                    <HeroShadowMD />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateY: floatY }] }}>
                    {thumb ? (
                        <Image source={thumb} style={styles.heroThumb} contentFit="contain" transition={260} />
                    ) : (
                        <Monogram name={item.title} color={base} size={132} />
                    )}
                </Animated.View>
            </Animated.View>
        </View>
    );
}

/** Real, catalog-derived program stats (SC6 — ss2 stats grid). No fabrication:
 *  routines = curated habit count; areas = distinct focus areas; cadence/length
 *  reflect how the max actually schedules. Courses show weeks/lessons instead. */
function StatsGrid({ item, isCourse }: { item: MarketplaceItem; isCourse: boolean }) {
    const habits = HABIT_CATALOG[String(item.id || '').toLowerCase()] || [];
    const areas = new Set(habits.map((h) => h.area)).size;
    const d = item.detail || {};
    let stats: { value: string; label: string }[];
    if (isCourse) {
        const weeks = item.weeks || (d.curriculum?.length ?? 0);
        const lessons = (d.curriculum || []).reduce((n, w) => n + (w.lessons?.length || 0), 0);
        stats = [
            { value: weeks ? String(weeks) : '—', label: 'Weeks' },
            { value: lessons ? String(lessons) : '—', label: 'Lessons' },
            { value: item.rating ? item.rating.toFixed(1) : '—', label: 'Rating' },
        ];
    } else {
        stats = [
            { value: habits.length ? String(habits.length) : '—', label: 'Routines' },
            { value: areas ? String(areas) : '—', label: 'Focus areas' },
            { value: 'Daily', label: 'Cadence' },
        ];
    }
    return (
        <View style={styles.statsGrid}>
            {stats.map((s, i) => (
                <View key={s.label} style={[styles.statCell, i < stats.length - 1 && styles.statDivider]}>
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                </View>
            ))}
        </View>
    );
}

function _todayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _hms(ms: number): string {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
        .map((n) => String(n).padStart(2, '0')).join(':');
}

type SessionNode = { title: string; time?: string; state: 'done' | 'current' | 'locked'; countdownMs?: number };

/** ss3-style vertical session timeline (SC7). With a real schedule it shows today's
 *  sessions: completed = checkmark, the next = ringed "current", future = lock +
 *  "Available in HH:MM:SS". With no schedule yet it previews the routine path. */
function SessionTimeline({ item, base }: { item: MarketplaceItem; base: string }) {
    // Use the same reliable source the Planner/Home use (active schedules full),
    // filtered to this max — getMaxxSchedule was flaky over the slow pooled DB.
    const q = useQuery({
        queryKey: ['schedules', 'active', 'full'],
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
        retry: 1,
    });
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const nodes: SessionNode[] = React.useMemo(() => {
        const full: any = q.data;
        const mid = String(item.id || '').toLowerCase();
        const sched: any = (full?.schedules || []).find((s: any) => String(s?.maxx_id || '').toLowerCase() === mid);
        const days: any[] = sched?.days || [];
        const today = full?.today_date || _todayLocal();
        // Flatten sessions from today forward (real datetimes), so the path shows
        // done (completed) → current (due now) → locked future (with countdown).
        const flat: { title: string; date: string; time: string; status: string }[] = [];
        for (const d of days) {
            if (!d?.date || d.date < today) continue;
            const ts = (d.tasks || []).slice().sort((a: any, b: any) => String(a.time || '').localeCompare(String(b.time || '')));
            for (const t of ts) flat.push({ title: t.title || 'Session', date: d.date, time: t.time || '', status: t.status });
            if (flat.length >= 8) break;
        }
        if (flat.length) {
            let currentSet = false;
            return flat.slice(0, 7).map((t) => {
                const target = new Date(`${t.date}T${(t.time || '00:00')}:00`).getTime();
                const isFuture = target - now > 0;
                let state: SessionNode['state'];
                let countdownMs: number | undefined;
                if (t.status === 'completed') state = 'done';
                else if (!isFuture && !currentSet) { state = 'current'; currentSet = true; }
                else { state = 'locked'; if (isFuture) countdownMs = target - now; }
                return { title: t.title, time: t.time, state, countdownMs };
            });
        }
        // Preview from the curated routine catalog (not started yet).
        const habits = HABIT_CATALOG[String(item.id || '').toLowerCase()] || [];
        return habits.slice(0, 6).map((h, i) => ({ title: h.label, state: i === 0 ? 'current' : 'locked' } as SessionNode));
    }, [q.data, now, item.id]);

    if (!nodes.length) return null;
    const _mid = String(item.id || '').toLowerCase();
    const _real = ((q.data as any)?.schedules || []).find((s: any) => String(s?.maxx_id || '').toLowerCase() === _mid);
    const previewMode = !_real?.days?.length;

    return (
        <View style={styles.block}>
            <Text style={styles.sectionLabel}>{previewMode ? 'Your routine path' : "Today's sessions"}</Text>
            <View>
                {nodes.map((n, i) => {
                    const last = i === nodes.length - 1;
                    return (
                        <View key={i} style={tl.row}>
                            <View style={tl.rail}>
                                <View style={tl.nodeWrap}>
                                    {n.state === 'current' ? (
                                        <View style={[tl.nodeGlow, { backgroundColor: hexA(base, 0.2) }]} />
                                    ) : null}
                                    <View style={[
                                        tl.node,
                                        n.state === 'done' && { backgroundColor: base, borderColor: base },
                                        n.state === 'current' && { backgroundColor: base, borderColor: base },
                                        n.state === 'locked' && { backgroundColor: CARD, borderColor: HAIRLINE },
                                    ]}>
                                        {n.state === 'done' ? <Ionicons name="checkmark" size={14} color="#fff" />
                                            : n.state === 'current' ? <View style={tl.dotCurrent} />
                                            : <Ionicons name="lock-closed" size={11} color={MUTE} />}
                                    </View>
                                </View>
                                {!last ? <View style={tl.connector} /> : null}
                            </View>
                            <View style={tl.card}>
                                <Text style={[tl.title, n.state === 'locked' && { color: MUTE }]} numberOfLines={1}>{n.title}</Text>
                                <Text style={tl.meta}>
                                    {n.state === 'done' ? 'Done'
                                        : n.state === 'current' ? (n.time ? `Now · ${n.time}` : 'Start here')
                                        : n.countdownMs && n.countdownMs > 0 ? `Available in ${_hms(n.countdownMs)}`
                                        : n.time ? `Scheduled ${n.time}` : 'Upcoming'}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

export default function MaxDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const passed = route.params?.item as MarketplaceItem | undefined;
    const itemId = route.params?.itemId || passed?.id;

    const [item, setItem] = useState<MarketplaceItem | undefined>(passed);
    const [busy, setBusy] = useState(false);
    const [openWeek, setOpenWeek] = useState(0);
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const scrollY = useRef(new Animated.Value(0)).current;
    const ctaScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        let alive = true;
        if (!itemId) return;
        api.getMarketplaceItem(itemId).then((full) => { if (alive) setItem(full); }).catch(() => {});
        track('paywall_view', { item: itemId });
        return () => { alive = false; };
    }, [itemId]);

    if (!item) {
        return (
            <View style={[styles.root, styles.center]}>
                <ActivityIndicator color={INK} />
            </View>
        );
    }

    const d = item.detail || {};
    const isCourse = !item.native;
    const base = item.color || GOLD;
    // Price anchor — a weekly sub framed per day reads far smaller than "/wk".
    const perDay = item.price_cents ? `$${((item.price_cents / 100) / 7).toFixed(2)}` : null;

    const goToSchedule = () => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: 'MasterScheduleTab' });
        } catch { navigation.goBack(); }
    };
    const goToChat = (maxxId: string) => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: 'Chat', params: { initSchedule: maxxId } });
        } catch { navigation.goBack(); }
    };
    // If this marketplace item is backed by a readable System-A course (e.g.
    // coloringmax), the primary action opens the reader — courses with authored
    // chapters are read, not just scheduled.
    // Only CREATOR courses (e.g. coloringmax) open into the reader for free.
    // Native maxes that happen to have a bundled course (skinmax) keep their
    // normal paid enroll flow — gate on isCreatorCourse, not mere existence.
    const readerCourseId = isCreatorCourse(getCourseForMaxx(item.id)) ? item.id : null;
    const openReader = () => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('MaxxDetail', { maxxId: item.id });
        } catch { /* noop */ }
    };

    const onCta = async () => {
        if (item.entered) { goToSchedule(); return; }
        if (busy) return;
        setBusy(true);
        try {
            const res = await api.enterMarketplaceItem(item.id);
            if (res.checkout_url) {
                if (Platform.OS === 'web') window.location.href = res.checkout_url;
                else { const { Linking } = require('react-native'); await Linking.openURL(res.checkout_url); }
                return;
            }
            track('enter', { item: item.id, kind: item.native ? 'maxx' : 'course' });
            setItem({ ...item, entered: true });
            if (isCourse) goToSchedule(); else goToChat(item.id);
        } catch (e: any) {
            // Slot cap reached or a Max is still in its weekly lock — the backend
            // sends a clear 409 message; surface it instead of silently failing.
            const detail = e?.response?.data?.detail;
            const msg = typeof detail === 'string' && detail
                ? detail
                : "Couldn't add this Max right now. Please try again.";
            Alert.alert('Max slots', msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={styles.root}>
            {/* Floating back chip — stays legible over the media hero. */}
            <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-back" size={22} color={INK} />
                </TouchableOpacity>
            </View>

            <Animated.ScrollView
                contentContainerStyle={{ paddingBottom: 130 + insets.bottom }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            >
                <JellyHero item={item} base={base} scrollY={scrollY} />

                {/* Header — type-led, no templated icon chip. */}
                <View style={styles.header}>
                    <View style={styles.kickerRow}>
                        <View style={[styles.kickerDot, { backgroundColor: base }]} />
                        <Text style={styles.kicker}>{(item.category || (isCourse ? 'Course' : 'Max')).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.heroTitle}>{item.title}</Text>
                    <View style={[styles.heroRule, { backgroundColor: base }]} />
                    <Text style={styles.heroTagline}>{item.tagline}</Text>
                </View>

                {/* Real program stats (SC6). */}
                <View style={styles.block}>
                    <StatsGrid item={item} isCourse={isCourse} />
                </View>

                {/* Creator — courses only. */}
                {isCourse ? (
                    <View style={styles.creatorRow}>
                        <Monogram name={item.creator.name} color={base} size={42} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.creatorName}>{item.creator.name}{item.creator.verified ? '  ✓' : ''}</Text>
                            <Text style={styles.creatorHandle}>@{item.creator.handle}</Text>
                        </View>
                        {item.rating ? (
                            <View style={{ alignItems: 'flex-end' }}>
                                <Stars n={item.rating} />
                                <Text style={styles.ratingSub}>{item.rating.toFixed(1)} · {fmtK(item.participants)} members</Text>
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {/* The promise. */}
                {d.long_description ? <Text style={styles.lead}>{d.long_description}</Text> : null}

                {/* Fits your week. */}
                <View style={styles.block}>
                    <Feasibility id={item.id} color={base} />
                </View>

                {/* Session/path timeline (SC7) — native maxes. */}
                {!isCourse ? <SessionTimeline item={item} base={base} /> : null}

                {/* What you'll get. */}
                {d.outcomes?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>What you'll get</Text>
                        <View style={{ gap: 13 }}>
                            {d.outcomes.map((o, i) => (
                                <View key={i} style={styles.outRow}>
                                    <Ionicons name="checkmark" size={17} color={base} style={{ marginTop: 2 }} />
                                    <Text style={styles.outText}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {/* ── Course-only depth ─────────────────────────────────── */}
                {isCourse && d.for_you_if?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>This is for you if</Text>
                        <View style={{ gap: 11 }}>
                            {d.for_you_if.map((o, i) => (
                                <View key={i} style={styles.bulletRow}>
                                    <Ionicons name="ellipse" size={6} color={MUTE} style={{ marginTop: 8 }} />
                                    <Text style={styles.bulletText}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {isCourse && d.curriculum?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>What's inside</Text>
                        {readerCourseId ? (
                            <TouchableOpacity
                                style={[styles.openCourseBtn, { borderColor: base }]}
                                onPress={openReader}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="book-outline" size={16} color={base} />
                                <Text style={styles.openCourseText}>Open the full course</Text>
                                <Ionicons name="arrow-forward" size={15} color={base} />
                            </TouchableOpacity>
                        ) : null}
                        <View style={styles.cardHair}>
                            {d.curriculum.map((w, i) => (
                                <Accordion
                                    key={i}
                                    title={w.title}
                                    badge={!readerCourseId && i === 0 ? 'Free preview' : undefined}
                                    open={openWeek === i}
                                    onToggle={() => setOpenWeek(openWeek === i ? -1 : i)}
                                >
                                    {w.lessons.map((l, j) => (
                                        <View key={j} style={styles.lessonRow}>
                                            <Ionicons name={readerCourseId || i === 0 ? 'play-circle-outline' : 'lock-closed-outline'} size={15} color={readerCourseId || i === 0 ? base : MUTE} />
                                            <Text style={styles.lessonText}>{l}</Text>
                                        </View>
                                    ))}
                                </Accordion>
                            ))}
                        </View>
                    </View>
                ) : null}

                {isCourse && d.bio ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>Your instructor</Text>
                        <View style={styles.creatorRowInline}>
                            <Monogram name={item.creator.name} color={base} size={50} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.creatorName}>{item.creator.name}{item.creator.verified ? '  ✓' : ''}</Text>
                                <Text style={styles.creatorHandle}>@{item.creator.handle}</Text>
                            </View>
                        </View>
                        <Text style={styles.bioText}>{d.bio}</Text>
                        {d.credentials?.length ? (
                            <View style={styles.chipsWrap}>
                                {d.credentials.map((c, i) => (
                                    <View key={i} style={styles.credChip}><Text style={styles.credText}>{c}</Text></View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {isCourse && d.reviews?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>{item.rating ? `Reviews · ${item.rating.toFixed(1)} ★` : 'Reviews'}</Text>
                        <View style={{ gap: 16 }}>
                            {d.reviews.map((r, i) => (
                                <View key={i}>
                                    <View style={styles.rowCenter}>
                                        <Monogram name={r.name} color={base} size={28} />
                                        <Text style={styles.revName}>{r.name}</Text>
                                        <View style={{ flex: 1 }} />
                                        <Stars n={r.rating} />
                                    </View>
                                    <Text style={styles.revText}>{r.text}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {isCourse && d.faqs?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>Questions</Text>
                        <View style={styles.cardHair}>
                            {d.faqs.map((f, i) => (
                                <Accordion key={i} title={f.q} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)}>
                                    <Text style={styles.faqAnswer}>{f.a}</Text>
                                </Accordion>
                            ))}
                        </View>
                    </View>
                ) : null}

                {d.guarantee ? (
                    <View style={styles.guaranteeRow}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={ACCENT} />
                        <Text style={styles.guaranteeText}>{d.guarantee}</Text>
                    </View>
                ) : null}
            </Animated.ScrollView>

            {/* Sticky CTA */}
            <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 14 }]}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.ctaPrice}>{item.price_label}</Text>
                    <Text style={styles.ctaSub}>
                        {readerCourseId
                            ? 'Free · adds to your schedule'
                            : item.price_model === 'weekly'
                                ? `${perDay} a day · cancel anytime`
                                : item.weeks ? `${item.weeks} weeks · one payment` : 'one payment'}
                    </Text>
                </View>
                <Animated.View style={[styles.ctaBtnShadow, { shadowColor: item.entered ? ACCENT : '#000', transform: [{ scale: ctaScale }] }]}>
                    <TouchableOpacity
                        style={[styles.ctaBtn, { backgroundColor: item.entered ? ACCENT : INK }]}
                        activeOpacity={0.9}
                        onPress={onCta}
                        disabled={busy}
                        onPressIn={() => Animated.spring(ctaScale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
                        onPressOut={() => Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start()}
                    >
                        {/* glossy top sheen — light-aware depth */}
                        <LinearGradient
                            pointerEvents="none"
                            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.ctaSheen}
                        />
                        {busy ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.ctaBtnText} numberOfLines={1}>
                                {item.entered ? 'Open' : readerCourseId ? 'Add to schedule' : isCourse ? 'Enroll' : 'Start my plan'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </View>
    );
}

const tl = StyleSheet.create({
    row: { flexDirection: 'row', gap: 14 },
    rail: { alignItems: 'center', width: 30 },
    nodeWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    nodeGlow: { position: 'absolute', width: 42, height: 42, borderRadius: 21 },
    node: {
        width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: HAIRLINE, backgroundColor: CARD,
    },
    dotCurrent: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    connector: { flex: 1, width: 2.5, borderRadius: 2, backgroundColor: HAIRLINE, marginVertical: 3, minHeight: 22 },
    card: { flex: 1, paddingBottom: 18 },
    title: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    meta: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 3 },
});

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CANVAS },
    center: { alignItems: 'center', justifyContent: 'center' },

    topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 14, paddingBottom: 2 },
    backBtn: {
        width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.86)',
    },

    // Jelly-icon hero (photo-free)
    hero: { width: '100%', height: 312, backgroundColor: CANVAS, alignItems: 'center', justifyContent: 'center' },
    heroIconWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 14 },
    heroShadowWrap: { position: 'absolute', bottom: 30, alignItems: 'center', justifyContent: 'center' },
    heroThumb: { width: 188, height: 188 },

    header: { paddingHorizontal: 22, paddingTop: 4 },
    kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
    kickerDot: { width: 7, height: 7, borderRadius: 4 },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.8, color: MUTE },
    heroTitle: { fontFamily: SERIF, fontSize: 44, color: INK, letterSpacing: -1, lineHeight: 47 },
    heroRule: { width: 38, height: 3, borderRadius: 2, marginTop: 18 },
    heroTagline: { fontFamily: 'Matter-Regular', fontSize: 16.5, color: SUB, marginTop: 16, lineHeight: 24 },

    creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, marginTop: 22 },
    creatorRowInline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: HAIRLINE },
    avatarLg: { width: 50, height: 50, borderRadius: 25, backgroundColor: HAIRLINE },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    creatorName: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    creatorHandle: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 1 },
    ratingSub: { fontFamily: 'Matter-Regular', fontSize: 11, color: MUTE, marginTop: 3 },

    lead: { fontFamily: 'Matter-Regular', fontSize: 16, color: SUB, lineHeight: 24, paddingHorizontal: 22, marginTop: 22 },

    block: { paddingHorizontal: 22, marginTop: 28 },
    openCourseBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 14, marginBottom: 2, paddingVertical: 13,
        borderRadius: 14, borderWidth: 1.5, backgroundColor: CARD,
    },
    openCourseText: { fontFamily: 'Matter-SemiBold', fontSize: 14.5, color: INK, letterSpacing: 0.1 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK, marginBottom: 15 },

    // Stats grid (SC6)
    statsGrid: {
        flexDirection: 'row', backgroundColor: CARD, borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
        paddingVertical: 18,
    },
    statCell: { flex: 1, alignItems: 'center' },
    statDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: HAIRLINE },
    statValue: { fontFamily: SERIF, fontSize: 26, color: INK, letterSpacing: -0.5 },
    statLabel: { fontFamily: 'Matter-Medium', fontSize: 11, color: MUTE, marginTop: 5, letterSpacing: 0.3, textTransform: 'uppercase' },

    // Cards
    card: {
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIRLINE,
        padding: 17,
    },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    feasVerdict: { fontFamily: 'Matter-SemiBold', fontSize: 14.5 },
    feasLine: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB, marginTop: 7, lineHeight: 19 },
    ghostRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, alignItems: 'flex-end' },
    ghostDay: { alignItems: 'center', gap: 8, flex: 1 },
    ghostBarWrap: { height: 24, justifyContent: 'flex-end', alignItems: 'center' },
    ghostBar: { width: 7, borderRadius: 4 },
    ghostLetter: { fontFamily: 'Matter-Medium', fontSize: 10.5, color: MUTE },

    // Outcomes
    outRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
    outText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 15, color: INK, lineHeight: 22 },

    bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    bulletText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 22 },

    cardHair: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE },
    accItem: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIRLINE },
    accHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 15 },
    accTitle: { flex: 1, fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    freeBadge: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: GOLD },
    accBody: { paddingBottom: 15, gap: 10 },
    lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    lessonText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB },

    bioText: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 23, marginTop: 14 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    credChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F2F2F2', borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
    credText: { fontFamily: 'Matter-Medium', fontSize: 12, color: SUB },

    revAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: HAIRLINE },
    revName: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK },
    revText: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 22, marginTop: 9 },

    faqAnswer: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 22 },

    guaranteeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, marginTop: 28 },
    guaranteeText: { flex: 1, fontFamily: 'Matter-Medium', fontSize: 13, color: SUB, lineHeight: 19 },

    // Sticky CTA
    ctaBar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 22, paddingTop: 14,
        backgroundColor: 'rgba(247,240,234,0.97)',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE,
    },
    ctaPrice: { fontFamily: 'Matter-Bold', fontSize: 18, color: INK },
    ctaSub: { fontFamily: 'Matter-Regular', fontSize: 12, color: SUB, marginTop: 1 },
    ctaBtnShadow: {
        borderRadius: 999,
        shadowOpacity: 0.3,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 7,
    },
    ctaBtn: { borderRadius: 999, overflow: 'hidden', paddingHorizontal: 32, paddingVertical: 15, minWidth: 124, alignItems: 'center', justifyContent: 'center' },
    ctaSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '52%' },
    ctaBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: '#fff' },
});

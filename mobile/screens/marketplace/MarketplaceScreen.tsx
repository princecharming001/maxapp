/**
 * MarketplaceScreen (Explore) — Revolut "Learn"-style layout in the onboarding
 * cream/ink register: a serif title with a search button that slides open to
 * full width (taking over the title), pill tabs (All / Native / Creator), a
 * "New" horizontal carousel (All tab only), then a 2-column grid. Cards are
 * cover-image posters with a dark scrim + serif title. Tapping opens MaxDetail.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    RefreshControl,
    Animated,
    Easing,
    Modal,
    useWindowDimensions,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import ChatHabitPicker, { type OfferedHabit } from '../../components/ChatHabitPicker';
import CreatorMorphIcon from '../../components/CreatorMorphIcon';
import LaughCryIcon from '../../components/LaughCryIcon';
import { LiquidGlass } from '../../components/glass/LiquidGlass';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import api, { isCreatorMaxx, type MarketplaceItem } from '../../services/api';
import { maxMeta, hexA, registerMaxMeta } from '../../utils/scheduleAggregation';
import { useFlag } from '../../constants/featureFlags';
import { usePersonalization } from '../../hooks/usePersonalization';
import { rankByGoals } from '../../lib/personalization';

const CACHE_KEY = 'marketplace_cache_v2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function readCache(): Promise<{ maxxes: MarketplaceItem[]; courses: MarketplaceItem[] } | null> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL_MS) return null;
        return data;
    } catch {
        return null;
    }
}

async function writeCache(data: { maxxes: MarketplaceItem[]; courses: MarketplaceItem[] }) {
    try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch {}
}

/** Register each creator maxx's accent/icon/label so Home/Planner/Profile
 *  chips tint from the same source as the marketplace card. */
function registerCreatorMeta(courses: MarketplaceItem[] | undefined) {
    for (const c of courses || []) {
        if (isCreatorMaxx(c)) {
            registerMaxMeta(c.id, { color: c.color, icon: c.icon, label: c.title });
        }
    }
}

// Onboarding "Stoic" black-and-white palette (matches OnboardingV2Screen).
const INK = '#000000';
const ON_INK = '#FFFFFF';
const MUTE = '#9A9A9A';
const SUB = '#6B6B6B';
const CREAM = '#F1F1EF';        // soft off-white canvas
const CARD = '#FFFFFF';
const BORDER = 'rgba(0,0,0,0.06)';
const GOLD = '#000000';         // neutral fallback for image-less posters
const SERIF = 'Fraunces';
const SERIF_I = 'Fraunces-Italic';
const GUTTER = 22;
const THUMB_BG = '#EFEFEF';     // matches the generated thumbnail backdrops

// Glossy 3D gradient thumbnails for the native maxes (warm→cool jelly objects).
const NATIVE_THUMBS: Record<string, any> = {
    skinmax: require('../../assets/maxxThumbs/skinmax.png'),
    heightmax: require('../../assets/maxxThumbs/heightmax.png'),
    hairmax: require('../../assets/maxxThumbs/hairmax.png'),
    fitmax: require('../../assets/maxxThumbs/fitmax.png'),
    bonemax: require('../../assets/maxxThumbs/bonemax.png'),
};
function nativeThumb(item: MarketplaceItem): any | null {
    if (!item.native) return null;
    return NATIVE_THUMBS[String(item.id || '').toLowerCase()] || null;
}

// Background-removed (transparent) figures — used on the New carousel so the
// figure floats on one continuous surface with the text (no backdrop seam).
const NATIVE_THUMBS_CUT: Record<string, any> = {
    skinmax: require('../../assets/maxxThumbs/cut/skinmax.png'),
    heightmax: require('../../assets/maxxThumbs/cut/heightmax.png'),
    hairmax: require('../../assets/maxxThumbs/cut/hairmax.png'),
    fitmax: require('../../assets/maxxThumbs/cut/fitmax.png'),
    bonemax: require('../../assets/maxxThumbs/cut/bonemax.png'),
};
function nativeThumbCut(item: MarketplaceItem): any | null {
    if (!item.native) return null;
    return NATIVE_THUMBS_CUT[String(item.id || '').toLowerCase()] || null;
}

type Tab = 'mine' | 'all' | 'native' | 'creator';

/** A max the user has onboarded (derived from an active UserSchedule). */
type MyMax = {
    maxxId: string;
    label: string;
    todayCount: number;
    todayDone: number;
    scheduleId: string;
    wanted: string[];
    avoided: string[];
    /** v2 offered set, built from THIS schedule's real distinct catalog ids.
     *  Lazily fetched when the tune sheet opens (see openTune). */
    offered?: OfferedHabit[];
};

export default function MarketplaceScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { width } = useWindowDimensions();
    const [maxxes, setMaxxes] = useState<MarketplaceItem[]>([]);
    const [courses, setCourses] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('all');
    const [myMaxxes, setMyMaxxes] = useState<MyMax[]>([]);
    const [tuning, setTuning] = useState<MyMax | null>(null);
    const [savingTune, setSavingTune] = useState(false);
    // The user's latest creator application, if any — drives the "applied" state.
    const [myApp, setMyApp] = useState<{ status: string; max_name: string } | null>(null);
    const queryClient = useQueryClient();

    // Load the caller's creator application once (best-effort) so the Creator tab
    // can show "under review" instead of the apply button after they've applied.
    const loadMyApp = useCallback(async () => {
        try {
            const res = await api.getMyCreatorApplication();
            setMyApp(res.application ? { status: res.application.status, max_name: res.application.max_name } : null);
        } catch {
            // best-effort; leave prior value
        }
    }, []);

    useEffect(() => { void loadMyApp(); }, [loadMyApp]);

    // Open the tune sheet for a max. We fetch the live offered set (the real
    // distinct catalog tasks on THIS schedule) so the chips are 1:1 with the
    // plan — same dynamic source as the onboarding picker (SC3/SC4). The sheet
    // opens immediately on the cached prefs, then patches in offered + the
    // server's current wanted/avoided when the fetch resolves.
    const openTune = useCallback(async (mx: MyMax) => {
        setTuning(mx);
        if (!mx.scheduleId) return;
        try {
            const opts = await api.getHabitOptions(mx.scheduleId);
            setTuning((cur) => (cur && cur.scheduleId === mx.scheduleId
                ? { ...cur, offered: opts.offered, wanted: opts.wanted ?? cur.wanted, avoided: opts.avoided ?? cur.avoided }
                : cur));
        } catch {
            // best-effort: keep the sheet open on the cached prefs (ChatHabitPicker
            // falls back to the static catalog when offered is absent).
        }
    }, []);

    // SC4 — re-submit tuned habit prefs for an already-onboarded max, then regenerate.
    const applyTune = useCallback(async (mx: MyMax, wanted: string[], avoided: string[]) => {
        if (!mx.scheduleId) { setTuning(null); return; }
        setSavingTune(true);
        try {
            await api.updateHabitPrefs(mx.scheduleId, wanted, avoided);
            await queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull });
            await loadMine();
        } catch {
            // best-effort
        } finally {
            setSavingTune(false);
            setTuning(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient]);

    const searchAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef<TextInput>(null);

    const load = useCallback(async (opts?: { isRetry?: boolean }) => {
        try {
            setError(null);
            // Seed from cache instantly so the screen is never blank on revisit.
            if (!opts?.isRetry) {
                const cached = await readCache();
                if (cached) {
                    setMaxxes(cached.maxxes || []);
                    setCourses(cached.courses || []);
                    registerCreatorMeta(cached.courses);
                    setLoading(false);
                }
            }
            const data = await api.getMarketplace();
            setMaxxes(data.maxxes || []);
            setCourses(data.courses || []);
            registerCreatorMeta(data.courses);
            void writeCache(data);
        } catch (e: any) {
            const status = e?.response?.status;
            const isNetwork = !e?.response;
            // 502 = Render proxy returning "service unavailable" during cold boot.
            const isColdStart = status === 502 || status === 503 || status === 504;

            if (isColdStart && !opts?.isRetry) {
                // Auto-retry once after 4 s — Render typically finishes booting by then.
                setTimeout(() => void load({ isRetry: true }), 4000);
                return;
            }

            // If we already have cached data, silently swallow the error — the
            // user already sees content; no need to replace it with an error card.
            const hasCachedContent = maxxes.length > 0 || courses.length > 0;
            if (hasCachedContent) {
                setRefreshing(false);
                setLoading(false);
                return;
            }

            const msg = isNetwork
                ? "Can't reach the server — check your connection and pull to retry."
                : isColdStart
                    ? 'Server is starting up. Pull to retry in a moment.'
                    : status === 401
                        ? 'Your session expired. Sign in again.'
                        : 'Could not load Explore. Pull to retry.';
            setError(msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [maxxes.length, courses.length]);

    useEffect(() => { void load(); }, [load]);

    // SC5 — "My Maxxes": the maxes the user has onboarded (active UserSchedules),
    // with today's task progress per max. Refetched on focus so a freshly-onboarded
    // max appears here.
    const loadMine = useCallback(async () => {
        try {
            const full = await api.getActiveSchedulesFull();
            const today = full?.today_date;
            const out: MyMax[] = [];
            for (const s of (full?.schedules || [])) {
                const mid = String(s?.maxx_id || '').toLowerCase();
                if (!mid) continue;
                const days = s?.days || [];
                const todayDay = today ? days.find((d: any) => d?.date === today) : days[0];
                const tasks = (todayDay?.tasks || []) as any[];
                const done = tasks.filter((t) => t?.status === 'completed').length;
                const ctx = s?.schedule_context || {};
                out.push({
                    maxxId: mid,
                    label: maxMeta(mid).label,
                    todayCount: tasks.length,
                    todayDone: done,
                    scheduleId: String(s?.id || ''),
                    wanted: Array.isArray(ctx.wanted_catalog_ids) ? ctx.wanted_catalog_ids.map(String) : [],
                    avoided: Array.isArray(ctx.avoided_catalog_ids) ? ctx.avoided_catalog_ids.map(String) : [],
                });
            }
            setMyMaxxes(out);
        } catch {
            // best-effort; leave prior value
        }
    }, []);

    useEffect(() => { void loadMine(); }, [loadMine]);

    // Deep links / You > Purchases pass itemId — open that page.
    useEffect(() => {
        const itemId = route.params?.itemId;
        if (!itemId || loading) return;
        const item = [...maxxes, ...courses].find((i) => i.id === itemId);
        if (item) {
            navigation.setParams({ itemId: undefined });
            navigation.push('MaxDetail', { item });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.itemId, loading]);

    // Refetch entitlements on return (a completed purchase shows entered).
    useEffect(() => {
        const unsub = navigation.addListener?.('focus', () => {
            // load() also refreshes the creator cards' entered/Subscribed state
            // after a subscribe round-trip (they ride the marketplace payload).
            if (!loading) void load();
            void loadMine();
            void loadMyApp();
        });
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigation, loading]);

    const toggleSearch = () => {
        const opening = !searchOpen;
        setSearchOpen(opening);
        if (!opening) setQuery('');
        Animated.timing(searchAnim, {
            toValue: opening ? 1 : 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
        if (opening) setTimeout(() => inputRef.current?.focus(), 120);
    };

    const q = query.trim().toLowerCase();
    const matches = useCallback(
        (it: MarketplaceItem) =>
            !q ||
            [it.title, it.tagline, it.category, it.creator?.name, it.creator?.handle]
                .some((s) => String(s || '').toLowerCase().includes(q)),
        [q],
    );
    const fMaxxes = useMemo(() => maxxes.filter(matches), [maxxes, matches]);
    const fCourses = useMemo(() => courses.filter(matches), [courses, matches]);

    // Creator maxxes ride the marketplace payload (courses[] with
    // creator_maxx=true) — they render as first-class cards on the Creator tab
    // AND appended to All. Legacy seed "courses" stay excluded from All —
    // natives only, exactly as before.
    const creatorCards = useMemo(() => fCourses.filter(isCreatorMaxx), [fCourses]);
    const hasCreatorCards = useMemo(() => courses.some(isCreatorMaxx), [courses]);
    const baseCombined = useMemo<MarketplaceItem[]>(() => {
        if (tab === 'mine') return [];
        if (tab === 'creator') return creatorCards;
        if (tab === 'native') return fMaxxes;
        return [...fMaxxes, ...creatorCards];
    }, [tab, fMaxxes, creatorCards]);
    // Quietly float the maxes that match the user's goals to the top — reorder
    // only, never hide. Off / no-goals → original order (cold-start identical).
    const personalizedUI = useFlag('personalizedUI');
    const { goalIds } = usePersonalization();
    const combined = useMemo<MarketplaceItem[]>(
        () =>
            personalizedUI && goalIds.length
                ? rankByGoals(baseCombined, goalIds, (it) => it.id)
                : baseCombined,
        [personalizedUI, goalIds, baseCombined],
    );
    const suggested = useMemo(() => combined.slice(0, 5), [combined]);
    // Creator tab with NO live creators keeps the "coming soon" block as its
    // genuine empty state (below) — the search empty-message only applies once
    // creator cards actually exist.
    const emptyMsg =
        tab !== 'mine' && combined.length === 0 && !(tab === 'creator' && !hasCreatorCards)
            ? (q ? `No matches for “${query.trim()}”.` : 'Nothing here yet.')
            : null;

    const open = (item: MarketplaceItem) => navigation.push('MaxDetail', { item });

    const featureW = Math.min(320, width - GUTTER * 2 - 36);
    const gridW = (width - GUTTER * 2 - 14) / 2;
    const gridLabel = tab === 'native' ? 'All maxes' : tab === 'creator' ? 'Creators' : 'All';

    // Search slides from a 42px circle (right) to the full content width,
    // fading the title out underneath it.
    const fullW = width - GUTTER * 2;
    const searchWidth = searchAnim.interpolate({ inputRange: [0, 1], outputRange: [42, fullW] });
    const titleOpacity = searchAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
    const inputOpacity = searchAnim.interpolate({ inputRange: [0.45, 1], outputRange: [0, 1], extrapolate: 'clamp' });

    if (loading) {
        return (
            <View style={styles.root}>
                <View style={[styles.center, { paddingTop: insets.top }]}>
                    <ActivityIndicator color={INK} />
                    <Text style={styles.loadingText}>Loading Explore</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ScrollView
                contentContainerStyle={{ paddingTop: insets.top + 22, paddingBottom: insets.bottom + 96 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
            >
                {/* Title + sliding search */}
                <View style={styles.head}>
                    <Animated.Text style={[styles.h1, { opacity: titleOpacity }]} numberOfLines={1}>
                        Find your <Text style={styles.h1i}>max</Text>
                    </Animated.Text>

                    <Animated.View style={[styles.searchWrap, { width: searchWidth }]}>
                        <TouchableOpacity
                            onPress={searchOpen ? undefined : toggleSearch}
                            disabled={searchOpen}
                            activeOpacity={0.7}
                            style={styles.searchIcon}
                            accessibilityRole="button"
                            accessibilityLabel="Search"
                        >
                            <Ionicons name="search" size={18} color={searchOpen ? MUTE : INK} />
                        </TouchableOpacity>
                        <Animated.View style={{ flex: 1, opacity: inputOpacity }}>
                            <TextInput
                                ref={inputRef}
                                style={styles.searchInput}
                                value={query}
                                onChangeText={setQuery}
                                editable={searchOpen}
                                placeholder="Search maxes & creators"
                                placeholderTextColor={MUTE}
                                returnKeyType="search"
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                        </Animated.View>
                        {searchOpen ? (
                            <TouchableOpacity onPress={toggleSearch} style={styles.searchClose} hitSlop={10} accessibilityLabel="Close search">
                                <Ionicons name="close" size={18} color={MUTE} />
                            </TouchableOpacity>
                        ) : null}
                    </Animated.View>
                </View>

                {/* Pill tabs — All / Native / Creator */}
                <View style={[styles.gutter, styles.tabs]}>
                    {([['mine', 'Active'], ['all', 'All'], ['native', 'Native'], ['creator', 'Creator']] as const).map(([key, label]) => {
                        const on = tab === key;
                        return (
                            <TouchableOpacity
                                key={key}
                                style={[styles.tab, on && styles.tabOn]}
                                onPress={() => setTab(key)}
                                activeOpacity={0.8}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: on }}
                            >
                                <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {error ? (
                    <View style={styles.gutter}>
                        <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>
                    </View>
                ) : null}

                {/* My Maxxes — the user's onboarded/active maxes (SC5). */}
                {tab === 'mine' ? (
                    myMaxxes.length > 0 ? (
                        <View style={[styles.gutter, { marginTop: 18, gap: 12 }]}>
                            {myMaxxes.map((m) => (
                                <MyMaxCard
                                    key={m.maxxId}
                                    mx={m}
                                    onPress={() => navigation.navigate('MaxxDetail', { maxxId: m.maxxId })}
                                    onTune={() => void openTune(m)}
                                />
                            ))}
                        </View>
                    ) : (
                        <View style={[styles.gutter, styles.comingSoon]}>
                            <View style={styles.creatorIconWrap}>
                                <LaughCryIcon size={88} />
                            </View>
                            <Text style={styles.comingSoonTitle}>No maxes yet</Text>
                            <Text style={styles.comingSoonSub}>
                                Start a max from All and it&apos;ll show up here with today&apos;s tasks.
                            </Text>
                        </View>
                    )
                ) : null}

                {/* Creator tab — creator maxxes render in the shared poster grid
                    below (from the marketplace payload). When none are live yet,
                    the "coming soon" block is the genuine empty state. */}
                {tab === 'creator' && !hasCreatorCards ? (
                    <View style={[styles.gutter, styles.comingSoon]}>
                        <View style={styles.creatorIconWrap}>
                            <CreatorMorphIcon size={92} />
                        </View>
                        <Text style={styles.comingSoonTitle}>Creators coming soon</Text>
                        <Text style={styles.comingSoonSub}>
                            We&apos;re lining up creator courses. Check back shortly.
                        </Text>

                        {myApp ? (
                            <View style={styles.appliedPill}>
                                <Ionicons name="checkmark-circle" size={16} color={INK} />
                                <Text style={styles.appliedText}>
                                    {myApp.status === 'approved'
                                        ? `“${myApp.max_name}” approved — we'll be in touch`
                                        : myApp.status === 'rejected'
                                            ? 'Application reviewed — check your email'
                                            : `“${myApp.max_name}” is under review`}
                                </Text>
                            </View>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={styles.applyBtnWrap}
                                    onPress={() => navigation.navigate('CreatorApply')}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel="Apply to host your own max"
                                >
                                    <LiquidGlass radius={25} contentStyle={styles.applyBtnContent}>
                                        <Text style={styles.applyBtnText}>Host your own max</Text>
                                        <Ionicons name="arrow-forward" size={17} color={INK} />
                                    </LiquidGlass>
                                </TouchableOpacity>
                                <Text style={styles.applyHint}>
                                    First come, first served.
                                </Text>
                            </>
                        )}
                    </View>
                ) : null}

                {emptyMsg ? (
                    <View style={[styles.gutter, { marginTop: 40 }]}>
                        <Text style={styles.noResults}>{emptyMsg}</Text>
                    </View>
                ) : null}

                {/* New — horizontal carousel (only on the All tab) */}
                {tab === 'all' && suggested.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, styles.gutter]}>
                            <Text style={styles.sectionLabel}>New</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
                            decelerationRate="fast"
                            snapToInterval={featureW + 14}
                            snapToAlignment="start"
                        >
                            {suggested.map((it) => (
                                <FeatureCard key={it.id} item={it} width={featureW} onPress={() => open(it)} />
                            ))}
                        </ScrollView>
                    </>
                ) : null}

                {/* All — 2-column poster grid */}
                {combined.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, styles.gutter, { marginTop: 34 }]}>
                            <Text style={styles.sectionLabel}>{gridLabel}</Text>
                        </View>
                        <View style={[styles.gutter, styles.grid]}>
                            {combined.map((it) => (
                                <GridCard key={it.id} item={it} width={gridW} onPress={() => open(it)} />
                            ))}
                        </View>
                    </>
                ) : null}

                {/* Creator tab keeps "Host your own max" below the grid. */}
                {tab === 'creator' && hasCreatorCards ? (
                    <View style={[styles.gutter, styles.creatorListApply]}>
                        {myApp ? (
                            <View style={styles.appliedPill}>
                                <Ionicons name="checkmark-circle" size={16} color={INK} />
                                <Text style={styles.appliedText}>
                                    {myApp.status === 'approved'
                                        ? `“${myApp.max_name}” approved — we'll be in touch`
                                        : myApp.status === 'rejected'
                                            ? 'Application reviewed — check your email'
                                            : `“${myApp.max_name}” is under review`}
                                </Text>
                            </View>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={styles.applyBtnWrap}
                                    onPress={() => navigation.navigate('CreatorApply')}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel="Apply to host your own max"
                                >
                                    <LiquidGlass radius={25} contentStyle={styles.applyBtnContent}>
                                        <Text style={styles.applyBtnText}>Host your own max</Text>
                                        <Ionicons name="arrow-forward" size={17} color={INK} />
                                    </LiquidGlass>
                                </TouchableOpacity>
                                <Text style={styles.applyHint}>
                                    First come, first served.
                                </Text>
                            </>
                        )}
                    </View>
                ) : null}
            </ScrollView>

            {/* SC4 — Tune habits sheet for an onboarded max, pre-filled with current prefs. */}
            <Modal visible={!!tuning} transparent animationType="slide" onRequestClose={() => setTuning(null)}>
                <View style={styles.tuneBackdrop}>
                    <View style={[styles.tuneSheet, { paddingBottom: insets.bottom + 16 }]}>
                        <View style={styles.tuneGrabber} />
                        {tuning ? (
                          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <ChatHabitPicker
                                key={tuning.offered ? 'live' : 'pending'}
                                spec={{ type: 'habit_picker', version: 2, maxx_id: tuning.maxxId, schedule_id: tuning.scheduleId, label: `Tune your ${tuning.label} plan`, offered: tuning.offered }}
                                initialWanted={tuning.wanted}
                                initialAvoided={tuning.avoided}
                                submitLabel={savingTune ? 'Saving…' : 'Save changes'}
                                disabled={savingTune}
                                onSubmit={(w, a) => applyTune(tuning, w, a)}
                                onSkip={() => setTuning(null)}
                            />
                          </ScrollView>
                        ) : null}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

/** My Maxxes row card — onboarded max with today's progress + a Tune entry (SC5/SC4). */
function MyMaxCard({ mx, onPress, onTune }: { mx: MyMax; onPress: () => void; onTune: () => void }) {
    const meta = maxMeta(mx.maxxId);
    const thumb = NATIVE_THUMBS[mx.maxxId] || null;
    const allDone = mx.todayCount > 0 && mx.todayDone >= mx.todayCount;
    const progress = mx.todayCount === 0
        ? 'No tasks today'
        : allDone ? 'All done today ✓' : `${mx.todayDone} of ${mx.todayCount} today`;
    return (
        <TouchableOpacity
            style={styles.myCard}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${meta.label}, ${progress}`}
            testID={`mymax-${mx.maxxId}`}
        >
            <View style={[styles.myThumb, { backgroundColor: thumb ? THUMB_BG : meta.color + '22' }]}>
                {thumb ? (
                    <Image source={thumb} style={styles.myThumbImg} contentFit="cover" />
                ) : (
                    <Ionicons name={meta.icon as any} size={24} color={meta.color} />
                )}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.myTitle} numberOfLines={1}>{meta.label}</Text>
                <Text style={styles.mySub} numberOfLines={1}>{progress}</Text>
            </View>
            <TouchableOpacity
                onPress={onTune}
                style={styles.tuneBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Tune ${meta.label} habits`}
                testID={`mymax-tune-${mx.maxxId}`}
            >
                <Ionicons name="options-outline" size={16} color={INK} />
                <Text style={styles.tuneText}>Tune</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );
}

/** Cover image + dark scrim + serif title — the shared poster look. Cards with
 *  no art get an accent-tinted field with a large serif monogram instead of a
 *  bare color slab (the scrim + title + @handle overlay still sit on top). */
function PosterContent({ item }: { item: MarketplaceItem }) {
    const base = item.color || GOLD;
    const isCreator = !item.native;
    const cover = item.image_url ? api.resolveAttachmentUrl(item.image_url) : undefined;
    return (
        <>
            {cover ? (
                <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.monogramField, { backgroundColor: hexA(base, 0.16) }]}>
                    <Text style={[styles.monogramGlyph, { color: base }]}>
                        {((item.title || '?').trim().charAt(0) || '?').toUpperCase()}
                    </Text>
                </View>
            )}
            <LinearGradient
                colors={['rgba(20,18,23,0)', 'rgba(20,18,23,0.35)', 'rgba(20,18,23,0.88)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            {isCreator ? (
                <View style={styles.creatorTag}>
                    <Text style={styles.creatorTagText}>@{item.creator.handle}</Text>
                </View>
            ) : null}
        </>
    );
}

/** "Subscribed" mini-pill — replaces the price on entered creator-maxx cards. */
function SubscribedPill() {
    return (
        <View style={styles.subscribedPill}>
            <Ionicons name="checkmark-circle" size={12} color={CREAM} />
            <Text style={styles.subscribedPillText}>Subscribed</Text>
        </View>
    );
}

/** Large carousel poster. */
function FeatureCard({ item, width, onPress }: { item: MarketplaceItem; width: number; onPress: () => void }) {
    const thumb = nativeThumb(item);
    if (thumb) {
        return (
            <TouchableOpacity style={[styles.featureNative, { width }]} activeOpacity={0.85} onPress={onPress} testID={`explore-card-${item.id}`}>
                <LinearGradient
                    colors={['#D8D9DB', '#E1E1E3', '#ECECEE']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
                <Image source={nativeThumbCut(item) || thumb} style={styles.featureNativeImg} contentFit="contain" transition={200} />
                <View style={styles.featureNativeBody}>
                    <Text style={styles.nativeTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.nativeSub} numberOfLines={2}>{item.tagline}</Text>
                    <View style={styles.nativePricePill}><Text style={styles.nativePricePillText}>{item.price_label}</Text></View>
                </View>
            </TouchableOpacity>
        );
    }
    return (
        <TouchableOpacity style={[styles.feature, { width }]} activeOpacity={0.85} onPress={onPress} testID={`explore-card-${item.id}`}>
            <PosterContent item={item} />
            <View style={styles.featureBody}>
                <Text style={styles.featureTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.featureSub} numberOfLines={2}>{item.tagline}</Text>
                {item.entered && isCreatorMaxx(item) ? (
                    <View style={{ marginTop: 12 }}><SubscribedPill /></View>
                ) : (
                    <View style={styles.pricePill}><Text style={styles.pricePillText}>{item.price_label}</Text></View>
                )}
            </View>
        </TouchableOpacity>
    );
}

/** Small 2-column poster. */
function GridCard({ item, width, onPress }: { item: MarketplaceItem; width: number; onPress: () => void }) {
    const thumb = nativeThumb(item);
    if (thumb) {
        return (
            <TouchableOpacity style={[styles.gridCardNative, { width }]} activeOpacity={0.85} onPress={onPress} testID={`explore-card-${item.id}`}>
                <Image source={thumb} style={styles.gridNativeImg} contentFit="cover" transition={200} />
                <View style={styles.gridNativeBody}>
                    <Text style={styles.gridNativeTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.gridNativeSub} numberOfLines={1}>{item.price_label}</Text>
                </View>
            </TouchableOpacity>
        );
    }
    return (
        <TouchableOpacity style={[styles.gridCard, { width }]} activeOpacity={0.85} onPress={onPress} testID={`explore-card-${item.id}`}>
            <PosterContent item={item} />
            <View style={styles.gridBody}>
                <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
                {item.entered && isCreatorMaxx(item) ? (
                    <View style={{ marginTop: 6 }}><SubscribedPill /></View>
                ) : (
                    <Text style={styles.gridSub} numberOfLines={1}>{item.price_label}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE },

    gutter: { paddingHorizontal: GUTTER },
    head: { paddingHorizontal: GUTTER, minHeight: 46, justifyContent: 'center' },
    h1: { fontFamily: SERIF, fontSize: 40, color: INK, letterSpacing: -1, lineHeight: 44, paddingRight: 52 },
    h1i: { fontFamily: SERIF_I, color: INK },

    // Sliding search (collapsed = 42px circle on the right; open = full width)
    searchWrap: {
        position: 'absolute', right: GUTTER, height: 42, borderRadius: 21,
        backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
        flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    },
    searchIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    searchInput: { fontFamily: 'Matter-Regular', fontSize: 15, color: INK, paddingVertical: 0, paddingRight: 8 },
    searchClose: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },

    // Pill tabs
    tabs: { flexDirection: 'row', gap: 8, marginTop: 20 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: 'transparent' },
    tabOn: { backgroundColor: INK },
    tabLabel: { fontFamily: 'Matter-Medium', fontSize: 14.5, color: MUTE, letterSpacing: 0.2 },
    tabLabelOn: { fontFamily: 'Matter-SemiBold', color: ON_INK },

    noResults: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE },

    // Creator "coming soon" placeholder
    comingSoon: { marginTop: 64, alignItems: 'center' },
    comingSoonIcon: {
        width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
        backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, marginBottom: 18,
    },
    // Creator icon: the morphing jelly glyph floats on its own — no circle.
    creatorIconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    comingSoonTitle: { fontFamily: SERIF, fontSize: 26, color: INK, letterSpacing: -0.4 },
    comingSoonSub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, marginTop: 8, textAlign: 'center', lineHeight: 21, maxWidth: 280 },

    // "Host your own max" call-to-apply
    applyBtnWrap: { marginTop: 28, alignSelf: 'center' },
    applyBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, height: 50 },
    applyBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: INK, letterSpacing: 0.2 },
    applyHint: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 14, textAlign: 'center', lineHeight: 18, maxWidth: 270 },
    appliedPill: {
        flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 28,
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
        backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    appliedText: { fontFamily: 'Matter-Medium', fontSize: 13, color: INK, maxWidth: 250 },

    // My Maxxes cards
    myCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: CARD, borderRadius: 18, padding: 12,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    myThumb: { width: 56, height: 56, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    myThumbImg: { width: '100%', height: '100%' },
    myTitle: { fontFamily: SERIF, fontSize: 19, color: INK, letterSpacing: -0.3 },
    mySub: { fontFamily: 'Matter-Regular', fontSize: 13, color: SUB, marginTop: 3 },
    tuneBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: CREAM,
    },
    tuneText: { fontFamily: 'Matter-SemiBold', fontSize: 12.5, color: INK },
    tuneBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    tuneSheet: { backgroundColor: CREAM, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, maxHeight: '88%' },
    tuneGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)', marginBottom: 8 },

    errorCard: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
    errorText: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#B23A3A' },

    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 14 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 18, color: INK, letterSpacing: -0.2 },

    // Creator handle tag (top-left on a poster)
    creatorTag: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    creatorTagText: { fontFamily: 'Matter-Medium', fontSize: 11.5, color: '#FFFFFF', letterSpacing: 0.2 },

    // Feature carousel poster
    feature: { height: 220, borderRadius: 20, overflow: 'hidden', backgroundColor: INK },
    featureBody: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18 },
    featureTitle: { fontFamily: SERIF, fontSize: 26, color: '#FFFFFF', letterSpacing: -0.4 },
    featureSub: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: 'rgba(255,255,255,0.82)', lineHeight: 19, marginTop: 4 },
    pricePill: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
    pricePillText: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: INK, letterSpacing: 0.2 },

    // Grid poster
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    gridCard: { height: 168, borderRadius: 16, overflow: 'hidden', backgroundColor: INK },
    gridBody: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 13 },
    gridTitle: { fontFamily: SERIF, fontSize: 18, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 22 },
    gridSub: { fontFamily: 'Matter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

    // Native max card — figure on its own surface, text BELOW it (no overlay).
    // "New" carousel = figure left + text right; grid = figure top + text below.
    featureNative: {
        height: 200, borderRadius: 22, overflow: 'hidden', backgroundColor: THUMB_BG,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
        flexDirection: 'row', alignItems: 'center',
    },
    featureNativeImg: { width: '50%', height: '100%', backgroundColor: 'transparent', transform: [{ scale: 1.12 }] },
    featureNativeBody: { flex: 1, paddingRight: 20, paddingLeft: 4, justifyContent: 'center' },
    gridCardNative: {
        height: 208, borderRadius: 18, overflow: 'hidden', backgroundColor: THUMB_BG,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    gridNativeImg: { width: '100%', height: 148, backgroundColor: THUMB_BG },
    gridNativeBody: { flex: 1, paddingHorizontal: 14, paddingTop: 9 },
    gridNativeTitle: { fontFamily: SERIF, fontSize: 19, color: INK, letterSpacing: -0.3 },
    gridNativeSub: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: SUB, marginTop: 2 },
    nativeTitle: { fontFamily: SERIF, fontSize: 23, color: INK, letterSpacing: -0.4 },
    nativeSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: SUB, marginTop: 2 },
    nativePricePill: {
        alignSelf: 'flex-start', marginTop: 8, backgroundColor: INK,
        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
    },
    nativePricePillText: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: ON_INK, letterSpacing: 0.2 },

    creatorListApply: { alignItems: 'center', marginTop: 16 },

    // Art-less poster fallback: accent-tinted field + large serif monogram.
    monogramField: { alignItems: 'center', justifyContent: 'center' },
    monogramGlyph: { fontFamily: SERIF, fontSize: 64, letterSpacing: -1, marginBottom: 18 },

    // "Subscribed" mini-pill (entered creator maxxes) — ink pill, cream text.
    subscribedPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
        backgroundColor: '#111113', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)',
    },
    subscribedPillText: { fontFamily: 'Matter-SemiBold', fontSize: 11.5, color: CREAM, letterSpacing: 0.2 },
});

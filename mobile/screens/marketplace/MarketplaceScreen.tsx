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
    useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import api, { type MarketplaceItem } from '../../services/api';

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

type Tab = 'all' | 'native' | 'creator';

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

    const searchAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef<TextInput>(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getMarketplace();
            setMaxxes(data.maxxes || []);
            setCourses(data.courses || []);
        } catch (e: any) {
            // Surface WHY it failed so the user knows whether to wait, check
            // their connection, or retry — instead of one opaque message.
            const status = e?.response?.status;
            const isNetwork = !e?.response;
            const msg = isNetwork
                ? "Can't reach the server — check your connection and pull to retry."
                : status === 503 || status === 504
                    ? 'Server is waking up. Give it a moment and pull to retry.'
                    : status === 401
                        ? 'Your session expired. Sign in again.'
                        : 'Could not load Explore. Pull to retry.';
            setError(msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

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
        const unsub = navigation.addListener?.('focus', () => { if (!loading) void load(); });
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

    const combined = useMemo<MarketplaceItem[]>(
        () => (tab === 'native' ? fMaxxes : tab === 'creator' ? fCourses : [...fMaxxes, ...fCourses]),
        [tab, fMaxxes, fCourses],
    );
    const suggested = useMemo(() => combined.slice(0, 5), [combined]);
    const emptyMsg = combined.length === 0
        ? (q ? `No matches for “${query.trim()}”.` : 'Nothing here yet.')
        : null;

    const open = (item: MarketplaceItem) => navigation.push('MaxDetail', { item });

    const featureW = Math.min(320, width - GUTTER * 2 - 36);
    const gridW = (width - GUTTER * 2 - 14) / 2;
    const gridLabel = tab === 'native' ? 'All maxes' : tab === 'creator' ? 'All courses' : 'All';

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
                    {([['all', 'All'], ['native', 'Native'], ['creator', 'Creator']] as const).map(([key, label]) => {
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
            </ScrollView>
        </View>
    );
}

/** Cover image + dark scrim + serif title — the shared poster look. */
function PosterContent({ item }: { item: MarketplaceItem }) {
    const base = item.color || GOLD;
    const isCreator = !item.native;
    return (
        <>
            {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
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

/** Large carousel poster. */
function FeatureCard({ item, width, onPress }: { item: MarketplaceItem; width: number; onPress: () => void }) {
    return (
        <TouchableOpacity style={[styles.feature, { width }]} activeOpacity={0.85} onPress={onPress}>
            <PosterContent item={item} />
            <View style={styles.featureBody}>
                <Text style={styles.featureTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.featureSub} numberOfLines={2}>{item.tagline}</Text>
                <View style={styles.pricePill}><Text style={styles.pricePillText}>{item.price_label}</Text></View>
            </View>
        </TouchableOpacity>
    );
}

/** Small 2-column poster. */
function GridCard({ item, width, onPress }: { item: MarketplaceItem; width: number; onPress: () => void }) {
    return (
        <TouchableOpacity style={[styles.gridCard, { width }]} activeOpacity={0.85} onPress={onPress}>
            <PosterContent item={item} />
            <View style={styles.gridBody}>
                <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.gridSub} numberOfLines={1}>{item.price_label}</Text>
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
});

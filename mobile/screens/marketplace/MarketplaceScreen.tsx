/**
 * MarketplaceScreen (Explore) — browse + enter native maxes ($3.99/wk each) and
 * creator courses. Media-forward + editorial (Apple / craft.do register): cover
 * imagery, Fraunces serif names, a calm cream page, the max's colour as a
 * whisper. A minimalist search filters everything. Native maxes and creator
 * maxes share ONE square tile size; creator tiles carry the creator's avatar in
 * a circle. Tapping anything opens MaxDetail.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import api, { type MarketplaceItem } from '../../services/api';
import SearchBar from '../../components/ui/SearchBar';

const INK = '#1C1A17';
const MUTE = '#97928A';
const SUB = '#5C574E';
const CREAM = '#F7F0EA';
const CARD = '#FCFAF6';
const BORDER = '#E8E0D3';
const GOLD = '#2C6BED';
const SERIF = 'Fraunces';
const SERIF_I = 'Fraunces-Italic';
const GUTTER = 22;

function fmtK(n?: number): string {
    if (!n) return '';
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}

export default function MarketplaceScreen() {
    const insets = useSafeAreaInsets();
    const { width: winW } = useWindowDimensions();
    const tileW = Math.floor((winW - GUTTER * 2 - 14) / 2); // 2-col; 14 between cols
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const [maxxes, setMaxxes] = useState<MarketplaceItem[]>([]);
    const [courses, setCourses] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getMarketplace();
            setMaxxes(data.maxxes || []);
            setCourses(data.courses || []);
        } catch (e: any) {
            setError('Could not load Explore. Pull to retry.');
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
    const noResults = !!q && fMaxxes.length === 0 && fCourses.length === 0;

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
                <View style={styles.head}>
                    <Text style={styles.h1}>Find your <Text style={styles.h1i}>max</Text></Text>
                    <Text style={styles.h1sub}>Pick what you're working on. Max fits it into your real week.</Text>
                </View>

                {/* Minimalist search */}
                <View style={[styles.gutter, { marginTop: 18 }]}>
                    <SearchBar
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search maxes & creators"
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                </View>

                {error ? (
                    <View style={styles.gutter}>
                        <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>
                    </View>
                ) : null}

                {noResults ? (
                    <View style={[styles.gutter, { marginTop: 40 }]}>
                        <Text style={styles.noResults}>No matches for “{query.trim()}”.</Text>
                    </View>
                ) : null}

                {fMaxxes.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, styles.gutter]}>
                            <Text style={styles.sectionLabel}>Maxes</Text>
                            <Text style={styles.sectionNote}>$3.99 / week each</Text>
                        </View>
                        <View style={[styles.grid, styles.gutter]}>
                            {fMaxxes.map((m) => (
                                <MaxTile key={m.id} item={m} width={tileW} onPress={() => navigation.push('MaxDetail', { item: m })} />
                            ))}
                        </View>
                    </>
                ) : null}

                {fCourses.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, styles.gutter, { marginTop: 40 }]}>
                            <Text style={styles.sectionLabel}>Creator courses</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
                        >
                            {fCourses.map((c) => (
                                <MaxTile key={c.id} item={c} width={tileW} creator onPress={() => navigation.push('MaxDetail', { item: c })} />
                            ))}
                        </ScrollView>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

/**
 * One square tile, shared by native maxes (grid) and creator maxes (carousel)
 * so both read at the SAME size. Photography leads; a thin colour cap is the
 * per-max signature; the serif name + a meta line sit over a soft scrim.
 * Creator tiles add the creator's avatar in a circle (their IG/TikTok pic).
 */
function MaxTile({
    item, width, onPress, creator,
}: {
    item: MarketplaceItem;
    width: number;
    onPress: () => void;
    creator?: boolean;
}) {
    const base = item.color || GOLD;
    const meta = creator
        ? `@${item.creator.handle}${item.creator.verified ? ' ✓' : ''}${item.rating ? `   ★ ${item.rating.toFixed(1)}` : ''}`
        : (item.participants ? `${fmtK(item.participants)} members` : item.tagline);
    const avatar = item.creator?.avatar;
    return (
        <TouchableOpacity style={{ width }} activeOpacity={0.9} onPress={onPress}>
            <View style={[styles.tileImg, { height: width }]}>
                {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={240} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
                )}
                <View style={[styles.tileRule, { backgroundColor: base }]} />
                <LinearGradient
                    colors={['transparent', 'rgba(20,17,14,0.04)', 'rgba(20,17,14,0.78)']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                />

                {creator ? (
                    <View style={styles.avatarRing}>
                        {avatar ? (
                            <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                        ) : (
                            <View style={[StyleSheet.absoluteFill, styles.avatarFallback, { backgroundColor: base }]}>
                                <Text style={styles.avatarInitial}>{(item.creator?.name || '?').charAt(0).toUpperCase()}</Text>
                            </View>
                        )}
                    </View>
                ) : null}

                {item.entered ? (
                    <View style={[styles.tileChip, { backgroundColor: base }]}>
                        <Text style={styles.tileChipText}>Open</Text>
                    </View>
                ) : null}

                <View style={styles.tileOverlay}>
                    <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.tileSocial} numberOfLines={1}>{meta}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE },

    gutter: { paddingHorizontal: GUTTER },
    head: { paddingHorizontal: GUTTER },
    h1: { fontFamily: SERIF, fontSize: 38, color: INK, letterSpacing: -0.9, lineHeight: 42 },
    h1i: { fontFamily: SERIF_I, color: INK },
    h1sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 21, marginTop: 10, maxWidth: '92%' },

    // Search
    noResults: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE },

    errorCard: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
    errorText: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#B23A3A' },

    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 30, marginBottom: 14 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 13, color: INK },
    sectionNote: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE },

    // Shared square tile (native grid + creator carousel)
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
    tileImg: { width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#EFE7DC' },
    tileRule: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
    tileOverlay: { position: 'absolute', left: 12, right: 12, bottom: 12 },
    tileTitle: { fontFamily: SERIF, fontSize: 17, color: '#fff', letterSpacing: -0.3 },
    tileSocial: { fontFamily: 'Matter-Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
    tileChip: { position: 'absolute', top: 11, right: 11, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    tileChipText: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: '#fff' },

    // Creator avatar (their IG / TikTok pic) — circle, top-left of the cover
    avatarRing: {
        position: 'absolute', top: 11, left: 11, width: 34, height: 34, borderRadius: 17,
        borderWidth: 2, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#EFE7DC',
        shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontFamily: SERIF, fontSize: 15, color: '#fff' },
});

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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
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
                        <View style={styles.gutter}>
                            {fMaxxes.map((m, i) => (
                                <MaxRow key={m.id} item={m} first={i === 0} onPress={() => navigation.push('MaxDetail', { item: m })} />
                            ))}
                        </View>
                    </>
                ) : null}

                {fCourses.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, styles.gutter, { marginTop: 40 }]}>
                            <Text style={styles.sectionLabel}>Creator courses</Text>
                        </View>
                        <View style={styles.gutter}>
                            {fCourses.map((c, i) => (
                                <MaxRow key={c.id} item={c} creator first={i === 0} onPress={() => navigation.push('MaxDetail', { item: c })} />
                            ))}
                        </View>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

/**
 * One editorial list row, shared by native maxes and creator courses. A crisp
 * framed thumbnail leads (the max's colour fills in when there's no image); the
 * serif name sits over a meta line — member count for a max, the creator's
 * handle for a course; a chevron closes the row.
 */
function MaxRow({
    item, first, onPress, creator,
}: {
    item: MarketplaceItem;
    first?: boolean;
    onPress: () => void;
    creator?: boolean;
}) {
    const base = item.color || GOLD;
    const meta = creator
        ? `@${item.creator.handle}${item.creator.verified ? ' ✓' : ''}${item.rating ? `   ★ ${item.rating.toFixed(1)}` : ''}`
        : (item.participants ? `${fmtK(item.participants)} members` : item.tagline);
    return (
        <TouchableOpacity
            style={[styles.row, !first && styles.rowBorder]}
            activeOpacity={0.6}
            onPress={onPress}
        >
            <View style={styles.thumb}>
                {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
                )}
            </View>
            <View style={styles.rowMid}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{meta}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={MUTE} />
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

    // Editorial list row
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
    thumb: {
        width: 56, height: 56, borderRadius: 3, overflow: 'hidden',
        backgroundColor: '#EFE7DC', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    rowMid: { flex: 1, minWidth: 0 },
    rowTitle: { fontFamily: SERIF, fontSize: 20, color: INK, letterSpacing: -0.3 },
    rowSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 3 },
});

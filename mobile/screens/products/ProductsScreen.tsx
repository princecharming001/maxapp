/**
 * Products tab — what to buy for the programs you run.
 *
 * Backend: GET /products/for-me (api/products.py). Every program's catalog
 * products with the live Amazon price and rating, the user's programs first,
 * items that serve a habit in their current plan on top of each program.
 * Supplements appear only once Suppmax has screened the user.
 *
 * Tapping a product opens it in the Amazon app, or Safari without it
 * (lib/openAmazon) — never an in-app browser, so their account and cart are there.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import api, { ShopProduct, ShopSection } from '../../services/api';
import { maxxThumbCut } from '../../data/maxxThumbs';
import { openAmazonProduct } from '../../lib/openAmazon';
import { track } from '../../lib/analytics';

const INK = '#000000';
const ON_INK = '#FFFFFF';
const MUTE = '#8E8E8E';
const CREAM = '#F1F1EF';
const CARD = '#FFFFFF';
const BORDER = 'rgba(0,0,0,0.06)';
const STAR = '#E3A008';
const SERIF = 'Fraunces';
const SERIF_I = 'Fraunces-Italic';
const GUTTER = 22;
const GAP = 12;
const FOR_YOU = '__for_you';

export const productsQueryKey = ['products', 'for-me'] as const;

const money = (n: number | null) => (n == null ? '' : n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`);

const shortCount = (n: number | null) => {
    if (!n) return '';
    if (n >= 10000) return `${Math.round(n / 1000)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
};

/** "NICETOWN 100% Blackout Curtains" under a NICETOWN brand line → "100% Blackout Curtains". */
export const shortName = (name: string, brand: string) => {
    const b = (brand || '').trim();
    if (!b) return name;
    const first = b.split(/\s+/)[0].replace(/[^\w']/g, '');
    for (const prefix of [b, first]) {
        if (prefix && name.toLowerCase().startsWith(prefix.toLowerCase() + ' ')) {
            const rest = name.slice(prefix.length).trim().replace(/^[-–:,]\s*/, '');
            if (rest.length >= 6) return rest;
        }
    }
    return name;
};

const checkedLabel = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
};

function ProductCard({ p, program, width }: { p: ShopProduct; program: string; width: number }) {
    const [pressed, setPressed] = useState(false);
    const onOpen = async () => {
        Haptics.selectionAsync().catch(() => {});
        const how = await openAmazonProduct(p.asin, p.url);
        track('product_open', { product: p.id, program, how, in_plan: !!p.for_habit });
    };
    return (
        <Pressable
            onPress={onOpen}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            style={[styles.card, { width }, pressed && styles.cardPressed]}
            accessibilityRole="link"
            accessibilityLabel={`${p.brand} ${p.name}, ${money(p.price_usd)}, ${p.rating ?? ''} stars. Opens in Amazon.`}
            testID={`product-${p.id}`}
        >
            <View style={styles.imageWrap}>
                {p.image ? (
                    <ExpoImage source={{ uri: p.image }} style={styles.image} contentFit="contain" transition={150} />
                ) : (
                    <Ionicons name="bag-handle-outline" size={28} color={MUTE} />
                )}
                {p.for_habit ? (
                    <View style={styles.planPill}>
                        <Text style={styles.planPillText} numberOfLines={1}>In your plan</Text>
                    </View>
                ) : null}
            </View>
            <Text style={styles.brand} numberOfLines={1}>{p.brand}</Text>
            <Text style={styles.name} numberOfLines={2}>{shortName(p.name, p.brand)}</Text>
            {p.why ? <Text style={styles.why} numberOfLines={2}>{p.why}</Text> : null}
            {p.rating ? (
                <View style={styles.ratingRow}>
                    <Ionicons name="star" size={11} color={STAR} />
                    <Text style={styles.rating}>{p.rating.toFixed(1)}</Text>
                    {p.rating_count ? <Text style={styles.count}>({shortCount(p.rating_count)})</Text> : null}
                </View>
            ) : null}
            <View style={styles.priceRow}>
                <Text style={styles.price}>{money(p.price_usd)}</Text>
                <Ionicons name="open-outline" size={15} color={INK} />
            </View>
        </Pressable>
    );
}

function Section({ s, width, showHeader, onStart }: {
    s: ShopSection; width: number; showHeader: boolean; onStart: (program: string) => void;
}) {
    const thumb = maxxThumbCut(s.program);
    // Browsing a program you don't run: say so, and offer to start it.
    const startBanner = !showHeader && !s.active && s.products.length > 0;
    return (
        <View style={styles.section}>
            {startBanner ? (
                <Pressable onPress={() => onStart(s.program)} style={styles.startBanner} accessibilityRole="button">
                    {thumb ? <ExpoImage source={thumb} style={styles.startIcon} contentFit="contain" /> : null}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.startTitle}>Not in your stack yet</Text>
                        <Text style={styles.startSub}>Start {s.label} and these get matched to your plan.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={INK} />
                </Pressable>
            ) : null}
            {showHeader ? (
                <View style={styles.sectionHead}>
                    {thumb ? <ExpoImage source={thumb} style={styles.sectionIcon} contentFit="contain" /> : null}
                    <Text style={styles.sectionTitle}>{s.label}</Text>
                    {s.products.length ? <Text style={styles.sectionCount}>{s.products.length}</Text> : null}
                </View>
            ) : null}
            {s.products.length ? (
                <View style={styles.grid}>
                    {s.products.map((p) => <ProductCard key={p.id} p={p} program={s.program} width={width} />)}
                </View>
            ) : (
                <View style={styles.noteCard}>
                    <Text style={styles.noteText}>{s.note || 'Nothing here yet.'}</Text>
                    {s.note ? (
                        <Pressable onPress={() => onStart(s.program)} style={styles.noteBtn} accessibilityRole="button">
                            <Text style={styles.noteBtnText}>Set up {s.label}</Text>
                        </Pressable>
                    ) : null}
                </View>
            )}
        </View>
    );
}

export default function ProductsScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const [filter, setFilter] = useState<string>(FOR_YOU);
    const [refreshing, setRefreshing] = useState(false);
    // 2 columns on a phone, 3-4 on an iPad, cards ~170-240 pt wide.
    const { width: screenW } = useWindowDimensions();
    const cols = Math.max(2, Math.min(4, Math.floor((screenW - GUTTER * 2 + GAP) / 240)));
    const width = (screenW - GUTTER * 2 - GAP * (cols - 1)) / cols;

    const q = useQuery({
        queryKey: productsQueryKey,
        queryFn: () => api.getProductsForMe(),
        staleTime: 5 * 60 * 1000,
    });

    useFocusEffect(useCallback(() => {
        track('products_view');
        // Programs may have changed since (a new program started in chat).
        q.refetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    const sections = q.data?.sections ?? [];
    const mine = sections.filter((s) => s.active);
    const forYou = mine.length ? mine : sections;
    const shown = useMemo(
        () => (filter === FOR_YOU ? forYou : sections.filter((s) => s.program === filter)),
        [filter, forYou, sections],
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try { await q.refetch(); } finally { setRefreshing(false); }
    };
    const onStart = (program: string) => navigation.navigate('MaxxDetail', { maxxId: program });

    return (
        // The scroll view starts under the status bar so the sticky filter row
        // stops there instead of sliding under the clock.
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <ScrollView
                contentContainerStyle={{ paddingTop: 22, paddingBottom: insets.bottom + 110 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MUTE} />}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={[1]}
            >
                <View style={styles.head}>
                    <Text style={styles.h1}>
                        Gear for your <Text style={styles.h1i}>stack</Text>
                    </Text>
                    <Text style={styles.sub}>
                        {mine.length
                            ? 'Picked for the programs you run. Tap one to open it in Amazon.'
                            : 'What each program uses. Start a program to see yours first.'}
                    </Text>
                </View>

                <View style={styles.pillsBar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
                        {[{ program: FOR_YOU, label: 'For you' }, ...sections].map((s) => {
                            const on = filter === s.program;
                            return (
                                <Pressable
                                    key={s.program}
                                    onPress={() => {
                                        Haptics.selectionAsync().catch(() => {});
                                        setFilter(s.program);
                                    }}
                                    style={[styles.pill, on && styles.pillOn]}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: on }}
                                >
                                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{s.label}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>

                {q.isLoading ? (
                    <View style={styles.center}><ActivityIndicator color={MUTE} /></View>
                ) : q.isError && !sections.length ? (
                    <View style={styles.center}>
                        <Text style={styles.noteText}>Couldn't load products.</Text>
                        <Pressable onPress={() => q.refetch()} style={styles.noteBtn}>
                            <Text style={styles.noteBtnText}>Try again</Text>
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.body}>
                        {shown.map((s) => (
                            <Section key={s.program} s={s} width={width} showHeader={filter === FOR_YOU} onStart={onStart} />
                        ))}
                        {q.data?.checked ? (
                            <Text style={styles.footer}>
                                Prices and ratings from Amazon, checked {checkedLabel(q.data.checked)}. They may have changed.
                            </Text>
                        ) : null}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },
    head: { paddingHorizontal: GUTTER },
    h1: { fontFamily: SERIF, fontSize: 40, color: INK, letterSpacing: -1, lineHeight: 44 },
    h1i: { fontFamily: SERIF_I, color: INK },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, marginTop: 8, lineHeight: 20 },

    pillsBar: { backgroundColor: CREAM, paddingTop: 18, paddingBottom: 10 },
    pills: { paddingHorizontal: GUTTER, gap: 8 },
    pill: {
        paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999,
        backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    pillOn: { backgroundColor: INK, borderColor: INK },
    pillText: { fontFamily: 'Matter-Medium', fontSize: 14, color: INK },
    pillTextOn: { fontFamily: 'Matter-SemiBold', color: ON_INK },

    body: { paddingHorizontal: GUTTER, paddingTop: 6 },
    center: { paddingTop: 80, alignItems: 'center' },
    section: { marginTop: 18 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    sectionIcon: { width: 26, height: 26, marginRight: 8 },
    sectionTitle: { fontFamily: SERIF, fontSize: 22, color: INK, letterSpacing: -0.3 },
    sectionCount: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginLeft: 8, marginTop: 3 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP },
    card: {
        backgroundColor: CARD, borderRadius: 20, borderCurve: 'continuous', padding: 10,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
    imageWrap: {
        aspectRatio: 1, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10,
    },
    image: { width: '86%', height: '86%' },
    planPill: {
        position: 'absolute', top: 6, left: 6, maxWidth: '88%',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: INK,
    },
    planPillText: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, color: ON_INK, letterSpacing: 0.2 },
    brand: { fontFamily: 'Matter-Medium', fontSize: 11, color: MUTE, letterSpacing: 0.6, textTransform: 'uppercase' },
    name: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK, lineHeight: 18.5, marginTop: 3, minHeight: 37 },
    why: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, lineHeight: 16, marginTop: 4, minHeight: 32 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    rating: { fontFamily: 'Matter-Medium', fontSize: 12, color: INK, marginLeft: 3 },
    count: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginLeft: 3 },
    priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    price: { fontFamily: 'Matter-SemiBold', fontSize: 17, color: INK, letterSpacing: -0.2 },

    startBanner: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 18,
        borderCurve: 'continuous', padding: 14, marginBottom: 14,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    startIcon: { width: 34, height: 34, marginRight: 12 },
    startTitle: { fontFamily: 'Matter-SemiBold', fontSize: 14.5, color: INK },
    startSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 2, lineHeight: 18 },
    noteCard: {
        backgroundColor: CARD, borderRadius: 20, padding: 18,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    noteText: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: '#555', lineHeight: 21 },
    noteBtn: {
        alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 18, paddingVertical: 10,
        borderRadius: 999, backgroundColor: INK,
    },
    noteBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: ON_INK },
    footer: {
        fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, textAlign: 'center',
        marginTop: 28, lineHeight: 17, paddingHorizontal: 12,
    },
});

/**
 * Products tab — just what the routine on your schedule uses.
 *
 * Backend: GET /products/for-me (api/products.py) computes it from the user's
 * CURRENT plans every time: only the programs they run, only the needs their
 * habits (or skin-routine steps) have, one product per need. Change programs
 * or tweak a plan and the list follows on the next focus.
 *
 * "Swap" on a card opens the other products for that same need
 * (GET /products/alternatives); choosing one is remembered (POST /products/pick).
 *
 * Tapping a product opens it in the Amazon app, or Safari without it
 * (lib/openAmazon) — never an in-app browser, so their account and cart are there.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api, { ShopItem, ShopProduct } from '../../services/api';
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
const ALL = '__all';

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

/** ["AM skin routine", "PM skin routine"] → "your AM & PM skin routine". */
export const forLabel = (habits: string[]) => {
    const h = habits.map((x) => x.trim()).filter(Boolean);
    if (!h.length) return '';
    const am = h.find((x) => /^am /i.test(x)), pm = h.find((x) => /^pm /i.test(x));
    if (am && pm && am.slice(3) === pm.slice(3)) {
        const rest = h.filter((x) => x !== am && x !== pm);
        return `your AM & PM ${am.slice(3)}${rest.length ? ` + ${rest.length} more` : ''}`;
    }
    return `your ${h[0]}${h.length > 1 ? ` + ${h.length - 1} more` : ''}`;
};

const checkedLabel = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
};

async function openProduct(p: ShopProduct, need: string, from: 'card' | 'options') {
    Haptics.selectionAsync().catch(() => {});
    const how = await openAmazonProduct(p.asin, p.url);
    track('product_open', { product: p.id, need, how, from });
}

function Rating({ p }: { p: ShopProduct }) {
    if (!p.rating) return null;
    return (
        <View style={styles.ratingRow}>
            <Ionicons name="star" size={11} color={STAR} />
            <Text style={styles.rating}>{p.rating.toFixed(1)}</Text>
            {p.rating_count ? <Text style={styles.count}>({shortCount(p.rating_count)})</Text> : null}
        </View>
    );
}

function ProductCard({ item, width, onSwap }: { item: ShopItem; width: number; onSwap: (i: ShopItem) => void }) {
    const p = item.product;
    const [pressed, setPressed] = useState(false);
    return (
        <Pressable
            onPress={() => openProduct(p, item.need, 'card')}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            style={[styles.card, { width }, pressed && styles.cardPressed]}
            accessibilityRole="link"
            accessibilityLabel={`${item.need_label}: ${p.brand} ${p.name}, ${money(p.price_usd)}. Opens in Amazon.`}
            testID={`product-${p.id}`}
        >
            <View style={styles.imageWrap}>
                {p.image ? (
                    <ExpoImage source={{ uri: p.image }} style={styles.image} contentFit="contain" transition={150} />
                ) : (
                    <Ionicons name="bag-handle-outline" size={28} color={MUTE} />
                )}
                <View style={styles.needPill}>
                    <Text style={styles.needPillText} numberOfLines={1}>{item.need_label}</Text>
                </View>
            </View>
            <Text style={styles.brand} numberOfLines={1}>{p.brand}</Text>
            <Text style={styles.name} numberOfLines={2}>{shortName(p.name, p.brand)}</Text>
            <Text style={styles.forText} numberOfLines={2}>For {forLabel(item.for)}</Text>
            <Rating p={p} />
            <View style={styles.priceRow}>
                <Text style={styles.price}>{money(p.price_usd)}</Text>
                {item.options > 1 ? (
                    <Pressable
                        onPress={() => onSwap(item)}
                        hitSlop={8}
                        style={styles.swap}
                        accessibilityRole="button"
                        accessibilityLabel={`Other options for ${item.need_label}`}
                        testID={`swap-${item.need}`}
                    >
                        <Ionicons name="swap-horizontal" size={13} color={INK} />
                        <Text style={styles.swapText}>Swap</Text>
                    </Pressable>
                ) : (
                    <Ionicons name="open-outline" size={15} color={INK} />
                )}
            </View>
        </Pressable>
    );
}

function OptionsSheet({ item, onClose }: { item: ShopItem | null; onClose: () => void }) {
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();
    const [saving, setSaving] = useState<string | null>(null);
    const q = useQuery({
        queryKey: ['products', 'alternatives', item?.need],
        queryFn: () => api.getProductAlternatives(item!.need),
        enabled: !!item,
    });
    const choose = async (p: ShopProduct & { current: boolean }) => {
        if (!item || p.current || saving) return;
        Haptics.selectionAsync().catch(() => {});
        setSaving(p.id);
        try {
            await api.pickProduct(item.need, p.id);
            await qc.invalidateQueries({ queryKey: productsQueryKey });
            await qc.invalidateQueries({ queryKey: ['products', 'alternatives', item.need] });
            // task guides show this same pick on their steps (cached forever otherwise)
            await qc.invalidateQueries({ queryKey: ['taskGuide'] });
            track('product_open', { product: p.id, need: item.need, how: 'picked', from: 'options' });
            onClose();
        } finally {
            setSaving(null);
        }
    };
    return (
        <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.grabber} />
                <Text style={styles.sheetTitle}>{item?.need_label}</Text>
                {item?.for?.length ? <Text style={styles.sheetSub}>For {forLabel(item.for)}</Text> : null}
                {q.isLoading ? (
                    <View style={{ paddingVertical: 40 }}><ActivityIndicator color={MUTE} /></View>
                ) : (
                    <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                        {(q.data?.options ?? []).map((p) => (
                            <Pressable
                                key={p.id}
                                onPress={() => choose(p)}
                                style={[styles.optRow, p.current && styles.optRowOn]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: p.current }}
                                testID={`option-${p.id}`}
                            >
                                <View style={styles.optImageWrap}>
                                    {p.image ? <ExpoImage source={{ uri: p.image }} style={styles.optImage} contentFit="contain" /> : null}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.brand} numberOfLines={1}>{p.brand}</Text>
                                    <Text style={styles.optName} numberOfLines={2}>{shortName(p.name, p.brand)}</Text>
                                    {p.why ? <Text style={styles.optWhy} numberOfLines={2}>{p.why}</Text> : null}
                                    <View style={styles.optMeta}>
                                        <Text style={styles.optPrice}>{money(p.price_usd)}</Text>
                                        <Rating p={p} />
                                    </View>
                                </View>
                                <View style={styles.optSide}>
                                    {p.current ? (
                                        <View style={styles.yourPick}>
                                            <Ionicons name="checkmark" size={12} color={ON_INK} />
                                            <Text style={styles.yourPickText}>Yours</Text>
                                        </View>
                                    ) : saving === p.id ? (
                                        <ActivityIndicator color={INK} />
                                    ) : (
                                        <Text style={styles.useText}>Use this</Text>
                                    )}
                                    <Pressable
                                        onPress={() => openProduct(p, item!.need, 'options')}
                                        hitSlop={8}
                                        style={styles.viewBtn}
                                        accessibilityRole="link"
                                        accessibilityLabel="View on Amazon"
                                    >
                                        <Ionicons name="open-outline" size={16} color={INK} />
                                    </Pressable>
                                </View>
                            </Pressable>
                        ))}
                    </ScrollView>
                )}
            </View>
        </Modal>
    );
}

export default function ProductsScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const [filter, setFilter] = useState<string>(ALL);
    const [refreshing, setRefreshing] = useState(false);
    const [swapping, setSwapping] = useState<ShopItem | null>(null);
    // 2 columns on a phone, 3-4 on an iPad, cards ~170-240 pt wide.
    const { width: screenW } = useWindowDimensions();
    const cols = Math.max(2, Math.min(4, Math.floor((screenW - GUTTER * 2 + GAP) / 240)));
    const width = (screenW - GUTTER * 2 - GAP * (cols - 1)) / cols;

    const q = useQuery({
        queryKey: productsQueryKey,
        queryFn: () => api.getProductsForMe(),
        staleTime: 60 * 1000,
    });

    useFocusEffect(useCallback(() => {
        track('products_view');
        // The list follows their plans: a program started or a habit moved since.
        q.refetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    const sections = q.data?.sections ?? [];
    const shown = useMemo(
        () => (filter === ALL ? sections : sections.filter((s) => s.program === filter)),
        [filter, sections],
    );
    const total = sections.reduce((n, s) => n + s.items.length, 0);

    const onRefresh = async () => {
        setRefreshing(true);
        try { await q.refetch(); } finally { setRefreshing(false); }
    };

    return (
        // The scroll view starts under the status bar so the sticky filter row
        // stops there instead of sliding under the clock.
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <ScrollView
                contentContainerStyle={{ paddingTop: 22, paddingBottom: insets.bottom + 110 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MUTE} />}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={sections.length > 1 ? [1] : undefined}
            >
                <View style={styles.head}>
                    <Text style={styles.h1}>
                        Gear for your <Text style={styles.h1i}>stack</Text>
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>Just what your routine uses.</Text>
                </View>

                {sections.length > 1 ? (
                    <View style={styles.pillsBar}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
                            {[{ program: ALL, label: 'All' }, ...sections].map((s) => {
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
                ) : <View />}

                {q.isLoading ? (
                    <View style={styles.center}><ActivityIndicator color={MUTE} /></View>
                ) : q.isError && !sections.length ? (
                    <View style={styles.body}>
                        <View style={styles.noteCard}>
                            <Text style={styles.noteText}>Couldn't load your products.</Text>
                            <Pressable onPress={() => q.refetch()} style={styles.noteBtn}>
                                <Text style={styles.noteBtnText}>Try again</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : !total ? (
                    <View style={styles.body}>
                        <View style={styles.noteCard}>
                            <Text style={styles.noteTitle}>
                                {q.data?.has_programs ? 'Nothing to buy right now' : 'Start a program first'}
                            </Text>
                            <Text style={styles.noteText}>
                                {q.data?.has_programs
                                    ? "Your current routine doesn't need any gear. When it does, it shows up here."
                                    : 'Once a program is on your schedule, the gear its routine uses shows up here.'}
                            </Text>
                            {!q.data?.has_programs ? (
                                <Pressable onPress={() => navigation.navigate('Explore')} style={styles.noteBtn}>
                                    <Text style={styles.noteBtnText}>Explore programs</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                ) : (
                    <View style={styles.body}>
                        {/* One continuous grid (no half-empty rows under small sections);
                            each card's label + "For your …" line says what it's for. */}
                        <View style={[styles.grid, styles.section]}>
                            {shown.flatMap((s) => s.items).map((it) => (
                                <ProductCard key={it.need} item={it} width={width} onSwap={setSwapping} />
                            ))}
                        </View>
                        {q.data?.checked ? (
                            <Text style={styles.footer}>
                                Prices and ratings from Amazon, checked {checkedLabel(q.data.checked)}. They may have changed.
                            </Text>
                        ) : null}
                    </View>
                )}
            </ScrollView>
            <OptionsSheet item={swapping} onClose={() => setSwapping(null)} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },
    head: { paddingHorizontal: GUTTER },
    h1: { fontFamily: SERIF, fontSize: 32, color: INK, letterSpacing: -0.8, lineHeight: 38 },
    h1i: { fontFamily: SERIF_I, color: INK },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, marginTop: 6 },

    pillsBar: { backgroundColor: CREAM, paddingTop: 16, paddingBottom: 10 },
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
    section: { marginTop: 8 },

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
    needPill: {
        position: 'absolute', top: 6, left: 6, maxWidth: '88%',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: INK,
    },
    needPillText: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, color: ON_INK, letterSpacing: 0.2 },
    brand: { fontFamily: 'Matter-Medium', fontSize: 11, color: MUTE, letterSpacing: 0.6, textTransform: 'uppercase' },
    name: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK, lineHeight: 18.5, marginTop: 3, minHeight: 37 },
    forText: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 4, lineHeight: 16, minHeight: 32 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    rating: { fontFamily: 'Matter-Medium', fontSize: 12, color: INK, marginLeft: 3 },
    count: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginLeft: 3 },
    priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    price: { fontFamily: 'Matter-SemiBold', fontSize: 17, color: INK, letterSpacing: -0.2 },
    swap: {
        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5,
        borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)',
    },
    swapText: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: INK },

    noteCard: {
        backgroundColor: CARD, borderRadius: 20, padding: 18, marginTop: 12,
        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    },
    noteTitle: { fontFamily: SERIF, fontSize: 20, color: INK, marginBottom: 6 },
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

    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
    sheet: {
        backgroundColor: CREAM, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderCurve: 'continuous',
        paddingHorizontal: GUTTER, paddingTop: 10,
    },
    grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.15)', marginBottom: 14 },
    sheetTitle: { fontFamily: SERIF, fontSize: 24, color: INK, letterSpacing: -0.4 },
    sheetSub: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: MUTE, marginTop: 2, marginBottom: 12 },
    optRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 18, padding: 10,
        marginBottom: 10, borderWidth: 1, borderColor: 'transparent',
    },
    optRowOn: { borderColor: INK },
    optImageWrap: {
        width: 72, height: 72, borderRadius: 12, backgroundColor: '#FFFFFF', marginRight: 12,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    optImage: { width: '90%', height: '90%' },
    optName: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK, lineHeight: 18, marginTop: 2 },
    optWhy: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, lineHeight: 16, marginTop: 3 },
    optMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    optPrice: { fontFamily: 'Matter-SemiBold', fontSize: 14.5, color: INK, marginTop: 6 },
    optSide: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', marginLeft: 8, paddingVertical: 2 },
    yourPick: {
        flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: INK,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    },
    yourPickText: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: ON_INK },
    useText: { fontFamily: 'Matter-SemiBold', fontSize: 12.5, color: INK },
    viewBtn: { padding: 4 },
});

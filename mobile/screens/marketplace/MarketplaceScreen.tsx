/**
 * MarketplaceScreen (Explore) — browse + enter native maxes ($3.99/wk each) and
 * creator courses. Minimalist + editorial: a calm cream page, clean warm-white
 * cards, Fraunces serif names, the max's colour used only as a small accent
 * (the icon). Tapping a card opens MaxDetail.
 */
import React, { useCallback, useEffect, useState } from 'react';
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
import { hexA } from '../../utils/scheduleAggregation';
import api, { type MarketplaceItem } from '../../services/api';

const INK = '#1C1A17';
const MUTE = '#97928A';
const SUB = '#5C574E';
const CREAM = '#F7F0EA';
const CARD = '#FCFAF6';
const BORDER = '#E8E0D3';
const GOLD = '#2C6BED';
const SERIF = 'Fraunces';
const SERIF_I = 'Fraunces-Italic';

export default function MarketplaceScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const [maxxes, setMaxxes] = useState<MarketplaceItem[]>([]);
    const [courses, setCourses] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

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
                contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 22, paddingBottom: insets.bottom + 96 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
            >
                <Text style={styles.h1}>Find your <Text style={styles.h1i}>max</Text></Text>
                <Text style={styles.h1sub}>Pick what you're working on. Max fits it into your real week.</Text>

                {error ? (
                    <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>
                ) : null}

                <View style={styles.sectionHead}>
                    <Text style={styles.sectionLabel}>MAXES</Text>
                    <Text style={styles.sectionNote}>$3.99 / week each</Text>
                </View>
                <View style={styles.stack}>
                    {maxxes.map((m) => (
                        <MaxCard key={m.id} item={m} onPress={() => navigation.push('MaxDetail', { item: m })} />
                    ))}
                </View>

                {courses.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, { marginTop: 36 }]}>
                            <Text style={styles.sectionLabel}>CREATOR COURSES</Text>
                        </View>
                        <View style={styles.stack}>
                            {courses.map((c) => (
                                <CourseCard key={c.id} item={c} onPress={() => navigation.push('MaxDetail', { item: c })} />
                            ))}
                        </View>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

/** A native max — clean warm-white card, colour only in the icon. */
function MaxCard({ item, onPress }: { item: MarketplaceItem; onPress: () => void }) {
    const base = item.color || GOLD;
    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
            <View style={[styles.iconTile, { backgroundColor: hexA(base, 0.1) }]}>
                <Ionicons name={(item.icon as any) || 'ellipse-outline'} size={22} color={base} />
            </View>
            <View style={styles.mid}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>{item.tagline}</Text>
            </View>
            <View style={styles.right}>
                {item.entered ? (
                    <Text style={[styles.open, { color: base }]}>Open</Text>
                ) : (
                    <>
                        <Text style={styles.price}>$3.99</Text>
                        <Text style={styles.per}>/ week</Text>
                    </>
                )}
            </View>
        </TouchableOpacity>
    );
}

/** A creator course — same card, cover thumbnail + creator + rating. */
function CourseCard({ item, onPress }: { item: MarketplaceItem; onPress: () => void }) {
    const base = item.color || GOLD;
    const img = (item as any).image_url as string | undefined;
    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
            {img ? (
                <Image source={{ uri: img }} style={styles.thumb} contentFit="cover" transition={200} />
            ) : (
                <View style={[styles.iconTile, { backgroundColor: hexA(base, 0.1) }]}>
                    <Ionicons name={(item.icon as any) || 'ellipse-outline'} size={22} color={base} />
                </View>
            )}
            <View style={styles.mid}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                    @{item.creator.handle}{item.creator.verified ? ' ✓' : ''}
                    {item.rating ? `   ★ ${item.rating.toFixed(1)}` : ''}
                </Text>
            </View>
            <View style={styles.right}>
                {item.entered ? (
                    <Text style={[styles.open, { color: base }]}>Open</Text>
                ) : (
                    <Text style={styles.price}>{item.price_label.replace(' / week', '/wk')}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE },

    h1: { fontFamily: SERIF, fontSize: 34, color: INK, letterSpacing: -0.7 },
    h1i: { fontFamily: SERIF_I, color: INK },
    h1sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 21, marginTop: 8, maxWidth: '92%' },

    errorCard: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
    errorText: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#B23A3A' },

    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 34, marginBottom: 14 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: MUTE },
    sectionNote: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: MUTE },

    stack: { gap: 10 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: BORDER,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    iconTile: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    thumb: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EFE7DC' },
    mid: { flex: 1, marginLeft: 14 },
    title: { fontFamily: SERIF, fontSize: 19, color: INK, letterSpacing: -0.3 },
    sub: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 3 },
    right: { alignItems: 'flex-end', marginLeft: 10 },
    price: { fontFamily: 'Matter-SemiBold', fontSize: 14.5, color: INK },
    per: { fontFamily: 'Matter-Regular', fontSize: 11, color: MUTE, marginTop: 1 },
    open: { fontFamily: 'Matter-SemiBold', fontSize: 14.5 },
});

/**
 * MarketplaceScreen (Explore) — browse + enter native maxes ($3.99/wk each) and
 * creator courses. Media-forward + editorial (Apple / craft.do register): big
 * cover imagery, Fraunces serif names, a calm cream page, the max's colour as a
 * whisper. Maxes are full-bleed image cards; courses run as a cover carousel.
 * Tapping anything opens MaxDetail.
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
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
                contentContainerStyle={{ paddingTop: insets.top + 22, paddingBottom: insets.bottom + 96 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
            >
                <View style={styles.head}>
                    <Text style={styles.h1}>Find your <Text style={styles.h1i}>max</Text></Text>
                    <Text style={styles.h1sub}>Pick what you're working on. Max fits it into your real week.</Text>
                </View>

                {error ? (
                    <View style={styles.gutter}>
                        <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>
                    </View>
                ) : null}

                <View style={[styles.sectionHead, styles.gutter]}>
                    <Text style={styles.sectionLabel}>Maxes</Text>
                    <Text style={styles.sectionNote}>$3.99 / week each</Text>
                </View>
                <View style={styles.gutter}>
                    {maxxes.map((m, i) => (
                        <MaxCard key={m.id} item={m} featured={i === 0} onPress={() => navigation.push('MaxDetail', { item: m })} />
                    ))}
                </View>

                {courses.length > 0 ? (
                    <>
                        <View style={[styles.sectionHead, styles.gutter, { marginTop: 40 }]}>
                            <Text style={styles.sectionLabel}>Creator courses</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 22, gap: 14 }}
                        >
                            {courses.map((c) => (
                                <CourseCard key={c.id} item={c} onPress={() => navigation.push('MaxDetail', { item: c })} />
                            ))}
                        </ScrollView>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

/** A native max — full-bleed cover image with the title set over a soft scrim. */
function MaxCard({ item, featured, onPress }: { item: MarketplaceItem; featured?: boolean; onPress: () => void }) {
    const base = item.color || GOLD;
    return (
        <TouchableOpacity
            style={[styles.maxCard, { height: featured ? 280 : 196 }]}
            activeOpacity={0.9}
            onPress={onPress}
        >
            {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={260} />
            ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
            )}
            <LinearGradient
                colors={['transparent', 'rgba(20,17,14,0.10)', 'rgba(20,17,14,0.78)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
            />
            <View style={[styles.priceTag, item.entered && { backgroundColor: base }]}>
                <Text style={[styles.priceTagText, item.entered && { color: '#fff' }]}>
                    {item.entered ? 'Open' : '$3.99 / wk'}
                </Text>
            </View>
            <View style={styles.maxOverlay}>
                <Text style={[styles.maxTitle, featured && { fontSize: 32 }]}>{item.title}</Text>
                <Text style={styles.maxTagline} numberOfLines={1}>{item.tagline}</Text>
            </View>
        </TouchableOpacity>
    );
}

/** A creator course — a cover card in the horizontal rail, creator + price below. */
function CourseCard({ item, onPress }: { item: MarketplaceItem; onPress: () => void }) {
    const base = item.color || GOLD;
    return (
        <TouchableOpacity style={styles.courseCard} activeOpacity={0.85} onPress={onPress}>
            <View style={styles.courseCoverWrap}>
                {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
                )}
                {item.entered ? (
                    <View style={[styles.enteredChip, { backgroundColor: base }]}>
                        <Text style={styles.enteredChipText}>Open</Text>
                    </View>
                ) : null}
            </View>
            <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.courseMeta} numberOfLines={1}>
                @{item.creator.handle}{item.creator.verified ? ' ✓' : ''}
                {item.rating ? `   ★ ${item.rating.toFixed(1)}` : ''}
            </Text>
            {!item.entered ? (
                <Text style={styles.coursePrice}>{item.price_label.replace(' / week', ' / wk')}</Text>
            ) : null}
        </TouchableOpacity>
    );
}

const GUTTER = 22;

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE },

    gutter: { paddingHorizontal: GUTTER },
    head: { paddingHorizontal: GUTTER },
    h1: { fontFamily: SERIF, fontSize: 38, color: INK, letterSpacing: -0.9, lineHeight: 42 },
    h1i: { fontFamily: SERIF_I, color: INK },
    h1sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 21, marginTop: 10, maxWidth: '92%' },

    errorCard: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
    errorText: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#B23A3A' },

    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 30, marginBottom: 14 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 13, color: INK },
    sectionNote: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE },

    // Native max — image card
    maxCard: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 14,
        backgroundColor: '#EFE7DC',
    },
    maxOverlay: { position: 'absolute', left: 20, right: 20, bottom: 18 },
    maxTitle: { fontFamily: SERIF, fontSize: 26, color: '#fff', letterSpacing: -0.5 },
    maxTagline: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: 'rgba(255,255,255,0.88)', marginTop: 4 },
    priceTag: {
        position: 'absolute', top: 14, right: 14,
        backgroundColor: 'rgba(252,250,246,0.92)',
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    },
    priceTagText: { fontFamily: 'Matter-SemiBold', fontSize: 12.5, color: INK },

    // Creator course — carousel card
    courseCard: { width: 232 },
    courseCoverWrap: {
        width: 232, height: 150, borderRadius: 18, overflow: 'hidden',
        backgroundColor: '#EFE7DC', marginBottom: 11,
    },
    enteredChip: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    enteredChipText: { fontFamily: 'Matter-SemiBold', fontSize: 11.5, color: '#fff' },
    courseTitle: { fontFamily: SERIF, fontSize: 18, color: INK, letterSpacing: -0.3 },
    courseMeta: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 4 },
    coursePrice: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK, marginTop: 6 },
});

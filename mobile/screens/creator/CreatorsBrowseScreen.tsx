/**
 * CreatorsBrowseScreen — discover creators to subscribe to. Live creators,
 * most-subscribed first; tap opens their feed (or paywall if not subscribed).
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';
import { hexA } from '../../utils/scheduleAggregation';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F5F5F5';

export default function CreatorsBrowseScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [creators, setCreators] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await api.browseCreators();
            setCreators(res.creators || []);
        } catch { /* keep */ }
        finally { setLoading(false); }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const open = (c: any) => nav.navigate(c.subscribed ? 'CreatorFeed' : 'CreatorPaywall', { maxxId: c.maxx_id });

    const renderItem = ({ item }: { item: any }) => {
        const accent = item.accent_color || '#BC7A3C';
        return (
            <TouchableOpacity style={s.card} onPress={() => open(item)} activeOpacity={0.85}>
                <View style={[s.avatarRing, { borderColor: accent }]}>
                    {item.avatar_url ? (
                        <ExpoImage source={{ uri: api.resolveAttachmentUrl(item.avatar_url) }} style={s.avatar} contentFit="cover" />
                    ) : (
                        <View style={[s.avatar, { backgroundColor: hexA(accent, 0.16), alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name={item.icon || 'star'} size={22} color={accent} />
                        </View>
                    )}
                </View>
                <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                        <Text style={s.name} numberOfLines={1}>{item.display_name}</Text>
                        {item.verified ? <Ionicons name="checkmark-circle" size={14} color={accent} /> : null}
                    </View>
                    <Text style={s.tagline} numberOfLines={1}>{item.tagline || `${item.subscriber_count || 0} subscribers`}</Text>
                </View>
                {item.subscribed ? (
                    <Ionicons name="checkmark-circle" size={20} color={accent} />
                ) : (
                    <Text style={[s.price, { color: accent }]}>${((item.price_cents || 0) / 100).toFixed(2)}/mo</Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Creators</Text>
                <View style={{ width: 32 }} />
            </View>
            {loading ? (
                <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={creators}
                    keyExtractor={(c) => c.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 20 }}
                    ListEmptyComponent={<Text style={s.empty}>No creators yet — check back soon.</Text>}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.serif, fontSize: 20, color: INK },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
    avatarRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, padding: 2 },
    avatar: { width: '100%', height: '100%', borderRadius: 22 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: INK },
    tagline: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2 },
    price: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 40 },
});

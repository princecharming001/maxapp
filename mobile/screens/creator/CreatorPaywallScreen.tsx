/**
 * CreatorPaywallScreen — subscribe to one creator (monthly, on top of Chad).
 * Real purchase uses Apple IAP against the creator's own SKU (each creator has
 * its own subscription group). In dev builds a "Start subscription" tap
 * dev-activates so the full loop is testable on the simulator without Apple.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fonts } from '../../theme/dark';
import { hexA } from '../../utils/scheduleAggregation';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F1F1EF';
const SHOW_DEV = __DEV__;

const BENEFITS = [
    { icon: 'videocam-outline', text: 'Video & text updates, direct from the creator' },
    { icon: 'book-outline', text: 'Their full course, kept up to date' },
    { icon: 'chatbubbles-outline', text: 'Comment and get replies' },
    { icon: 'notifications-outline', text: 'Get pinged the moment they post' },
];

export default function CreatorPaywallScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { user, isPaid, refreshUser } = useAuth();
    const maxxId: string = route.params?.maxxId;

    const [creator, setCreator] = useState<any>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { setCreator(await api.getCreatorByMaxx(maxxId)); } catch { /* ignore */ }
    }, [maxxId]);
    useEffect(() => { void load(); }, [load]);

    const accent = creator?.accent_color || '#BC7A3C';
    const price = creator ? `$${((creator.price_cents || 0) / 100).toFixed(2)}` : '';

    const subscribe = async () => {
        if (busy || !creator) return;
        // Chad base sub is required underneath.
        if (!isPaid) {
            Alert.alert('Chad required', 'Creator subscriptions are an add-on to Chad. Start Chad first.', [
                { text: 'Not now', style: 'cancel' },
                { text: 'Get Chad', onPress: () => nav.navigate('Payment') },
            ]);
            return;
        }
        setBusy(true);
        try {
            if (SHOW_DEV) {
                await api.devActivateCreatorSubscription(maxxId);
            } else {
                // Production: run the real IAP purchase against creator.apple_product_id,
                // then verify. The per-creator SKU must exist in App Store Connect.
                const { subscribeToCreatorProduct } = await import('../../hooks/useCreatorPurchase');
                const tid = await subscribeToCreatorProduct(creator.apple_product_id, user?.id ?? '');
                await api.verifyCreatorSubscription(maxxId, tid, creator.apple_product_id);
            }
            await refreshUser();
            nav.replace('CreatorFeed', { maxxId });
        } catch (e: any) {
            Alert.alert('Could not subscribe', e?.response?.data?.detail || e?.message || 'Try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={[s.root, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.close} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={INK} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 30, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
                <View style={{ height: 20 }} />
                <View style={[s.avatarRing, { borderColor: accent }]}>
                    {creator?.avatar_url ? (
                        <ExpoImage source={{ uri: api.resolveAttachmentUrl(creator.avatar_url) }} style={s.avatar} contentFit="cover" />
                    ) : (
                        <View style={[s.avatar, { backgroundColor: hexA(accent, 0.16), alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name={creator?.icon || 'star'} size={30} color={accent} />
                        </View>
                    )}
                </View>
                <Text style={s.title}>{creator?.display_name || 'Creator'}</Text>
                {creator?.tagline ? <Text style={s.tagline}>{creator.tagline}</Text> : null}

                <View style={s.benefits}>
                    {BENEFITS.map((b) => (
                        <View key={b.text} style={s.benefitRow}>
                            <View style={[s.benefitIcon, { backgroundColor: hexA(accent, 0.14) }]}>
                                <Ionicons name={b.icon as any} size={17} color={accent} />
                            </View>
                            <Text style={s.benefitText}>{b.text}</Text>
                        </View>
                    ))}
                </View>

                <View style={s.priceCard}>
                    <Text style={s.priceValue}>{price}<Text style={s.pricePer}>/month</Text></Text>
                    <Text style={s.priceNote}>Cancel anytime · billed on top of Chad</Text>
                </View>

                <TouchableOpacity style={[s.cta, { backgroundColor: accent }, (busy || !creator) && { opacity: 0.5 }]} onPress={subscribe} disabled={busy || !creator} activeOpacity={0.9}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.ctaText}>Start subscription</Text>}
                </TouchableOpacity>
                {SHOW_DEV ? <Text style={s.devNote}>DEV: activates instantly (no Apple)</Text> : null}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    close: { position: 'absolute', right: 20, top: 0, zIndex: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    avatarRing: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, padding: 3 },
    avatar: { width: '100%', height: '100%', borderRadius: 40 },
    title: { fontFamily: fonts.serif, fontSize: 28, color: INK, marginTop: 14 },
    tagline: { fontFamily: fonts.sans, fontSize: 15, color: MUTE, marginTop: 8, textAlign: 'center' },
    benefits: { alignSelf: 'stretch', gap: 14, marginTop: 26 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    benefitIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    benefitText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: INK },
    priceCard: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', paddingVertical: 18, marginTop: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.07)' },
    priceValue: { fontFamily: fonts.sansBold, fontSize: 30, color: INK },
    pricePer: { fontFamily: fonts.sansMedium, fontSize: 15, color: MUTE },
    priceNote: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 6 },
    cta: { alignSelf: 'stretch', height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 22,
        ...(Platform.OS === 'ios' ? { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } } : { elevation: 5 }) },
    ctaText: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: '#FFFFFF' },
    devNote: { fontFamily: fonts.sans, fontSize: 11.5, color: MUTE, marginTop: 10 },
});

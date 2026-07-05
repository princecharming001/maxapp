/**
 * ChannelList — the Community tab of a creator maxx home. Lists the creator's
 * channels (GET /forums?maxx_id=): announcement channels get a megaphone disc,
 * open channels a chat disc; tap opens ChannelChat with the creator accent.
 * A 403 (non-member) renders a lock card that routes to CreatorPaywall.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';
import { hexA } from '../../utils/scheduleAggregation';

const INK = '#111113';
const MUTE = '#6B6B6B';
const CARD = '#FFFFFF';
const HAIR = 'rgba(0,0,0,0.06)';

type Channel = {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    who_can_post?: 'creator' | 'members';
    allow_replies?: boolean;
    message_count?: number;
};

export default function ChannelList({ maxxId, accent }: { maxxId: string; accent: string }) {
    const nav = useNavigation<any>();
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        if (!maxxId) return;
        try {
            const res = await api.getCreatorChannels(maxxId);
            setChannels(res.forums || []);
            setLocked(false);
            setError(false);
        } catch (e: any) {
            if (e?.response?.status === 403) setLocked(true);
            else setError(true);
        } finally {
            setLoading(false);
        }
    }, [maxxId]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    if (loading) {
        return (
            <View style={s.centerWrap}>
                <ActivityIndicator color={INK} />
            </View>
        );
    }

    if (locked) {
        return (
            <View style={s.pad}>
                <View style={s.stateCard}>
                    <View style={[s.disc, s.discLg, { backgroundColor: hexA(accent, 0.14) }]}>
                        <Ionicons name="lock-closed" size={20} color={accent} />
                    </View>
                    <Text style={s.stateTitle}>Members only</Text>
                    <Text style={s.stateSub}>Subscribe to join the community.</Text>
                    <TouchableOpacity
                        style={[s.subBtn, { backgroundColor: accent }]}
                        onPress={() => nav.navigate('CreatorPaywall', { maxxId })}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="Subscribe"
                    >
                        <Text style={s.subBtnText}>Subscribe</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={s.pad}>
                <View style={s.stateCard}>
                    <Ionicons name="cloud-offline-outline" size={24} color={MUTE} />
                    <Text style={s.stateSub}>Couldn't load the community. Check your connection.</Text>
                    <TouchableOpacity
                        style={s.retryBtn}
                        onPress={() => { setLoading(true); void load(); }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Retry"
                    >
                        <Text style={s.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (channels.length === 0) {
        return (
            <View style={s.pad}>
                <View style={s.stateCard}>
                    <Ionicons name="chatbubbles-outline" size={24} color={MUTE} />
                    <Text style={s.stateSub}>No channels yet — check back soon.</Text>
                </View>
            </View>
        );
    }

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
        >
            {channels.map((c) => {
                const announceOnly = c.who_can_post === 'creator';
                return (
                    <TouchableOpacity
                        key={c.id}
                        style={s.row}
                        onPress={() => nav.navigate('ChannelChat', {
                            channelId: c.id,
                            channelName: c.name,
                            isAdminOnly: announceOnly,
                            accent,
                            maxxId,
                        })}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${c.name}`}
                    >
                        <View style={[s.disc, { backgroundColor: hexA(accent, 0.14) }]}>
                            <Ionicons
                                name={announceOnly ? 'megaphone-outline' : 'chatbubbles-outline'}
                                size={16}
                                color={accent}
                            />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                            {c.description ? (
                                <Text style={s.desc} numberOfLines={1}>{c.description}</Text>
                            ) : null}
                        </View>
                        {typeof c.message_count === 'number' && c.message_count > 0 ? (
                            <Text style={s.count}>{c.message_count}</Text>
                        ) : null}
                        <Ionicons name="chevron-forward" size={15} color={MUTE} />
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    centerWrap: { paddingTop: 40, alignItems: 'center' },
    pad: { paddingHorizontal: 18, paddingTop: 12 },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: CARD, borderRadius: 14, borderCurve: 'continuous', padding: 13,
        marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
    },
    disc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    discLg: { width: 44, height: 44, borderRadius: 22 },
    name: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: INK },
    desc: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2 },
    count: { fontFamily: fonts.sansMedium, fontSize: 11.5, color: MUTE },

    stateCard: {
        alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 24,
        backgroundColor: CARD, borderRadius: 18, borderCurve: 'continuous',
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
    },
    stateTitle: { fontFamily: fonts.serif, fontSize: 20, color: INK, letterSpacing: -0.3 },
    stateSub: { fontFamily: fonts.sans, fontSize: 13.5, color: MUTE, textAlign: 'center', lineHeight: 20 },
    subBtn: {
        marginTop: 8, paddingHorizontal: 24, height: 44, borderRadius: 999,
        alignItems: 'center', justifyContent: 'center',
    },
    subBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#FFFFFF' },
    retryBtn: {
        marginTop: 6, paddingHorizontal: 20, height: 38, borderRadius: 999,
        backgroundColor: '#F1F1EF', alignItems: 'center', justifyContent: 'center',
    },
    retryText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK },
});

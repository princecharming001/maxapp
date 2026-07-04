/**
 * StudioHomeScreen — the creator's dashboard. Subscriber count + estimated
 * monthly earnings + engagement, a prominent "New update" CTA, quick links to
 * the course editor + settings, and the recent-posts list (tap → manage
 * comments). This is the creator tab's landing screen.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F5F5F5';
const GOLD = '#B8860B';

function money(cents: number): string {
    return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

export default function StudioHomeScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [creator, setCreator] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const [c, st, pr] = await Promise.all([
                api.getMyCreator(),
                api.getMyCreatorStats(),
                api.getMyCreatorPosts(),
            ]);
            setCreator(c); setStats(st); setPosts(pr.posts || []);
        } catch { /* keep */ }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const accent = creator?.accent_color || GOLD;

    if (loading) {
        return <View style={[s.root, s.center]}><ActivityIndicator color={INK} /></View>;
    }

    const statusBanner = creator && creator.status !== 'live' ? (
        <View style={s.banner}>
            <Ionicons name="information-circle-outline" size={16} color={GOLD} />
            <Text style={s.bannerText}>
                {creator.status === 'onboarding'
                    ? 'Post your first update, then go live from Settings.'
                    : creator.apple_review_status === 'pending'
                        ? 'Your subscription is in Apple review.'
                        : 'Your max is paused.'}
            </Text>
        </View>
    ) : null;

    return (
        <View style={[s.root, { paddingTop: insets.top + 10 }]}>
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
            >
                <Text style={s.kicker}>CREATOR STUDIO</Text>
                <Text style={s.title}>{creator?.display_name || 'Your studio'}</Text>

                {statusBanner}

                {/* Stats */}
                <View style={s.statsRow}>
                    <View style={s.statCell}>
                        <Text style={s.statValue}>{stats?.subscriber_count ?? 0}</Text>
                        <Text style={s.statLabel}>SUBSCRIBERS</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statCell}>
                        <Text style={s.statValue}>{money(stats?.est_monthly_cents ?? 0)}</Text>
                        <Text style={s.statLabel}>EST. / MONTH</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statCell}>
                        <Text style={s.statValue}>{stats?.total_likes ?? 0}</Text>
                        <Text style={s.statLabel}>LIKES</Text>
                    </View>
                </View>

                {/* New update CTA */}
                <TouchableOpacity style={[s.newBtn, { backgroundColor: INK }]} onPress={() => nav.navigate('CreatorComposer')} activeOpacity={0.9}>
                    <Ionicons name="add" size={22} color="#FFFFFF" />
                    <Text style={s.newBtnText}>New update</Text>
                </TouchableOpacity>

                {/* Quick links */}
                <View style={s.linkRow}>
                    <TouchableOpacity style={s.linkCard} onPress={() => nav.navigate('CreatorCourseEditor')} activeOpacity={0.85}>
                        <Ionicons name="book-outline" size={20} color={accent} />
                        <Text style={s.linkText}>Course</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.linkCard} onPress={() => nav.navigate('CreatorSettings')} activeOpacity={0.85}>
                        <Ionicons name="settings-outline" size={20} color={accent} />
                        <Text style={s.linkText}>Settings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.linkCard} onPress={() => nav.navigate('CreatorFeed', { maxxId: creator?.maxx_id })} activeOpacity={0.85}>
                        <Ionicons name="eye-outline" size={20} color={accent} />
                        <Text style={s.linkText}>Preview</Text>
                    </TouchableOpacity>
                </View>

                {/* Recent posts */}
                <Text style={s.section}>Recent updates</Text>
                {posts.length === 0 ? (
                    <Text style={s.empty}>No updates yet. Post your first one.</Text>
                ) : posts.map((p) => (
                    <TouchableOpacity key={p.id} style={s.postRow} onPress={() => nav.navigate('CreatorPostComments', { postId: p.id })} activeOpacity={0.7}>
                        <View style={[s.postIcon, { backgroundColor: '#F1F1EF' }]}>
                            <Ionicons name={p.type === 'video' ? 'videocam' : 'text'} size={16} color={INK} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.postBody} numberOfLines={1}>{p.body || (p.type === 'video' ? 'Video update' : 'Update')}</Text>
                            <Text style={s.postMeta}>{p.like_count || 0} likes · {p.comment_count || 0} comments{p.pinned ? ' · pinned' : ''}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={MUTE} />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    center: { alignItems: 'center', justifyContent: 'center' },
    kicker: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, color: GOLD },
    title: { fontFamily: fonts.serif, fontSize: 30, color: INK, marginTop: 6 },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FBF3E2', borderRadius: 12, padding: 12, marginTop: 16 },
    bannerText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, color: '#7A5B12' },
    statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 18, marginTop: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)' },
    statCell: { flex: 1, alignItems: 'center' },
    statDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: 'rgba(0,0,0,0.08)' },
    statValue: { fontFamily: fonts.sansBold, fontSize: 22, color: INK },
    statLabel: { fontFamily: fonts.sansSemiBold, fontSize: 9.5, letterSpacing: 0.8, color: MUTE, marginTop: 5 },
    newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 27, marginTop: 18 },
    newBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: '#FFFFFF' },
    linkRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    linkCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, alignItems: 'center', paddingVertical: 16, gap: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)' },
    linkText: { fontFamily: fonts.sansMedium, fontSize: 13, color: INK },
    section: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK, marginTop: 26, marginBottom: 10, letterSpacing: 0.2 },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, marginTop: 4 },
    postRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
    postIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    postBody: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: INK },
    postMeta: { fontFamily: fonts.sans, fontSize: 12, color: MUTE, marginTop: 3 },
});

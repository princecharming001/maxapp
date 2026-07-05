/**
 * CreatorFeedList — the creator updates feed body (posts fetch, likes,
 * comments via CommentSheet, locked-post rendering, video via CreatorVideo).
 * Extracted from CreatorFeedScreen so the exact same list renders standalone
 * (CreatorFeedScreen keeps its route + back chrome) AND embedded inside
 * CreatorMaxxHomeScreen's Updates tab.
 *
 * `embedded` drops the identity header + subscribe CTA (the parent owns that
 * chrome) but keeps every lock behavior: locked posts still render the
 * subscribe overlay, and subscribe taps route to CreatorPaywall.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';
import { hexA } from '../../utils/scheduleAggregation';
import PostCard, { type CreatorPost } from './PostCard';
import CommentSheet from './CommentSheet';

const INK = '#111113';
const MUTE = '#6B6B6B';

export default function CreatorFeedList({
    maxxId,
    embedded = false,
    onCreatorLoaded,
}: {
    maxxId: string;
    embedded?: boolean;
    /** Lets a standalone shell (CreatorFeedScreen) title its own top bar. */
    onCreatorLoaded?: (creator: any) => void;
}) {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [creator, setCreator] = useState<any>(null);
    const [posts, setPosts] = useState<CreatorPost[]>([]);
    const [access, setAccess] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [commentPost, setCommentPost] = useState<CreatorPost | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.getCreatorFeed(maxxId);
            setCreator(res.creator);
            setPosts(res.posts || []);
            setAccess(!!res.has_access);
            onCreatorLoaded?.(res.creator);
        } catch { /* keep */ }
        finally { setLoading(false); setRefreshing(false); }
    }, [maxxId, onCreatorLoaded]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const accent = creator?.accent_color || '#BC7A3C';

    const onLike = async (p: CreatorPost) => {
        // Optimistic, driven by the CURRENT row state (not the captured p) so
        // rapid double-taps stay consistent; count clamped at 0.
        let willLike = false;
        setPosts((prev) => prev.map((x) => {
            if (x.id !== p.id) return x;
            willLike = !x.liked;
            return { ...x, liked: willLike, like_count: Math.max(0, x.like_count + (willLike ? 1 : -1)) };
        }));
        try {
            if (willLike) await api.likeCreatorPost(p.id);
            else await api.unlikeCreatorPost(p.id);
        } catch {
            void load(); // reconcile on failure
        }
    };

    const goSubscribe = () => nav.navigate('CreatorPaywall', { maxxId });

    // Standalone mode only — embedded parents own the identity/subscribe chrome.
    const header = !embedded && creator ? (
        <View style={s.header}>
            <View style={[s.avatarRing, { borderColor: accent }]}>
                {creator.avatar_url ? (
                    <ExpoImage source={{ uri: api.resolveAttachmentUrl(creator.avatar_url) }} style={s.avatar} contentFit="cover" />
                ) : (
                    <View style={[s.avatar, { backgroundColor: hexA(accent, 0.16), alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name={creator.icon || 'star'} size={26} color={accent} />
                    </View>
                )}
            </View>
            <View style={s.nameRow}>
                <Text style={s.name}>{creator.display_name}</Text>
                {creator.verified ? <Ionicons name="checkmark-circle" size={16} color={accent} /> : null}
            </View>
            {creator.tagline ? <Text style={s.tagline}>{creator.tagline}</Text> : null}
            <Text style={s.subs}>{creator.subscriber_count || 0} subscribers</Text>

            {!creator.is_owner && !access ? (
                <TouchableOpacity style={[s.subBtn, { backgroundColor: accent }]} onPress={goSubscribe} activeOpacity={0.85}>
                    <Text style={s.subBtnText}>Subscribe · ${((creator.price_cents || 0) / 100).toFixed(2)}/mo</Text>
                </TouchableOpacity>
            ) : creator.is_owner ? (
                <TouchableOpacity style={[s.subBtn, s.ownerBtn]} onPress={() => nav.navigate('CreatorStudio')} activeOpacity={0.85}>
                    <Text style={[s.subBtnText, { color: INK }]}>Open Studio</Text>
                </TouchableOpacity>
            ) : (
                <View style={s.subscribedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={accent} />
                    <Text style={[s.subscribedText, { color: accent }]}>Subscribed</Text>
                </View>
            )}

            {/* Course entry — always visible; locked lessons route to the paywall
                from inside the course screen itself. */}
            <TouchableOpacity
                style={s.courseBtn}
                onPress={() => nav.navigate('CreatorCourse', { maxxId })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open course"
            >
                <Ionicons name="book-outline" size={15} color={INK} />
                <Text style={s.courseBtnText}>Course</Text>
            </TouchableOpacity>
        </View>
    ) : null;

    return (
        <View style={{ flex: 1 }}>
            {loading ? (
                <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(p) => p.id}
                    ListHeaderComponent={header}
                    renderItem={({ item }) => (
                        <PostCard post={item} accent={accent} onLike={onLike} onComment={setCommentPost} onSubscribe={goSubscribe} />
                    )}
                    contentContainerStyle={{
                        paddingHorizontal: 18,
                        paddingTop: embedded ? 6 : 0,
                        paddingBottom: insets.bottom + 30,
                    }}
                    ListEmptyComponent={<Text style={s.empty}>No updates yet.</Text>}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
                    showsVerticalScrollIndicator={false}
                />
            )}

            <CommentSheet
                visible={!!commentPost}
                postId={commentPost?.id ?? null}
                canComment={access}
                onClose={() => setCommentPost(null)}
                onCountChange={(delta) => {
                    if (!commentPost) return;
                    setPosts((prev) => prev.map((x) => x.id === commentPost.id
                        ? { ...x, comment_count: Math.max(0, x.comment_count + delta) } : x));
                }}
            />
        </View>
    );
}

const s = StyleSheet.create({
    header: { alignItems: 'center', paddingVertical: 18 },
    avatarRing: { width: 78, height: 78, borderRadius: 39, borderWidth: 2, padding: 3 },
    avatar: { width: '100%', height: '100%', borderRadius: 33 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
    name: { fontFamily: fonts.serif, fontSize: 24, color: INK },
    tagline: { fontFamily: fonts.sans, fontSize: 14.5, color: MUTE, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
    subs: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: MUTE, marginTop: 8 },
    subBtn: { marginTop: 16, paddingHorizontal: 22, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    ownerBtn: { backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
    subBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: '#FFFFFF' },
    subscribedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
    subscribedText: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
    courseBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12,
        paddingHorizontal: 18, height: 40, borderRadius: 999,
        backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)',
    },
    courseBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: INK },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 30 },
});

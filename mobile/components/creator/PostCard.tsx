/**
 * PostCard — one creator update in the feed. Video or text, like + comment,
 * pinned badge, and a locked overlay for non-subscribers (poster + teaser +
 * "Subscribe to watch").
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import CreatorVideo from './CreatorVideo';
import api from '../../services/api';
import { colors, fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';

export type CreatorPost = {
    id: string;
    type: 'video' | 'text';
    body: string;
    video_url?: string | null;
    poster_url?: string | null;
    duration_s?: number | null;
    pinned?: boolean;
    like_count: number;
    comment_count: number;
    liked?: boolean;
    locked?: boolean;
    created_at: string;
};

function timeAgo(iso: string): string {
    const d = new Date(iso).getTime();
    if (!d) return '';
    const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
    if (s < 60) return 'now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    return days < 7 ? `${days}d` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PostCard({
    post,
    accent = '#BC7A3C',
    onLike,
    onComment,
    onSubscribe,
}: {
    post: CreatorPost;
    accent?: string;
    onLike?: (p: CreatorPost) => void;
    onComment?: (p: CreatorPost) => void;
    onSubscribe?: () => void;
}) {
    const video = post.video_url ? api.resolveAttachmentUrl(post.video_url) : null;
    const poster = post.poster_url ? api.resolveAttachmentUrl(post.poster_url) : null;
    const locked = !!post.locked;

    return (
        <View style={styles.card}>
            {post.pinned ? (
                <View style={styles.pinRow}>
                    <Ionicons name="pin" size={12} color={accent} />
                    <Text style={[styles.pinText, { color: accent }]}>Pinned</Text>
                </View>
            ) : null}

            {post.type === 'video' ? (
                locked ? (
                    <View style={styles.lockedVideo}>
                        {poster ? <ExpoImage source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                        <View style={styles.lockedScrim} />
                        <View style={styles.lockedCenter}>
                            <Ionicons name="lock-closed" size={22} color="#FFFFFF" />
                            <TouchableOpacity style={[styles.subChip, { backgroundColor: accent }]} onPress={onSubscribe} activeOpacity={0.85}>
                                <Text style={styles.subChipText}>Subscribe to watch</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : video ? (
                    <CreatorVideo uri={video} poster={poster} />
                ) : null
            ) : null}

            {post.body ? (
                <Text style={[styles.body, post.type === 'video' && { marginTop: 12 }]}>{post.body}</Text>
            ) : null}

            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.action}
                    onPress={() => (locked ? onSubscribe?.() : onLike?.(post))}
                    activeOpacity={0.7}
                    accessibilityLabel="Like"
                >
                    <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={20} color={post.liked ? '#E0245E' : INK} />
                    <Text style={styles.actionCount}>{post.like_count || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.action}
                    onPress={() => (locked ? onSubscribe?.() : onComment?.(post))}
                    activeOpacity={0.7}
                    accessibilityLabel="Comments"
                >
                    <Ionicons name="chatbubble-outline" size={19} color={INK} />
                    <Text style={styles.actionCount}>{post.comment_count || 0}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderCurve: 'continuous',
        padding: 14,
        marginBottom: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.06)',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }
            : { elevation: 2 }),
    },
    pinRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
    pinText: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.4 },
    lockedVideo: { height: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111113' },
    lockedScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,17,19,0.5)' },
    lockedCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14 },
    subChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
    subChipText: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: '#FFFFFF' },
    body: { fontFamily: fonts.sans, fontSize: 15, color: INK, lineHeight: 21 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionCount: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: INK },
    time: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE },
});

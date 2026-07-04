/**
 * PostCommentsManagerScreen — a creator moderates the comments on one of their
 * posts: pin, delete, or block the commenter. Shows hidden (auto-reported)
 * comments too so the creator can act.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F5F5F5';

export default function PostCommentsManagerScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const postId: string = route.params?.postId;
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await api.getPostCommentsForManage(postId);
            setComments(res.comments || []);
        } catch { /* keep */ }
        finally { setLoading(false); }
    }, [postId]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const del = (c: any) => Alert.alert('Delete comment?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            try { await api.deleteCreatorComment(c.id); setComments((p) => p.filter((x) => x.id !== c.id)); } catch { /* */ }
        } },
    ]);

    const pin = async (c: any) => {
        try { await api.pinCreatorComment(c.id); void load(); } catch { /* */ }
    };

    const block = (c: any) => Alert.alert('Block this user?', 'They won’t be able to comment on your posts.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: async () => {
            try { await api.blockCreatorUser(c.author_id); void load(); } catch { /* */ }
        } },
    ]);

    const renderItem = ({ item }: { item: any }) => (
        <View style={[s.row, item.status === 'hidden' && s.hidden]}>
            <View style={{ flex: 1 }}>
                <View style={s.head}>
                    {item.pinned ? <Ionicons name="pin" size={11} color={MUTE} /> : null}
                    <Text style={s.author}>{item.author_name}</Text>
                    {item.status === 'hidden' ? <Text style={s.flag}>reported</Text> : null}
                </View>
                <Text style={s.body}>{item.body}</Text>
            </View>
            <View style={s.actions}>
                <TouchableOpacity hitSlop={8} onPress={() => pin(item)} accessibilityLabel="Pin"><Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={17} color={MUTE} /></TouchableOpacity>
                <TouchableOpacity hitSlop={8} onPress={() => del(item)} accessibilityLabel="Delete"><Ionicons name="trash-outline" size={17} color={MUTE} /></TouchableOpacity>
                <TouchableOpacity hitSlop={8} onPress={() => block(item)} accessibilityLabel="Block"><Ionicons name="ban-outline" size={17} color="#C0452C" /></TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Comments</Text>
                <View style={{ width: 32 }} />
            </View>
            {loading ? (
                <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={comments}
                    keyExtractor={(c) => c.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 20 }}
                    ListEmptyComponent={<Text style={s.empty}>No comments yet.</Text>}
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
    topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.sansSemiBold, fontSize: 16, color: INK },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
    hidden: { opacity: 0.6 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
    author: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK },
    flag: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: '#C0452C', marginLeft: 4 },
    body: { fontFamily: fonts.sans, fontSize: 14.5, color: INK, lineHeight: 20 },
    actions: { flexDirection: 'row', gap: 14, paddingTop: 2 },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 30 },
});

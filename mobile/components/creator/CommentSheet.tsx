/**
 * CommentSheet — comments on a creator post. Slide-up CREAM sheet (editorial
 * pattern), newest-first list, an inline composer, and per-comment actions:
 * delete (own), report (others). Meets Apple's UGC bar (report + the block is
 * handled creator-side).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
    Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';
const CREAM = '#F1F1EF';
const HAIR = 'rgba(0,0,0,0.08)';

type Comment = {
    id: string; body: string; pinned?: boolean; own?: boolean;
    author_name: string; author_id: string; created_at: string;
};

export default function CommentSheet({
    visible,
    postId,
    canComment,
    onClose,
    onCountChange,
}: {
    visible: boolean;
    postId: string | null;
    canComment: boolean;
    onClose: () => void;
    onCountChange?: (delta: number) => void;
}) {
    const insets = useSafeAreaInsets();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const load = useCallback(async () => {
        if (!postId) return;
        setLoading(true);
        try {
            const res = await api.getCreatorPostComments(postId);
            setComments(res.comments || []);
        } catch { /* keep prior */ }
        finally { setLoading(false); }
    }, [postId]);

    useEffect(() => {
        if (visible && postId) { setComments([]); void load(); }
    }, [visible, postId, load]);

    const send = async () => {
        const body = text.trim();
        if (!body || !postId || sending) return;
        setSending(true);
        try {
            const created = await api.addCreatorComment(postId, body);
            setComments((prev) => [created, ...prev]);
            setText('');
            onCountChange?.(1);
        } catch (e: any) {
            Alert.alert('Could not post', e?.response?.data?.detail || 'Try again.');
        } finally {
            setSending(false);
        }
    };

    const remove = (c: Comment) => {
        Alert.alert('Delete comment?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        await api.deleteCreatorComment(c.id);
                        setComments((prev) => prev.filter((x) => x.id !== c.id));
                        onCountChange?.(-1);
                    } catch { /* ignore */ }
                },
            },
        ]);
    };

    const report = (c: Comment) => {
        Alert.alert('Report this comment?', 'Our team will review it.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Report', style: 'destructive', onPress: async () => {
                    try {
                        const res = await api.reportCreatorComment(c.id);
                        Alert.alert('Thanks', res.message || 'Reported.');
                    } catch { /* ignore */ }
                },
            },
        ]);
    };

    const renderItem = ({ item }: { item: Comment }) => (
        <View style={s.row}>
            <View style={{ flex: 1 }}>
                <View style={s.rowHead}>
                    {item.pinned ? <Ionicons name="pin" size={11} color={MUTE} /> : null}
                    <Text style={s.author}>{item.author_name}</Text>
                </View>
                <Text style={s.body}>{item.body}</Text>
            </View>
            <TouchableOpacity
                hitSlop={10}
                onPress={() => (item.own ? remove(item) : report(item))}
                accessibilityLabel={item.own ? 'Delete' : 'Report'}
            >
                <Ionicons name={item.own ? 'trash-outline' : 'flag-outline'} size={16} color={MUTE} />
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={[s.sheet, { paddingBottom: insets.bottom + 10 }]}>
                        <View style={s.grabber} />
                        <Text style={s.title}>Comments</Text>
                        {loading && comments.length === 0 ? (
                            <ActivityIndicator color={INK} style={{ marginVertical: 30 }} />
                        ) : comments.length === 0 ? (
                            <Text style={s.empty}>Be the first to comment.</Text>
                        ) : (
                            <FlatList
                                data={comments}
                                keyExtractor={(c) => c.id}
                                renderItem={renderItem}
                                style={{ maxHeight: 380 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            />
                        )}
                        {canComment ? (
                            <View style={s.composer}>
                                <TextInput
                                    ref={inputRef}
                                    style={s.input}
                                    value={text}
                                    onChangeText={setText}
                                    placeholder="Add a comment…"
                                    placeholderTextColor={MUTE}
                                    multiline
                                    maxLength={1000}
                                />
                                <TouchableOpacity onPress={send} disabled={!text.trim() || sending} style={s.sendBtn} accessibilityLabel="Send">
                                    {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="arrow-up" size={18} color="#FFFFFF" />}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <Text style={s.locked}>Subscribe to join the conversation.</Text>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: CREAM, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 18, paddingTop: 10, maxHeight: '88%',
    },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)', marginBottom: 10 },
    title: { fontFamily: fonts.serif, fontSize: 22, color: INK, marginBottom: 8 },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginVertical: 26 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIR },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
    author: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK },
    body: { fontFamily: fonts.sans, fontSize: 14.5, color: INK, lineHeight: 20 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10 },
    input: {
        flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: '#FFFFFF', borderRadius: 22,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.sans, fontSize: 15, color: INK,
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
    locked: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: MUTE, textAlign: 'center', paddingVertical: 14 },
});

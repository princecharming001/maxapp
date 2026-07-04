/**
 * CourseEditorScreen — the creator edits their DB-backed course lessons
 * (module → ordered lessons; title + body + optional video). Publishing bumps
 * the course version so subscribers refetch.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
    ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F5F5F5';
const CREAM = '#F1F1EF';

type Lesson = {
    id?: string; module_number: number; sort: number; title: string;
    subtitle: string; body_md: string; status: string;
};

export default function CourseEditorScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Lesson | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.getMyCreatorLessons();
            setLessons(res.lessons || []);
        } catch { /* keep */ }
        finally { setLoading(false); }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const openNew = () => setEditing({
        module_number: 1, sort: lessons.length, title: '', subtitle: '', body_md: '', status: 'draft',
    });

    const save = async (publish: boolean) => {
        if (!editing || !editing.title.trim()) { Alert.alert('Add a title'); return; }
        setSaving(true);
        try {
            await api.upsertCreatorLesson({ ...editing, status: publish ? 'published' : 'draft' });
            setEditing(null);
            await load();
        } catch (e: any) {
            Alert.alert('Could not save', e?.response?.data?.detail || 'Try again.');
        } finally { setSaving(false); }
    };

    const del = (l: Lesson) => Alert.alert('Delete lesson?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            if (!l.id) return;
            try { await api.deleteCreatorLesson(l.id); await load(); } catch { /* */ }
        } },
    ]);

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Course</Text>
                <TouchableOpacity onPress={openNew} hitSlop={12} accessibilityLabel="Add lesson">
                    <Ionicons name="add" size={26} color={INK} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
                    {lessons.length === 0 ? (
                        <Text style={s.empty}>No lessons yet. Tap + to add your first.</Text>
                    ) : lessons.map((l) => (
                        <TouchableOpacity key={l.id} style={s.row} onPress={() => setEditing(l)} activeOpacity={0.7}>
                            <View style={s.num}><Text style={s.numText}>{l.module_number}.{l.sort + 1}</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.title} numberOfLines={1}>{l.title}</Text>
                                {l.subtitle ? <Text style={s.subtitle} numberOfLines={1}>{l.subtitle}</Text> : null}
                            </View>
                            <Text style={[s.status, l.status === 'published' && s.published]}>{l.status}</Text>
                            <TouchableOpacity hitSlop={8} onPress={() => del(l)} accessibilityLabel="Delete"><Ionicons name="trash-outline" size={16} color={MUTE} /></TouchableOpacity>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
                <View style={s.backdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
                            <View style={s.grabber} />
                            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                <TextInput style={s.fTitle} value={editing?.title} onChangeText={(t) => setEditing((e) => e && { ...e, title: t })} placeholder="Lesson title" placeholderTextColor={MUTE} maxLength={120} />
                                <TextInput style={s.fSub} value={editing?.subtitle} onChangeText={(t) => setEditing((e) => e && { ...e, subtitle: t })} placeholder="One-line summary" placeholderTextColor={MUTE} maxLength={200} />
                                <TextInput style={s.fBody} value={editing?.body_md} onChangeText={(t) => setEditing((e) => e && { ...e, body_md: t })} placeholder="Write the lesson… (markdown supported)" placeholderTextColor={MUTE} multiline maxLength={20000} />
                                <View style={s.modRow}>
                                    <Text style={s.modLabel}>Module</Text>
                                    <TextInput style={s.modInput} value={String(editing?.module_number ?? 1)} onChangeText={(t) => setEditing((e) => e && { ...e, module_number: parseInt(t || '1', 10) || 1 })} keyboardType="number-pad" maxLength={2} />
                                </View>
                            </ScrollView>
                            <View style={s.saveRow}>
                                <TouchableOpacity style={[s.saveBtn, s.draftBtn]} onPress={() => save(false)} disabled={saving} activeOpacity={0.85}>
                                    <Text style={s.draftText}>Save draft</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.saveBtn, s.pubBtn]} onPress={() => save(true)} disabled={saving} activeOpacity={0.85}>
                                    {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={s.pubText}>Publish</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 44 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: INK },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 40 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
    num: { width: 40, height: 32, borderRadius: 8, backgroundColor: '#F1F1EF', alignItems: 'center', justifyContent: 'center' },
    numText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: INK },
    title: { fontFamily: fonts.sansMedium, fontSize: 15, color: INK },
    subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2 },
    status: { fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: MUTE, textTransform: 'uppercase', letterSpacing: 0.4 },
    published: { color: '#2F9E60' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: CREAM, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, maxHeight: '90%' },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)', marginBottom: 12 },
    fTitle: { fontFamily: fonts.serif, fontSize: 22, color: INK, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
    fSub: { fontFamily: fonts.sans, fontSize: 15, color: INK, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
    fBody: { fontFamily: fonts.sans, fontSize: 15, color: INK, minHeight: 160, paddingTop: 12, lineHeight: 22 },
    modRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    modLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: INK },
    modInput: { width: 56, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: fonts.sansMedium, fontSize: 15, color: INK, textAlign: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.1)' },
    saveRow: { flexDirection: 'row', gap: 10, paddingTop: 12 },
    saveBtn: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
    draftBtn: { backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
    draftText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: INK },
    pubBtn: { backgroundColor: INK },
    pubText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#FFFFFF' },
});

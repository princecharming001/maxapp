/**
 * HabitsEditorScreen — the creator edits their daily program (2-8 habits).
 * All edits are LOCAL; a sticky "Save changes" bar PUTs the whole list
 * (server archives omitted rows, mints slugs for new ones, and regenerates
 * subscriber schedules). Mirrors CourseEditorScreen's bottom-sheet idioms.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
    ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api, { CreatorHabitInput, CreatorHabitRow } from '../../services/api';
import { fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F1F1EF';
const CREAM = '#F1F1EF';
const GOLD = '#B8860B';

const MAX_HABITS = 8;

const HABIT_ICONS = [
    'repeat-outline', 'sunny-outline', 'moon-outline', 'water-outline',
    'barbell-outline', 'leaf-outline', 'timer-outline', 'sparkles-outline',
] as const;

type Frequency = { type: 'daily' | 'n_per_week'; n?: number };
type Window = 'morning' | 'evening' | 'any';

/** Local editing row — `key` is a stable list key (server id or a local mint). */
type Habit = {
    key: string;
    id?: string;
    title: string;
    description: string;
    duration_minutes: number;
    frequency: Frequency;
    window: Window;
    icon?: string;
};

function fromServer(rows: CreatorHabitRow[]): Habit[] {
    return (rows || []).map((h) => ({
        key: h.id,
        id: h.id,
        title: h.title || '',
        description: h.description || '',
        duration_minutes: h.duration_minutes || 10,
        frequency: h.frequency?.type === 'n_per_week'
            ? { type: 'n_per_week', n: h.frequency.n || 1 }
            : { type: 'daily' },
        window: h.window === 'morning' || h.window === 'evening' ? h.window : 'any',
        icon: h.icon || undefined,
    }));
}

/** Comparable snapshot (drops local keys) for dirty detection. */
function snapshot(rows: Habit[]): string {
    return JSON.stringify(rows.map(({ key: _key, ...rest }) => rest));
}

function freqLabel(f: Frequency): string {
    return f.type === 'daily' ? 'daily' : `${f.n || 1}×/wk`;
}

export default function HabitsEditorScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [habits, setHabits] = useState<Habit[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const baselineRef = useRef<string>('[]');
    const mintRef = useRef(0);

    // Editor sheet (a COPY — "Save habit" applies it to the local list).
    const [editing, setEditing] = useState<Habit | null>(null);
    const [customN, setCustomN] = useState(2);
    const editBaselineRef = useRef<string>('');

    useEffect(() => {
        void (async () => {
            try {
                const res = await api.getMyCreatorHabits();
                const rows = fromServer(res.habits || []);
                setHabits(rows);
                baselineRef.current = snapshot(rows);
            } catch { /* keep empty — the creator can still draft locally */ }
            finally { setLoading(false); }
        })();
    }, []);

    const dirty = !loading && snapshot(habits) !== baselineRef.current;

    // ── List ops (all local) ─────────────────────────────────────────────
    const openEditor = (h: Habit) => {
        const copy = { ...h, frequency: { ...h.frequency } };
        editBaselineRef.current = JSON.stringify(copy);
        setCustomN(h.frequency.type === 'n_per_week' ? (h.frequency.n || 2) : 2);
        setEditing(copy);
    };

    const openNew = () => {
        if (habits.length >= MAX_HABITS) return;
        openEditor({
            key: `new-${++mintRef.current}`,
            title: '', description: '', duration_minutes: 10,
            frequency: { type: 'daily' }, window: 'any', icon: 'repeat-outline',
        });
    };

    const requestCloseEditor = () => {
        if (editing && JSON.stringify(editing) !== editBaselineRef.current) {
            Alert.alert('Discard changes?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => setEditing(null) },
            ]);
        } else {
            setEditing(null);
        }
    };

    const applyEditing = () => {
        if (!editing) return;
        if (!editing.title.trim()) { Alert.alert('Add a title'); return; }
        if (editing.duration_minutes < 2 || editing.duration_minutes > 90) {
            Alert.alert('Duration', 'Habits run 2–90 minutes.');
            return;
        }
        const row = { ...editing, title: editing.title.trim(), description: editing.description.trim() };
        setHabits((prev) => {
            const idx = prev.findIndex((h) => h.key === row.key);
            if (idx === -1) return [...prev, row];
            const next = [...prev];
            next[idx] = row;
            return next;
        });
        setEditing(null);
    };

    const removeEditing = () => {
        if (!editing) return;
        Alert.alert('Remove this habit?', 'It leaves the program when you save changes.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove', style: 'destructive',
                onPress: () => {
                    setHabits((prev) => prev.filter((h) => h.key !== editing.key));
                    setEditing(null);
                },
            },
        ]);
    };

    const move = (idx: number, dir: -1 | 1) => {
        const j = idx + dir;
        if (j < 0 || j >= habits.length) return;
        setHabits((prev) => {
            const next = [...prev];
            [next[idx], next[j]] = [next[j], next[idx]];
            return next;
        });
    };

    // ── Whole-list save ──────────────────────────────────────────────────
    const saveAll = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const payload: CreatorHabitInput[] = habits.map((h) => ({
                ...(h.id ? { id: h.id } : {}),
                title: h.title.trim(),
                description: h.description.trim(),
                duration_minutes: h.duration_minutes,
                frequency: h.frequency.type === 'daily'
                    ? { type: 'daily' }
                    : { type: 'n_per_week', n: h.frequency.n || 1 },
                window: h.window,
                ...(h.icon ? { icon: h.icon } : {}),
            }));
            const res = await api.putMyCreatorHabits(payload);
            if (Array.isArray(res?.habits)) {
                const rows = fromServer(res.habits);
                setHabits(rows);
                baselineRef.current = snapshot(rows);
            } else {
                baselineRef.current = snapshot(habits);
            }
            nav.goBack();
        } catch (e: any) {
            Alert.alert('Could not save', e?.response?.data?.detail || 'Try again.');
        } finally { setSaving(false); }
    };

    const requestBack = () => {
        if (dirty) {
            Alert.alert('Discard changes?', 'Your habit edits are not saved.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => nav.goBack() },
            ]);
        } else {
            nav.goBack();
        }
    };

    // ── Editor sheet frequency chips ─────────────────────────────────────
    const freq = editing?.frequency;
    const freqKey: 'daily' | 'n3' | 'n5' | 'custom' | null = !freq ? null
        : freq.type === 'daily' ? 'daily'
        : freq.n === 3 ? 'n3'
        : freq.n === 5 ? 'n5'
        : 'custom';

    const setFreq = (key: 'daily' | 'n3' | 'n5' | 'custom') => {
        setEditing((e) => e && {
            ...e,
            frequency: key === 'daily' ? { type: 'daily' }
                : key === 'n3' ? { type: 'n_per_week', n: 3 }
                : key === 'n5' ? { type: 'n_per_week', n: 5 }
                : { type: 'n_per_week', n: customN },
        });
    };

    const stepCustom = (dir: -1 | 1) => {
        const n = Math.min(7, Math.max(1, customN + dir));
        setCustomN(n);
        setEditing((e) => e && { ...e, frequency: { type: 'n_per_week', n } });
    };

    const banner = habits.length === 1
        ? 'A live max needs at least 2 habits.'
        : habits.length >= MAX_HABITS
            ? `Max ${MAX_HABITS} habits.`
            : null;

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={requestBack} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <View style={s.topCenter}>
                    <Text style={s.topTitle}>Habits</Text>
                    <Text style={s.topMeta}>{habits.length} of {MAX_HABITS}</Text>
                </View>
                <View style={s.topRight}>
                    <TouchableOpacity
                        onPress={openNew}
                        hitSlop={8}
                        disabled={habits.length >= MAX_HABITS}
                        style={habits.length >= MAX_HABITS && s.dim}
                        accessibilityLabel="Add habit"
                    >
                        <Ionicons name="add" size={26} color={INK} />
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + (dirty ? 120 : 40) }}
                    showsVerticalScrollIndicator={false}
                >
                    {banner ? (
                        <View style={s.banner}>
                            <Ionicons name="information-circle-outline" size={16} color={GOLD} />
                            <Text style={s.bannerText}>{banner}</Text>
                        </View>
                    ) : null}

                    {habits.length === 0 ? (
                        <View style={s.emptyWrap}>
                            <Ionicons name="repeat-outline" size={26} color={MUTE} />
                            <Text style={s.emptyTitle}>Define your daily program</Text>
                            <Text style={s.empty}>These 2-8 habits land on every member's schedule. Tap + to add the first one.</Text>
                        </View>
                    ) : habits.map((h, idx) => (
                        <TouchableOpacity key={h.key} style={s.row} onPress={() => openEditor(h)} activeOpacity={0.7}>
                            <View style={s.rowDisc}>
                                <Ionicons name={(h.icon || 'repeat-outline') as any} size={16} color={INK} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={s.rowTitle} numberOfLines={1}>{h.title || 'Untitled habit'}</Text>
                                <Text style={s.rowMeta} numberOfLines={1}>
                                    {h.duration_minutes}m · {freqLabel(h.frequency)}
                                    {h.window !== 'any' ? ` · ${h.window === 'morning' ? 'Morning' : 'Evening'}` : ''}
                                </Text>
                            </View>
                            <View style={s.reorderCol}>
                                <TouchableOpacity hitSlop={6} disabled={idx === 0} onPress={() => move(idx, -1)} style={idx === 0 && s.dim} accessibilityLabel="Move up">
                                    <Ionicons name="chevron-up" size={15} color={MUTE} />
                                </TouchableOpacity>
                                <TouchableOpacity hitSlop={6} disabled={idx === habits.length - 1} onPress={() => move(idx, 1)} style={idx === habits.length - 1 && s.dim} accessibilityLabel="Move down">
                                    <Ionicons name="chevron-down" size={15} color={MUTE} />
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    ))}

                    {habits.length > 0 ? (
                        <Text style={s.note}>Changes update member schedules automatically.</Text>
                    ) : null}
                </ScrollView>
            )}

            {/* Sticky save bar — appears only when the list differs from the server. */}
            {dirty && !editing ? (
                <View style={[s.saveBar, { paddingBottom: insets.bottom + 10 }]}>
                    <TouchableOpacity style={s.saveAllBtn} onPress={() => { void saveAll(); }} disabled={saving} activeOpacity={0.9}>
                        {saving
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : <Text style={s.saveAllText}>Save changes</Text>}
                    </TouchableOpacity>
                </View>
            ) : null}

            {/* ── Habit editor sheet ── */}
            <Modal visible={!!editing} transparent animationType="slide" onRequestClose={requestCloseEditor}>
                <View style={s.backdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={requestCloseEditor} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
                            <View style={s.grabber} />
                            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                <TextInput
                                    style={s.fTitle}
                                    value={editing?.title}
                                    onChangeText={(t) => setEditing((e) => e && { ...e, title: t })}
                                    placeholder="Habit title"
                                    placeholderTextColor={MUTE}
                                    maxLength={60}
                                />
                                <TextInput
                                    style={s.fSub}
                                    value={editing?.description}
                                    onChangeText={(t) => setEditing((e) => e && { ...e, description: t })}
                                    placeholder="What members do (optional)"
                                    placeholderTextColor={MUTE}
                                    maxLength={300}
                                />
                                <View style={s.modRow}>
                                    <Text style={s.modLabel}>Minutes</Text>
                                    <TextInput
                                        style={s.modInput}
                                        value={editing?.duration_minutes ? String(editing.duration_minutes) : ''}
                                        onChangeText={(t) => setEditing((e) => {
                                            if (!e) return e;
                                            const n = parseInt(t, 10);
                                            return { ...e, duration_minutes: Number.isFinite(n) ? n : 0 };
                                        })}
                                        keyboardType="number-pad"
                                        maxLength={2}
                                        placeholder="—"
                                        placeholderTextColor={MUTE}
                                    />
                                    <Text style={s.modHint}>2–90</Text>
                                </View>

                                <Text style={s.fieldLabel}>FREQUENCY</Text>
                                <View style={s.chipRow}>
                                    {([
                                        ['daily', 'Daily'],
                                        ['n3', '3×/week'],
                                        ['n5', '5×/week'],
                                        ['custom', 'Custom'],
                                    ] as const).map(([key, label]) => {
                                        const on = freqKey === key;
                                        return (
                                            <TouchableOpacity
                                                key={key}
                                                style={[s.chip, on && s.chipOn]}
                                                onPress={() => setFreq(key)}
                                                activeOpacity={0.8}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: on }}
                                            >
                                                <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {freqKey === 'custom' ? (
                                    <View style={s.stepperRow}>
                                        <TouchableOpacity style={s.stepBtn} onPress={() => stepCustom(-1)} hitSlop={6} accessibilityLabel="Fewer days">
                                            <Ionicons name="remove" size={16} color={INK} />
                                        </TouchableOpacity>
                                        <Text style={s.stepValue}>{customN}× per week</Text>
                                        <TouchableOpacity style={s.stepBtn} onPress={() => stepCustom(1)} hitSlop={6} accessibilityLabel="More days">
                                            <Ionicons name="add" size={16} color={INK} />
                                        </TouchableOpacity>
                                    </View>
                                ) : null}

                                <Text style={s.fieldLabel}>WINDOW</Text>
                                <View style={s.chipRow}>
                                    {([
                                        ['morning', 'Morning'],
                                        ['evening', 'Evening'],
                                        ['any', 'Anytime'],
                                    ] as const).map(([key, label]) => {
                                        const on = editing?.window === key;
                                        return (
                                            <TouchableOpacity
                                                key={key}
                                                style={[s.chip, on && s.chipOn]}
                                                onPress={() => setEditing((e) => e && { ...e, window: key })}
                                                activeOpacity={0.8}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: on }}
                                            >
                                                <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <Text style={s.fieldLabel}>ICON</Text>
                                <View style={s.iconRow}>
                                    {HABIT_ICONS.map((ic) => {
                                        const sel = (editing?.icon || 'repeat-outline') === ic;
                                        return (
                                            <TouchableOpacity key={ic} style={[s.iconDisc, sel && s.iconDiscSel]} onPress={() => setEditing((e) => e && { ...e, icon: ic })} activeOpacity={0.8} accessibilityLabel={ic}>
                                                <Ionicons name={ic} size={16} color={sel ? '#FFFFFF' : MUTE} />
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </ScrollView>
                            <TouchableOpacity style={s.saveHabitBtn} onPress={applyEditing} activeOpacity={0.85}>
                                <Text style={s.saveHabitText}>Save habit</Text>
                            </TouchableOpacity>
                            {editing && habits.some((h) => h.key === editing.key) ? (
                                <TouchableOpacity style={s.removeBtn} onPress={removeEditing} hitSlop={8}>
                                    <Text style={s.removeText}>Remove habit</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 48 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topCenter: { alignItems: 'center' },
    topTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: INK },
    topMeta: { fontFamily: fonts.sans, fontSize: 10.5, color: MUTE, marginTop: 1 },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    dim: { opacity: 0.3 },

    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FBF3E2', borderRadius: 12, padding: 12, marginTop: 8, marginBottom: 10 },
    bannerText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, color: '#7A5B12' },

    emptyWrap: { alignItems: 'center', marginTop: 56, paddingHorizontal: 12 },
    emptyTitle: { fontFamily: fonts.serif, fontSize: 22, color: INK, marginTop: 12 },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 8, lineHeight: 20 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
    rowDisc: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F1EF', alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: INK },
    rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2 },
    reorderCol: { alignItems: 'center', justifyContent: 'center', gap: 2 },

    note: { fontFamily: fonts.sans, fontSize: 12, color: MUTE, marginTop: 8, textAlign: 'center' },

    saveBar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        paddingHorizontal: 18, paddingTop: 12, backgroundColor: BG,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)',
    },
    saveAllBtn: { height: 52, borderRadius: 26, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
    saveAllText: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: '#FFFFFF' },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: CREAM, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, maxHeight: '90%' },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)', marginBottom: 12 },
    fTitle: { fontFamily: fonts.serif, fontSize: 22, color: INK, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
    fSub: { fontFamily: fonts.sans, fontSize: 15, color: INK, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
    modRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
    modLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: INK },
    modInput: { width: 56, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: fonts.sansMedium, fontSize: 15, color: INK, textAlign: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.1)' },
    modHint: { fontFamily: fonts.sans, fontSize: 12, color: MUTE },
    fieldLabel: { fontFamily: fonts.sansSemiBold, fontSize: 10.5, letterSpacing: 0.8, color: MUTE, marginTop: 18, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
    chipOn: { backgroundColor: INK, borderColor: INK },
    chipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: INK },
    chipTextOn: { color: '#FFFFFF', fontFamily: fonts.sansSemiBold },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
    stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
    stepValue: { fontFamily: fonts.sansMedium, fontSize: 14, color: INK },
    iconRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    iconDisc: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
    iconDiscSel: { backgroundColor: INK, borderColor: INK },
    saveHabitBtn: { height: 50, borderRadius: 25, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
    saveHabitText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#FFFFFF' },
    removeBtn: { alignSelf: 'center', paddingVertical: 10 },
    removeText: { fontFamily: fonts.sansMedium, fontSize: 13, color: '#B3402A' },
});

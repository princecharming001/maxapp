/**
 * "What Max knows about you" — the user-facing window into the hyper-
 * personalization profile (services/personalization on the backend).
 *
 * Shows everything Max has learned — from onboarding, from things you've told
 * the chat, and from Onairos — grouped by dimension (food, culture, work,
 * rhythm, how-Max-talks-to-you, …). The user can ADD anything ("i'm vegetarian",
 * "my family's Tamil", "talk to me straight") and REMOVE anything that's wrong.
 * Everything here flows straight into Max's coaching + your schedule.
 */
import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { PersonalizationProfile, PersonalMemory } from '../../services/api';
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';

type DimMeta = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; placeholder: string };

// Dimensions in the order they're offered + their friendly framing. Mirrors
// services/personalization.DIMENSIONS (minus the internal "misc" bucket, which
// still renders read-only under "Other" if the backend has anything there).
const DIMS: DimMeta[] = [
    { key: 'diet', label: 'Food & diet', icon: 'restaurant-outline', placeholder: 'vegetarian · love spicy food · no dairy' },
    { key: 'culture', label: 'Culture & background', icon: 'globe-outline', placeholder: 'Tamil family · speak Spanish' },
    { key: 'work', label: 'Work & schedule', icon: 'briefcase-outline', placeholder: 'nurse · night shifts downtown' },
    { key: 'lifestyle', label: 'Daily rhythm', icon: 'time-outline', placeholder: 'night owl · travel a lot' },
    { key: 'comms_style', label: 'How Max talks to you', icon: 'chatbubble-ellipses-outline', placeholder: 'blunt, skip the pep talk' },
    { key: 'goals', label: 'Goals', icon: 'flag-outline', placeholder: 'wedding in June' },
    { key: 'interests', label: 'Interests', icon: 'heart-outline', placeholder: 'climbing · specialty coffee' },
    { key: 'personality', label: 'Personality', icon: 'sparkles-outline', placeholder: 'competitive · hate strict routines' },
    { key: 'constraints', label: 'Health & limits', icon: 'medkit-outline', placeholder: 'bad knee · eczema' },
    { key: 'identity', label: 'About you', icon: 'person-outline', placeholder: '24 · he/him · SF' },
];
const DIM_LABEL: Record<string, string> = Object.fromEntries(DIMS.map((d) => [d.key, d.label]));

const norm = (s: any) => String(s ?? '').trim().toLowerCase();

/** Flatten a profile dimension dict into display strings (for read-only chips). */
function flattenDim(obj: Record<string, any> | undefined): string[] {
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj || {})) {
        if (v === null || v === undefined || v === '') continue;
        if (Array.isArray(v)) v.forEach((x) => out.push(String(x)));
        else if (typeof v === 'object') Object.keys(v).forEach((kk) => out.push(kk));
        else out.push(k === 'notes' || k === 'signals' ? String(v) : String(v));
    }
    // de-dupe, drop empties
    const seen = new Set<string>();
    return out.filter((s) => s && !seen.has(norm(s)) && seen.add(norm(s)));
}

export default function PersonalizationScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [data, setData] = useState<PersonalizationProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addDim, setAddDim] = useState<string>('diet');
    const [addText, setAddText] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            setError(null);
            const d = await api.getPersonalizationProfile();
            setData(d);
        } catch (e: any) {
            setError('Could not load your profile. Check your connection.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const addFact = useCallback(async () => {
        const text = addText.trim();
        if (!text || saving) return;
        setSaving(true);
        try {
            await api.rememberFact({ dimension: addDim, text });
            setAddText('');
            await load();
        } catch {
            setError('Could not save that. Try again.');
        } finally {
            setSaving(false);
        }
    }, [addText, addDim, saving, load]);

    const removeFact = useCallback(async (m: PersonalMemory) => {
        // optimistic
        setData((prev) => prev ? {
            ...prev,
            memories: prev.memories.filter((x) => x.id !== m.id),
            memories_by_dimension: Object.fromEntries(
                Object.entries(prev.memories_by_dimension).map(([k, v]) => [k, v.filter((x) => x.id !== m.id)]),
            ),
        } : prev);
        try { await api.forgetMemory(m.id); } catch { /* reload will resync */ }
        load();
    }, [load]);

    const profile = data?.profile || {};
    const memsByDim = data?.memories_by_dimension || {};

    // Which dimensions actually have something to show.
    const shownDims = DIMS.filter((d) => (memsByDim[d.key]?.length || 0) > 0 || flattenDim(profile[d.key]).length > 0);

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>What Max knows</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
                <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
                    <Text style={styles.intro}>
                        This is what makes Max's coaching yours. Add anything about your life,
                        and remove anything that's off.
                    </Text>

                    {loading ? (
                        <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
                    ) : error ? (
                        <Text style={styles.error}>{error}</Text>
                    ) : (
                        <>
                            {/* Add composer */}
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Tell Max something</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dimRow}>
                                    {DIMS.map((d) => {
                                        const on = addDim === d.key;
                                        return (
                                            <TouchableOpacity key={d.key} onPress={() => setAddDim(d.key)} activeOpacity={0.8}
                                                style={[styles.dimChip, on && styles.dimChipOn]}>
                                                <Ionicons name={d.icon} size={13} color={on ? colors.background : colors.textSecondary} />
                                                <Text style={[styles.dimChipText, on && styles.dimChipTextOn]}>{d.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        style={styles.input}
                                        value={addText}
                                        onChangeText={setAddText}
                                        placeholder={DIMS.find((d) => d.key === addDim)?.placeholder}
                                        placeholderTextColor={colors.textMuted}
                                        onSubmitEditing={addFact}
                                        returnKeyType="done"
                                    />
                                    <TouchableOpacity onPress={addFact} disabled={!addText.trim() || saving}
                                        style={[styles.addBtn, (!addText.trim() || saving) && { opacity: 0.4 }]}>
                                        {saving ? <ActivityIndicator color={colors.background} size="small" />
                                            : <Ionicons name="arrow-up" size={18} color={colors.background} />}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {shownDims.length === 0 ? (
                                <Text style={styles.empty}>
                                    Max doesn't know much yet. Tell it anything above, or just chat —
                                    it remembers what you share.
                                </Text>
                            ) : null}

                            {shownDims.map((d) => {
                                const mems = memsByDim[d.key] || [];
                                const memTexts = new Set(mems.map((m) => norm(m.text)));
                                const derived = flattenDim(profile[d.key]).filter((s) => !memTexts.has(norm(s)));
                                return (
                                    <View key={d.key} style={styles.card}>
                                        <View style={styles.cardHead}>
                                            <Ionicons name={d.icon} size={16} color={colors.foreground} />
                                            <Text style={styles.cardTitle}>{d.label}</Text>
                                        </View>
                                        <View style={styles.chipWrap}>
                                            {mems.map((m) => (
                                                <TouchableOpacity key={m.id} onPress={() => removeFact(m)} activeOpacity={0.7} style={styles.factChip}>
                                                    <Text style={styles.factChipText}>{m.text}</Text>
                                                    <Ionicons name="close" size={13} color={colors.textSecondary} />
                                                </TouchableOpacity>
                                            ))}
                                            {derived.map((s, i) => (
                                                <View key={`d-${i}`} style={styles.derivedChip}>
                                                    <Text style={styles.derivedChipText}>{s}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                );
                            })}

                            <Text style={styles.foot}>
                                Solid chips are things you told Max (tap to remove). Faded chips are
                                learned from your setup and connected apps.
                            </Text>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    backBtn: { width: 24, alignItems: 'flex-start' },
    headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.foreground, letterSpacing: -0.3 },
    intro: { fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
    error: { fontFamily: fonts.sans, fontSize: 14, color: '#C0452C', marginTop: 24 },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 4, marginBottom: 8 },
    card: {
        backgroundColor: colors.surfaceLight,
        borderRadius: borderRadius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground, marginBottom: 4 },
    dimRow: { gap: 8, paddingVertical: 8, paddingRight: 8 },
    dimChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    dimChipOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
    dimChipText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary },
    dimChipTextOn: { color: colors.background },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    input: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: borderRadius.md,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        fontFamily: fonts.sans, fontSize: 14.5, color: colors.foreground,
    },
    addBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: colors.foreground, alignItems: 'center', justifyContent: 'center',
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    factChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingLeft: 12, paddingRight: 9, paddingVertical: 8,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    factChipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.foreground },
    derivedChip: {
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: borderRadius.full,
        backgroundColor: 'transparent',
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    derivedChipText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
    foot: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 4 },
});

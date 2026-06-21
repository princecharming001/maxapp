/**
 * Inline habit picker rendered in chat right after a max's schedule is built.
 *
 * Backend protocol — ChatResponse.input_widget on the server:
 *   { type: "habit_picker", maxx_id: "skinmax", schedule_id: "<uuid>",
 *     label: "Tune your Skinmax plan" }
 *
 * The chips themselves come from the local catalog (data/habitCatalog.ts) keyed
 * by maxx_id — the backend payload stays minimal. Each chip is TRI-STATE: tap
 * cycles neutral → want (keep it) → skip (don't schedule it) → neutral. On
 * submit we hand back two catalog-id lists; the caller POSTs them to
 * /schedules/{schedule_id}/habit-prefs, which writes them to schedule_context
 * and re-expands just this max.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme/dark';
import { HABIT_CATALOG, type Habit } from '../data/habitCatalog';

export interface HabitPickerSpec {
    type: 'habit_picker';
    maxx_id: string;
    schedule_id?: string;
    label?: string;
}

type HabitState = 'want';

interface Props {
    spec: HabitPickerSpec;
    onSubmit: (wanted: string[], avoided: string[]) => void;
    onSkip?: () => void;
    disabled?: boolean;
}

export default function ChatHabitPicker({ spec, onSubmit, onSkip, disabled }: Props) {
    const [prefs, setPrefs] = useState<Record<string, HabitState>>({});

    // Group the max's habits by focus area, preserving catalog order.
    const groups = useMemo(() => {
        const list = HABIT_CATALOG[spec.maxx_id] ?? [];
        const order: string[] = [];
        const byArea: Record<string, Habit[]> = {};
        for (const h of list) {
            if (!byArea[h.area]) { byArea[h.area] = []; order.push(h.area); }
            byArea[h.area].push(h);
        }
        return order.map((area) => ({ area, habits: byArea[area] }));
    }, [spec.maxx_id]);

    const toggle = (id: string) => {
        if (disabled) return;
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        setPrefs((p) => {
            const next = { ...p };
            if (next[id]) {
                delete next[id];
            } else {
                next[id] = 'want';
            }
            return next;
        });
    };

    const submit = () => {
        if (disabled) return;
        const wanted = Object.keys(prefs).filter((k) => prefs[k] === 'want');
        onSubmit(wanted, []);
    };

    const count = Object.keys(prefs).length;

    if (groups.length === 0) return null;

    return (
        <View style={styles.container}>
            {spec.label ? <Text style={styles.label}>{spec.label}</Text> : null}
            <Text style={styles.subtitle}>Select all that apply</Text>

            {groups.map((g) => (
                <View key={g.area} style={styles.group}>
                    <Text style={styles.area}>{g.area}</Text>
                    <View style={styles.wrap}>
                        {g.habits.map((h) => {
                            const want = prefs[h.id] === 'want';
                            return (
                                <Pressable
                                    key={h.id}
                                    onPress={() => toggle(h.id)}
                                    disabled={disabled}
                                    style={[styles.chip, want && styles.chipWant]}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${h.label}${want ? ', selected' : ''}`}
                                >
                                    {want ? <Ionicons name="checkmark" size={13} color={colors.buttonText} style={styles.chipIcon} /> : null}
                                    <Text style={[styles.chipText, want && styles.chipTextWant]}>
                                        {h.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            ))}

            <Pressable
                onPress={submit}
                disabled={disabled}
                style={({ pressed }) => [styles.submit, disabled && styles.submitDisabled, pressed && !disabled && styles.submitPressed]}
                accessibilityRole="button"
                accessibilityLabel="Apply habits"
            >
                <Text style={styles.submitText}>{count > 0 ? `Apply ${count}` : 'Looks good'}</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.buttonText} />
            </Pressable>

            {onSkip ? (
                <Pressable onPress={onSkip} disabled={disabled} hitSlop={8} style={styles.skip}>
                    <Text style={styles.skipText}>Skip for now</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: spacing.xs,
        marginBottom: spacing.sm,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.md,
        gap: 8,
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    label: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        color: colors.foreground,
        letterSpacing: 0.1,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: fonts.sans,
        fontSize: 11.5,
        color: colors.textMuted,
        textAlign: 'center',
        marginBottom: 2,
    },

    group: { gap: 6 },
    area: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: colors.textMuted,
    },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    chipWant: { backgroundColor: colors.foreground, borderColor: colors.foreground },
    chipIcon: { marginRight: 4 },
    chipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textPrimary },
    chipTextWant: { color: colors.buttonText },

    submit: {
        marginTop: 6,
        paddingVertical: 10,
        paddingHorizontal: spacing.lg,
        borderRadius: 999,
        backgroundColor: colors.foreground,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        alignSelf: 'center',
        minWidth: 150,
    },
    submitPressed: { opacity: 0.7 },
    submitDisabled: { opacity: 0.35 },
    submitText: { color: colors.buttonText, fontFamily: fonts.sansSemiBold, fontSize: 13.5, letterSpacing: 0.3 },

    skip: { alignSelf: 'center', paddingVertical: 4 },
    skipText: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
});

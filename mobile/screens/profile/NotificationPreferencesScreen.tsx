/**
 * Settings → Notifications (reached when notifications are allowed).
 *
 * Per-category toggles backed by GET/PATCH /notifications/category-prefs. The
 * server owns the list — every category it returns renders (known ones with
 * friendly labels, grouped; newer ones under a humanized key), see
 * lib/notificationPrefs. Essential task reminders are not mutable here: they
 * ARE the plan, and the OS switch is their off button, so the screen says so
 * and links to iOS Settings instead of faking a toggle.
 */
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/InAppAlert';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { enableIosPushFromUserTap } from '../../services/registerIosPushToken';
import { useNotificationPermission } from '../../hooks/useNotificationPermission';
import { groupCategoryPrefs, type NotificationCategoryPrefs } from '../../lib/notificationPrefs';
import { userFacingError } from '../../lib/userFacingError';
import { colors, fonts, spacing } from '../../theme/dark';

const PREFS_QK = ['notifications', 'categoryPrefs'] as const;
type PrefsData = { prefs: NotificationCategoryPrefs };

const TASK_REMINDERS_HINT =
    'a ping at each task’s time. to stop these, turn notifications off in iOS Settings.';

export default function NotificationPreferencesScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const { user } = useAuth();
    const { state: permission, refresh: refreshPermission } = useNotificationPermission(Platform.OS === 'ios');
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [enabling, setEnabling] = useState(false);

    const prefsQ = useQuery({
        queryKey: PREFS_QK,
        queryFn: () => api.getNotificationCategoryPrefs(),
        staleTime: 60_000,
    });
    const groups = groupCategoryPrefs(prefsQ.data?.prefs ?? {});

    const setKey = (key: string, value: boolean) =>
        qc.setQueryData<PrefsData>(PREFS_QK, (old) => ({ prefs: { ...(old?.prefs ?? {}), [key]: value } }));

    const toggle = async (key: string, next: boolean) => {
        if (saving[key]) return;
        setKey(key, next); // optimistic — the switch answers instantly
        setSaving((m) => ({ ...m, [key]: true }));
        try {
            const res = await api.patchNotificationCategoryPrefs({ [key]: next });
            // Take the server's word for THIS key only, so a second toggle
            // still in flight isn't flickered back by this response.
            if (typeof res.prefs[key] === 'boolean') setKey(key, res.prefs[key]);
        } catch (e) {
            setKey(key, !next);
            Alert.alert('Couldn’t save that', userFacingError(e, 'Please try again.'));
        } finally {
            setSaving((m) => {
                const rest = { ...m };
                delete rest[key];
                return rest;
            });
        }
    };

    const openSystemSettings = () => {
        void Linking.openSettings().catch(() => undefined);
    };

    const turnOn = async () => {
        if (enabling) return;
        setEnabling(true);
        try {
            await enableIosPushFromUserTap(user?.id);
        } finally {
            setEnabling(false);
            void refreshPermission();
        }
    };

    const osOff = permission === 'denied' || permission === 'undetermined';

    return (
        <View style={st.container}>
            <View style={[st.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={st.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                >
                    <Ionicons name="arrow-back" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={st.headerTitle}>Notifications</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
                {osOff ? (
                    <View style={st.notice} testID="notification-prefs-os-off">
                        <Text style={st.noticeTitle}>notifications are off for max</Text>
                        <Text style={st.noticeBody}>
                            none of these will reach you until they{'’'}re back on.
                        </Text>
                        <TouchableOpacity
                            style={st.noticeBtn}
                            onPress={permission === 'undetermined' ? () => { void turnOn(); } : openSystemSettings}
                            disabled={enabling}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                        >
                            {enabling ? (
                                <ActivityIndicator size="small" color={colors.buttonText} />
                            ) : (
                                <Text style={st.noticeBtnText}>
                                    {permission === 'undetermined' ? 'turn on reminders' : 'turn on in settings'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                ) : null}

                <View style={st.section}>
                    <Text style={st.sectionLabel}>Always on</Text>
                    <TouchableOpacity
                        style={st.row}
                        onPress={openSystemSettings}
                        activeOpacity={0.5}
                        accessibilityRole="button"
                        accessibilityLabel="Task reminders, managed in iOS Settings"
                    >
                        <View style={st.rowBody}>
                            <Text style={st.rowLabel}>task reminders</Text>
                            <Text style={st.rowHint}>{TASK_REMINDERS_HINT}</Text>
                        </View>
                        <Ionicons name="open-outline" size={14} color={colors.textMuted} style={{ opacity: 0.5 }} />
                    </TouchableOpacity>
                </View>

                {prefsQ.isPending && !prefsQ.data ? (
                    <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xl }} />
                ) : prefsQ.isError && !prefsQ.data ? (
                    <View style={st.errorBox}>
                        <Text style={st.errorText}>couldn{'’'}t load your notification settings.</Text>
                        <TouchableOpacity onPress={() => { void prefsQ.refetch(); }} accessibilityRole="button" hitSlop={10}>
                            <Text style={st.retry}>try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    groups.map((g) => (
                        <View key={g.title} style={st.section}>
                            <Text style={st.sectionLabel}>{g.title}</Text>
                            {g.rows.map((r) => (
                                <View key={r.key} style={st.row}>
                                    <View style={st.rowBody}>
                                        <Text style={st.rowLabel}>{r.label}</Text>
                                    </View>
                                    <Switch
                                        value={r.enabled}
                                        onValueChange={(v) => { void toggle(r.key, v); }}
                                        disabled={!!saving[r.key]}
                                        trackColor={{ true: colors.foreground }}
                                        accessibilityLabel={r.label}
                                        testID={`notif-pref-${r.key}`}
                                    />
                                </View>
                            ))}
                        </View>
                    ))
                )}

                <View style={{ height: Platform.OS === 'ios' ? 56 : 40 }} />
            </ScrollView>
        </View>
    );
}

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
    },
    backBtn: { padding: spacing.xs, marginRight: spacing.sm },
    headerTitle: {
        flex: 1,
        fontFamily: fonts.serif,
        fontSize: 24,
        fontWeight: '400',
        letterSpacing: -0.4,
        color: colors.foreground,
    },

    scroll: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xxxl,
        maxWidth: 520,
        width: '100%',
        alignSelf: 'center',
    },

    notice: {
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: 18,
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceLight,
    },
    noticeTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground },
    noticeBody: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
    noticeBtn: {
        alignSelf: 'flex-start',
        marginTop: 12,
        backgroundColor: colors.foreground,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 9,
        minWidth: 140,
        alignItems: 'center',
    },
    noticeBtnText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.buttonText },

    /* Sections — no cards, just label + rows + divider (matches Settings) */
    section: { marginTop: spacing.lg + spacing.sm },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textMuted,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: spacing.xs,
        opacity: 0.7,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowLabel: { fontSize: 15, fontWeight: '400', color: colors.foreground },
    rowHint: { fontSize: 12, lineHeight: 17, fontWeight: '400', color: colors.textMuted, marginTop: 2 },

    errorBox: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm },
    errorText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary },
    retry: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground, textDecorationLine: 'underline' },
});

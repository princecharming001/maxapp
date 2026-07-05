import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Modal,
    Pressable,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { colors, spacing, borderRadius, typography } from '../../theme/dark';

type Application = {
    id: string;
    user_id: string;
    user_email: string | null;
    applicant_name: string;
    max_name: string;
    max_description: string;
    instagram_handle: string | null;
    tiktok_handle: string | null;
    social_stats: Record<string, any>;
    status: string;
    created_at: string | null;
};

type Filter = 'pending' | 'approved' | 'rejected';

const TIERS: { key: string; label: string; sub: string }[] = [
    { key: 'free', label: 'Free', sub: '$0 / mo' },
    { key: 't1', label: 'Tier 1', sub: '$4.99 / mo' },
    { key: 't2', label: 'Tier 2', sub: '$9.99 / mo' },
    { key: 't3', label: 'Tier 3', sub: '$19.99 / mo' },
    { key: 't4', label: 'Tier 4', sub: '$29.99 / mo' },
];

function followerLine(stats: Record<string, any>): string | null {
    const parts: string[] = [];
    for (const platform of ['instagram', 'tiktok']) {
        const s = stats?.[platform];
        if (s && typeof s.followers === 'number') {
            const n = s.followers;
            const compact = n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
            parts.push(`${platform === 'instagram' ? 'IG' : 'TT'} ${compact}${s.verified ? ' ✓' : ''}`);
        }
    }
    return parts.length ? parts.join('  ·  ') : null;
}

export default function AdminCreatorApprovalsScreen() {
    const [apps, setApps] = useState<Application[]>([]);
    const [filter, setFilter] = useState<Filter>('pending');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    // The application currently being approved (drives the tier-picker modal).
    const [tierFor, setTierFor] = useState<Application | null>(null);

    const load = useCallback(async (f: Filter) => {
        try {
            const data = await api.getAdminCreatorApplications(f, 0, 100);
            setApps(data.applications || []);
        } catch (e) {
            console.error(e);
            Alert.alert('Could not load', 'Failed to fetch creator applications.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load(filter);
        }, [filter, load]),
    );

    const onRefresh = () => {
        setRefreshing(true);
        load(filter);
    };

    const doApprove = async (app: Application, tier: string) => {
        setTierFor(null);
        setBusyId(app.id);
        try {
            const res = await api.approveCreatorApplication(app.id, tier);
            const creator = res?.creator;
            setApps((prev) => prev.filter((a) => a.id !== app.id));
            // Provisioned as "onboarding" — the creator now builds their max in
            // Studio and publishes/goes-live themselves. Offer a force-live
            // shortcut (skips Apple review) so it's testable immediately.
            Alert.alert(
                'Approved',
                `"${app.max_name}" is provisioned as ${creator?.maxx_id || 'a new max'} (status: onboarding). ${app.applicant_name} can now open the Studio and build it.`,
                [
                    { text: 'Done', style: 'cancel' },
                    creator?.id
                        ? {
                              text: 'Force live now',
                              onPress: () => forceLive(creator.id, app.max_name),
                          }
                        : undefined,
                ].filter(Boolean) as any,
            );
        } catch (e: any) {
            Alert.alert('Approve failed', e?.response?.data?.detail || e?.message || 'Try again.');
        } finally {
            setBusyId(null);
        }
    };

    const forceLive = async (creatorId: string, maxName: string) => {
        try {
            await api.setAdminCreatorStatus(creatorId, 'live');
            Alert.alert('Live', `"${maxName}" is live and now appears in the marketplace.`);
        } catch (e: any) {
            Alert.alert('Could not set live', e?.response?.data?.detail || e?.message || 'Try again.');
        }
    };

    const confirmReject = (app: Application) => {
        Alert.alert(
            'Reject application?',
            `Reject "${app.max_name}" from ${app.applicant_name}? They'll be notified.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: async () => {
                        setBusyId(app.id);
                        try {
                            await api.rejectCreatorApplication(app.id);
                            setApps((prev) => prev.filter((a) => a.id !== app.id));
                        } catch (e: any) {
                            Alert.alert('Reject failed', e?.response?.data?.detail || 'Try again.');
                        } finally {
                            setBusyId(null);
                        }
                    },
                },
            ],
        );
    };

    const renderItem = ({ item }: { item: Application }) => {
        const busy = busyId === item.id;
        const followers = followerLine(item.social_stats);
        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <Text style={styles.maxName} numberOfLines={2}>{item.max_name}</Text>
                    {item.created_at ? (
                        <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
                    ) : null}
                </View>
                <Text style={styles.applicant} numberOfLines={1}>
                    {item.applicant_name}
                    {item.user_email ? `  ·  ${item.user_email}` : ''}
                </Text>
                {item.max_description ? (
                    <Text style={styles.desc} numberOfLines={4}>{item.max_description}</Text>
                ) : null}
                <View style={styles.socialRow}>
                    {item.instagram_handle ? (
                        <View style={styles.handleChip}>
                            <Ionicons name="logo-instagram" size={13} color={colors.textSecondary} />
                            <Text style={styles.handleText}>@{item.instagram_handle}</Text>
                        </View>
                    ) : null}
                    {item.tiktok_handle ? (
                        <View style={styles.handleChip}>
                            <Ionicons name="logo-tiktok" size={13} color={colors.textSecondary} />
                            <Text style={styles.handleText}>@{item.tiktok_handle}</Text>
                        </View>
                    ) : null}
                    {followers ? <Text style={styles.followers}>{followers}</Text> : null}
                </View>

                {item.status === 'pending' ? (
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.btn, styles.btnGhost]}
                            onPress={() => confirmReject(item)}
                            disabled={busy}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.btnGhostText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.btn, styles.btnPrimary]}
                            onPress={() => setTierFor(item)}
                            disabled={busy}
                            activeOpacity={0.85}
                        >
                            {busy ? (
                                <ActivityIndicator size="small" color={colors.buttonText} />
                            ) : (
                                <Text style={styles.btnPrimaryText}>Approve</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={[styles.statusPill, item.status === 'approved' ? styles.statusApproved : styles.statusRejected]}>
                        <Text style={[styles.statusText, item.status === 'approved' ? styles.statusApprovedText : styles.statusRejectedText]}>
                            {item.status}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Creator applications</Text>
                <Text style={styles.subtitle}>Approve to provision the max · reject to decline</Text>
            </View>

            <View style={styles.tabs}>
                {(['pending', 'approved', 'rejected'] as Filter[]).map((f) => {
                    const on = filter === f;
                    return (
                        <TouchableOpacity
                            key={f}
                            style={[styles.tab, on && styles.tabOn]}
                            onPress={() => { setLoading(true); setFilter(f); }}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.tabText, on && styles.tabTextOn]}>{f}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.foreground} />
                </View>
            ) : (
                <FlatList
                    data={apps}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={<Text style={styles.empty}>No {filter} applications</Text>}
                />
            )}

            {/* Tier picker — shown when approving. */}
            <Modal visible={!!tierFor} transparent animationType="fade" onRequestClose={() => setTierFor(null)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setTierFor(null)}>
                    <Pressable style={styles.modalSheet} onPress={() => {}}>
                        <Text style={styles.modalTitle}>Set a price tier</Text>
                        <Text style={styles.modalSub} numberOfLines={2}>
                            {tierFor ? `for "${tierFor.max_name}"` : ''}
                        </Text>
                        {TIERS.map((t) => (
                            <TouchableOpacity
                                key={t.key}
                                style={styles.tierRow}
                                onPress={() => tierFor && doApprove(tierFor, t.key)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.tierLabel}>{t.label}</Text>
                                <Text style={styles.tierSub}>{t.sub}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.modalCancel} onPress={() => setTierFor(null)} activeOpacity={0.7}>
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    title: { ...typography.h2 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },

    tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: borderRadius.full, backgroundColor: colors.surface },
    tabOn: { backgroundColor: colors.foreground },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
    tabTextOn: { color: colors.buttonText },

    list: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
    maxName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
    date: { fontSize: 11, color: colors.textMuted },
    applicant: { fontSize: 12.5, color: colors.textSecondary, marginTop: 4 },
    desc: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 19 },
    socialRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    handleChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    handleText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
    followers: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    btn: { flex: 1, paddingVertical: 12, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
    btnPrimary: { backgroundColor: colors.foreground },
    btnPrimaryText: { color: colors.buttonText, fontWeight: '700', fontSize: 14 },
    btnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    btnGhostText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },

    statusPill: { alignSelf: 'flex-start', marginTop: spacing.md, paddingVertical: 4, paddingHorizontal: 12, borderRadius: borderRadius.full },
    statusApproved: { backgroundColor: 'rgba(47,158,96,0.12)' },
    statusRejected: { backgroundColor: 'rgba(192,69,44,0.12)' },
    statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
    statusApprovedText: { color: colors.success },
    statusRejectedText: { color: colors.error },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { textAlign: 'center', color: colors.textMuted, marginTop: 48, fontSize: 14 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: spacing.xl },
    modalSheet: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing.lg },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
    modalSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
    tierRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight,
    },
    tierLabel: { fontSize: 15, fontWeight: '600', color: colors.foreground },
    tierSub: { fontSize: 14, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    modalCancel: { marginTop: spacing.md, paddingVertical: 12, alignItems: 'center' },
    modalCancelText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});

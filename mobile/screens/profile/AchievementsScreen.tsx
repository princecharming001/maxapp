/**
 * AchievementsScreen — the badge wall.
 *
 * Endowed progress + collection mechanics: showing the full set (earned bright,
 * locked greyed with a progress arc) makes the next badge feel close and gives
 * the daily loop a second, slower reward surface beyond the streak. Grouped by
 * category, Craft aesthetic, custom SVG medallions.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { AchievementItem, AchievementsResponse } from '../../services/api';
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';
import AchievementBadge, { Tier } from '../../components/achievements/AchievementBadge';

const CATEGORY_LABEL: Record<string, string> = {
    consistency: 'Consistency',
    milestones: 'Milestones',
    progress: 'Progress',
    discovery: 'Discovery',
};
const CATEGORY_ORDER = ['consistency', 'milestones', 'progress', 'discovery'];

function BadgeCell({ a }: { a: AchievementItem }) {
    const sub = a.earned
        ? a.tier.charAt(0).toUpperCase() + a.tier.slice(1)
        : a.progress
            ? `${a.progress.current}/${a.progress.target}`
            : 'Locked';
    const progressFrac = a.progress ? a.progress.current / a.progress.target : null;
    return (
        <View style={styles.cell}>
            <AchievementBadge
                icon={a.icon}
                code={a.code}
                tier={a.tier as Tier}
                earned={a.earned}
                size={74}
                progress={progressFrac}
            />
            <Text style={[styles.cellTitle, !a.earned && styles.cellTitleLocked]} numberOfLines={2}>
                {a.title}
            </Text>
            <Text style={[styles.cellSub, a.earned && styles.cellSubEarned]}>{sub}</Text>
        </View>
    );
}

export default function AchievementsScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [data, setData] = useState<AchievementsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const d = await api.getAchievements();
            setData(d);
            // Any earned-but-unseen here have already been celebrated elsewhere;
            // mark them seen so the overlay never double-fires.
            const unseen = d.achievements.filter((a) => a.earned && !a.seen).map((a) => a.code);
            if (unseen.length) api.markAchievementsSeen(unseen).catch(() => {});
        } catch {
            /* keep prior data */
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const byCat = (cat: string) => (data?.achievements || []).filter((a) => a.category === cat);
    const earned = data?.earned_count ?? 0;
    const total = data?.total ?? 0;
    const frac = total ? earned / total : 0;

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Achievements</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
                {loading && !data ? (
                    <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        <View style={styles.summary}>
                            <Text style={styles.summaryNum}>
                                {earned}<Text style={styles.summaryDen}> / {total}</Text>
                            </Text>
                            <Text style={styles.summaryLabel}>badges earned</Text>
                            <View style={styles.track}>
                                <View style={[styles.fill, { width: `${Math.round(frac * 100)}%` }]} />
                            </View>
                        </View>

                        {CATEGORY_ORDER.map((cat) => {
                            const items = byCat(cat);
                            if (!items.length) return null;
                            return (
                                <View key={cat} style={styles.section}>
                                    <Text style={styles.sectionLabel}>{CATEGORY_LABEL[cat] || cat}</Text>
                                    <View style={styles.grid}>
                                        {items.map((a) => <BadgeCell key={a.code} a={a} />)}
                                    </View>
                                </View>
                            );
                        })}

                        <Text style={styles.foot}>
                            Every badge is for showing up — never for how you look. Keep going.
                        </Text>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    backBtn: { width: 24, alignItems: 'flex-start' },
    headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.foreground, letterSpacing: -0.3 },

    summary: { alignItems: 'center', marginBottom: spacing.xl, marginTop: spacing.sm },
    summaryNum: { fontFamily: fonts.sansSemiBold, fontSize: 46, color: colors.foreground, letterSpacing: -1.5 },
    summaryDen: { fontFamily: fonts.sansMedium, fontSize: 24, color: colors.textMuted, letterSpacing: -0.5 },
    summaryLabel: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary, letterSpacing: 0.4, marginTop: 2 },
    track: {
        width: '70%', height: 6, borderRadius: 3, backgroundColor: colors.surface,
        marginTop: 14, overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 3, backgroundColor: '#C9A24E' },

    section: { marginBottom: spacing.xl },
    sectionLabel: {
        fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1.4,
        textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.md,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '33.33%', alignItems: 'center', marginBottom: spacing.lg, paddingHorizontal: 4 },
    cellTitle: {
        fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.foreground,
        textAlign: 'center', marginTop: 8, lineHeight: 16,
    },
    cellTitleLocked: { color: colors.textSecondary },
    cellSub: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    cellSubEarned: { color: '#B58A1E', fontFamily: fonts.sansMedium },

    foot: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18, marginTop: spacing.sm },
});

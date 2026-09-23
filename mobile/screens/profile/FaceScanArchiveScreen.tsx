import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { CachedImage } from '../../components/CachedImage';
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// "2:00 AM today" / "tomorrow 5:00 PM" for the server's next_scan_allowed_at.
function formatNextScan(d: Date): string {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((d.getTime() - startOfToday.getTime()) / 86_400_000);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (dayDiff === 0) return `${time} today`;
    if (dayDiff === 1) return `${time} tomorrow`;
    return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} at ${time}`;
}

export default function FaceScanArchiveScreen() {
    const navigation = useNavigation<any>();
    const { isPremium } = useAuth();
    const [loading, setLoading] = useState(true);
    const [scans, setScans] = useState<any[]>([]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.getScanHistory().catch(() => ({ scans: [] }));
                setScans(res.scans || []);
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    const startNewScan = async () => {
        if (!isPremium) {
            Alert.alert(
                'Face scans',
                'Face scans are not available on Basic. Upgrade to Premium for daily scans.',
                [
                    { text: 'OK', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => navigation.navigate('ManageSubscription') },
                ],
            );
            return;
        }
        if (isPremium) {
            let latest: any;
            try {
                latest = await api.getLatestScan();
            } catch (err: any) {
                // A 404 means no prior scan — that's the legitimate first-scan
                // case, so let it through. Any other error (network/server) must
                // NOT fail open and bypass the one-per-day rule.
                if (err?.response?.status === 404) {
                    navigation.navigate('FaceScan', { source: 'archive' });
                    return;
                }
                Alert.alert('Could not check your scans', 'Check your connection and try again.');
                return;
            }
            // The SERVER decides (same rule the upload enforces: UTC day, failed
            // scans don't count). The local calendar-day check that lived here
            // disagreed with it — it blocked permitted scans after 4pm PST and
            // let through ones the upload then 429'd.
            if (latest && latest.can_scan_now === false) {
                const next = new Date(latest.next_scan_allowed_at ?? NaN);
                const when = Number.isNaN(next.getTime()) ? 'tomorrow' : `after ${formatNextScan(next)}`;
                Alert.alert('Face scans', `You already used today's face scan. Come back ${when}.`);
                return;
            }
        }
        navigation.navigate('FaceScan', { source: 'archive' });
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Face scans</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.foreground} />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Face scans</Text>
                <TouchableOpacity onPress={() => void startNewScan()} style={styles.backButton} activeOpacity={0.7}>
                    <Ionicons
                        name={isPremium ? 'add' : 'lock-closed'}
                        size={isPremium ? 24 : 20}
                        color={isPremium ? colors.foreground : colors.textMuted}
                    />
                </TouchableOpacity>
            </View>

            {scans.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="scan-outline" size={52} color={colors.textMuted} />
                    <Text style={styles.emptyText}>No face scans yet</Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => void startNewScan()} activeOpacity={0.8}>
                        <Text style={styles.primaryBtnText}>
                            {isPremium ? 'Do your first scan' : 'Upgrade to Premium'}
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                    <Text style={styles.hint}>
                        {isPremium
                            ? 'Premium: 1 three-photo scan per day.'
                            : 'Basic: one face scan, included at signup. No more scans on this plan.'}
                    </Text>
                    {scans.map((s) => {
                        const frontUri = api.resolveAttachmentUrl(s.front_image || s.images?.front);
                        return (
                            <TouchableOpacity
                                key={s.id}
                                style={styles.card}
                                onPress={() => navigation.navigate('FaceScanResults', { scanId: s.id })}
                                activeOpacity={0.85}
                            >
                                {frontUri ? (
                                    <CachedImage uri={frontUri} style={styles.thumb} resizeMode="cover" />
                                ) : (
                                    <View style={[styles.thumb, styles.thumbEmpty]}>
                                        <Ionicons name="person-outline" size={22} color={colors.textMuted} />
                                    </View>
                                )}
                                <View style={styles.cardBody}>
                                    <Text style={styles.cardTitle}>{formatDate(s.created_at)}</Text>
                                    <Text style={styles.cardSub}>overall {typeof s.overall_score === 'number' ? s.overall_score.toFixed(1) : '—'}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 56,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    headerTitle: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '400', color: colors.foreground },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
    emptyText: { marginTop: spacing.md, color: colors.foreground, fontSize: 15, fontWeight: '700' },
    primaryBtn: {
        marginTop: spacing.lg,
        backgroundColor: colors.foreground,
        paddingHorizontal: spacing.xl,
        paddingVertical: 12,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.foreground,
    },
    primaryBtnText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl },
    hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.md, textAlign: 'center' },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    thumb: {
        width: 56,
        height: 56,
        borderRadius: borderRadius.md,
        backgroundColor: colors.surface,
    },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    cardBody: { flex: 1 },
    cardTitle: { color: colors.foreground, fontSize: 15, fontWeight: '900' },
    cardSub: { marginTop: 4, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
});


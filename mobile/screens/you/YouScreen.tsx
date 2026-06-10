/**
 * You hub (spec 3.1) - the profile/progress home under the 4-tab nav.
 *
 * Glass list: Scan & Progress (archives + "New scan" CTA - the camera ask
 * happens THERE, never earlier), the ONE canonical Week view (pushes the
 * existing DayPlannerScreen), Purchases (entered programs w/ prices),
 * Settings, Manage subscription, Legal. Streak ring at the top.
 */
import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

type Row = {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    sub?: string;
    onPress: () => void;
};

function RowItem({ row, last }: { row: Row; last: boolean }) {
    return (
        <TouchableOpacity
            onPress={row.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            style={[styles.row, !last && styles.rowBorder]}
        >
            <View style={styles.rowIcon}>
                <Ionicons name={row.icon} size={19} color="#111113" />
            </View>
            <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9A9AA2" />
        </TouchableOpacity>
    );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <GlassCard radius={20}>
                <View style={styles.cardInner}>
                    {rows.map((row, i) => (
                        <RowItem key={row.label} row={row} last={i === rows.length - 1} />
                    ))}
                </View>
            </GlassCard>
        </View>
    );
}

export default function YouScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const { data: schedData } = useQuery({
        queryKey: ['activeSchedulesFull'],
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
    });
    const streak = schedData?.schedule_streak?.current ?? 0;

    const { data: market } = useQuery({
        queryKey: ['marketplaceBrowse'],
        queryFn: () => api.getMarketplace(),
        staleTime: 60_000,
    });
    const purchases = [
        ...(market?.maxxes ?? []),
        ...(market?.courses ?? []),
    ].filter((item: any) => item.entered);

    const firstName =
        (user as any)?.first_name || (user as any)?.username || 'you';

    return (
        <ScreenBackdrop>
            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingTop: insets.top + 24, paddingBottom: 48 + insets.bottom },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.kicker}>you</Text>
                <Text style={styles.title}>{firstName}</Text>

                <View style={styles.streakWrap}>
                    <GlassCard radius={20}>
                    <View style={styles.streakCard}>
                        <View style={styles.streakRing}>
                            <Text style={styles.streakNumber}>{streak}</Text>
                        </View>
                        <View style={styles.streakText}>
                            <Text style={styles.streakLabel}>day streak</Text>
                            <Text style={styles.streakSub}>
                                {streak > 0
                                    ? 'Showing up. That is the whole game.'
                                    : 'Close out today to start one.'}
                            </Text>
                        </View>
                    </View>
                    </GlassCard>
                </View>

                <Section
                    title="PROGRESS"
                    rows={[
                        {
                            icon: 'scan-outline',
                            label: 'New scan',
                            sub: 'Tunes your skin and jaw plan. Optional.',
                            onPress: () => navigation.navigate('FaceScan'),
                        },
                        {
                            icon: 'images-outline',
                            label: 'Scan archive',
                            onPress: () => navigation.navigate('FaceScanArchive'),
                        },
                        {
                            icon: 'trending-up-outline',
                            label: 'Progress photos',
                            onPress: () => navigation.navigate('ProgressArchive'),
                        },
                    ]}
                />

                <Section
                    title="PLAN"
                    rows={[
                        {
                            icon: 'calendar-outline',
                            label: 'Week view',
                            sub: 'Edit your week. One source of truth.',
                            onPress: () => navigation.navigate('DayPlanner'),
                        },
                    ]}
                />

                <Section
                    title="PURCHASES"
                    rows={
                        purchases.length
                            ? purchases.map((p: any) => ({
                                  icon: (p.icon as any) || 'pricetag-outline',
                                  label: p.title,
                                  sub: p.price_label,
                                  onPress: () =>
                                      navigation.navigate('Main', {
                                          screen: 'Explore',
                                          params: { itemId: p.id },
                                      }),
                              }))
                            : [
                                  {
                                      icon: 'compass-outline' as const,
                                      label: 'No programs yet',
                                      sub: 'Pick your programs in Explore.',
                                      onPress: () =>
                                          navigation.navigate('Main', { screen: 'Explore' }),
                                  },
                              ]
                    }
                />

                <Section
                    title="ACCOUNT"
                    rows={[
                        {
                            icon: 'settings-outline',
                            label: 'Settings',
                            onPress: () => navigation.navigate('Settings'),
                        },
                        {
                            icon: 'card-outline',
                            label: 'Manage subscription',
                            onPress: () => navigation.navigate('ManageSubscription'),
                        },
                        {
                            icon: 'document-text-outline',
                            label: 'Privacy policy',
                            onPress: () =>
                                navigation.navigate('LegalDocument', { doc: 'privacy' }),
                        },
                        {
                            icon: 'reader-outline',
                            label: 'Terms of service',
                            onPress: () =>
                                navigation.navigate('LegalDocument', { doc: 'terms' }),
                        },
                    ]}
                />
            </ScrollView>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20 },
    kicker: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 12,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: '#9A9AA2',
    },
    title: {
        fontFamily: 'PlayfairDisplay-Regular',
        fontSize: 40,
        color: '#111113',
        marginTop: 2,
    },
    streakWrap: { marginTop: 16 },
    streakCard: { flexDirection: 'row', alignItems: 'center', padding: 18 },
    streakRing: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 3,
        borderColor: '#D4A017',
        alignItems: 'center',
        justifyContent: 'center',
    },
    streakNumber: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 20,
        color: '#111113',
    },
    streakText: { marginLeft: 14, flex: 1 },
    streakLabel: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: '#111113',
    },
    streakSub: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    section: { marginTop: 24 },
    sectionTitle: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 11,
        letterSpacing: 1.6,
        color: '#9A9AA2',
        marginBottom: 8,
        marginLeft: 4,
    },
    cardInner: { paddingHorizontal: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 12,
        minHeight: 44,
    },
    rowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(17,17,19,0.08)',
    },
    rowIcon: { width: 28, alignItems: 'center' },
    rowText: { flex: 1, marginLeft: 10 },
    rowLabel: {
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: '#111113',
    },
    rowSub: {
        fontFamily: 'Matter-Regular',
        fontSize: 12,
        color: '#6B7280',
        marginTop: 1,
    },
});

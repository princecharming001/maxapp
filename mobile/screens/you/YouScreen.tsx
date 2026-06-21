/**
 * You hub (spec 3.1) - the profile/progress home under the 4-tab nav.
 *
 * Glass list: Scan & Progress (archives + "New scan" CTA - the camera ask
 * happens THERE, never earlier), the ONE canonical Week view (pushes the
 * existing DayPlannerScreen), Purchases (entered programs w/ prices),
 * Settings, Manage subscription, Legal. Streak ring at the top.
 */
import React, { useState, useMemo, useCallback } from 'react';
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
import { CachedImage } from '../../components/CachedImage';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { useFlag } from '../../constants/featureFlags';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryClient';
import api from '../../services/api';

const CAL_INK = '#111113';
const CAL_ON_INK = '#FFFFFF';
const CAL_MUTE = '#9A9A9A';
const CAL_TRACK = '#E4E3E0';
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseScanPoints(raw: any): { score: number; at?: string }[] {
    const list = raw?.scans ?? raw?.history ?? (Array.isArray(raw) ? raw : []) ?? [];
    return (list as any[])
        .map((s: any) => {
            const score = Number(
                s?.overall_score ?? s?.rating ?? s?.score ?? s?.analysis?.psl_rating?.appeal ?? s?.psl_rating?.appeal,
            );
            return Number.isFinite(score) ? { score, at: s?.created_at as string | undefined } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()) as { score: number; at?: string }[];
}

function ProgressCalendar({
    progressPhotos,
    scanPts,
    onPhotoPress,
    onScanDay,
}: {
    progressPhotos: any[];
    scanPts: { score: number; at?: string }[];
    onPhotoPress: (photo: any) => void;
    onScanDay: () => void;
}) {
    const today = useMemo(() => new Date(), []);
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());

    const goBack = useCallback(() => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    }, [viewMonth]);

    const goForward = useCallback(() => {
        if (viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())) return;
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    }, [viewMonth, viewYear, today]);

    const isFuture = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth());

    const photoByDate = useMemo(() => {
        const map: Record<string, any> = {};
        progressPhotos.forEach(ph => {
            if (ph.created_at) {
                const d = ph.created_at.split('T')[0];
                if (!map[d]) map[d] = ph;
            }
        });
        return map;
    }, [progressPhotos]);

    const scanDateSet = useMemo(() => {
        const s = new Set<string>();
        scanPts.forEach(pt => { if (pt.at) s.add(pt.at.split('T')[0]); });
        return s;
    }, [scanPts]);

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const startOffset = (firstWeekday + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const cells: number[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(0);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(0);

    return (
        <View>
            <View style={cal.header}>
                <TouchableOpacity onPress={goBack} hitSlop={8} style={cal.navBtn}>
                    <Ionicons name="chevron-back" size={18} color={CAL_INK} />
                </TouchableOpacity>
                <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
                <TouchableOpacity onPress={goForward} hitSlop={8} style={cal.navBtn} disabled={isFuture}>
                    <Ionicons name="chevron-forward" size={18} color={isFuture ? CAL_TRACK : CAL_INK} />
                </TouchableOpacity>
            </View>
            <View style={cal.dayRow}>
                {['M','T','W','T','F','S','S'].map((d, i) => (
                    <Text key={i} style={cal.dayHead}>{d}</Text>
                ))}
            </View>
            <View style={cal.grid}>
                {cells.map((day, i) => {
                    if (!day) return <View key={`e${i}`} style={cal.cell} />;
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const photo = photoByDate[dateStr];
                    const hasScan = scanDateSet.has(dateStr);
                    const isToday = dateStr === todayStr;
                    const hasContent = !!photo || hasScan;
                    return (
                        <TouchableOpacity
                            key={dateStr}
                            style={cal.cell}
                            onPress={() => {
                                if (photo) onPhotoPress(photo);
                                else if (isToday) onScanDay();
                            }}
                            activeOpacity={hasContent || isToday ? 0.7 : 1}
                        >
                            {photo ? (
                                <View style={[cal.thumb, isToday && cal.thumbToday]}>
                                    <CachedImage
                                        uri={api.resolveAttachmentUrl(photo.image_url)}
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                    />
                                </View>
                            ) : (
                                <View style={[cal.dayNum, isToday && cal.dayNumToday]}>
                                    <Text style={[cal.dayText, isToday && cal.dayTextToday]}>{day}</Text>
                                    {hasScan && !photo ? <View style={cal.scanDot} /> : null}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

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
                <Ionicons name={row.icon} size={19} color="#1C1A17" />
            </View>
            <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#97928A" />
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
    const faceScanEnabled = useFlag('faceScan');

    const { data: schedData } = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
    });
    const streak = schedData?.schedule_streak?.current ?? 0;

    const { data: progressPhotosData } = useQuery({
        queryKey: ['progressPhotos'],
        queryFn: () => api.getProgressPhotos(),
        staleTime: 60_000,
    });
    const { data: scanHistoryData } = useQuery({
        queryKey: ['scanHistory'],
        queryFn: () => api.getScanHistory(),
        staleTime: 60_000,
    });

    const progressPhotos: any[] = (progressPhotosData as any)?.photos ?? (Array.isArray(progressPhotosData) ? progressPhotosData : []);
    const scanPts = parseScanPoints(scanHistoryData);

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

                {/* Streak pill */}
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

                {/* Progress calendar */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>PROGRESS</Text>
                    <GlassCard radius={20}>
                        <View style={styles.calendarInner}>
                            <ProgressCalendar
                                progressPhotos={progressPhotos}
                                scanPts={scanPts}
                                onPhotoPress={(photo) => navigation.navigate('ProgressArchive')}
                                onScanDay={() => navigation.navigate('FaceScan')}
                            />
                        </View>
                    </GlassCard>
                </View>

                <Section
                    title="ACHIEVEMENTS"
                    rows={[
                        {
                            icon: 'trophy-outline',
                            label: 'Achievements',
                            sub: 'Badges & milestones',
                            onPress: () => navigation.navigate('Achievements'),
                        },
                        ...(faceScanEnabled
                            ? ([
                                  {
                                      icon: 'images-outline',
                                      label: 'Scan archive',
                                      onPress: () => navigation.navigate('FaceScanArchive'),
                                  },
                              ] as Row[])
                            : []),
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
                            sub: 'Your schedule',
                            onPress: () => navigation.navigate('DayPlanner'),
                        },
                        {
                            icon: 'map-outline',
                            label: 'Calendar & places',
                            sub: 'Busy blocks and the places in your day.',
                            onPress: () => navigation.navigate('DaySetup'),
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
        color: '#97928A',
    },
    title: {
        fontFamily: 'PlayfairDisplay-Regular',
        fontSize: 40,
        color: '#1C1A17',
        marginTop: 2,
    },
    streakWrap: { marginTop: 16 },
    streakCard: { flexDirection: 'row', alignItems: 'center', padding: 18 },
    streakRing: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 3,
        borderColor: '#2C6BED',
        alignItems: 'center',
        justifyContent: 'center',
    },
    streakNumber: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 20,
        color: '#1C1A17',
    },
    streakText: { marginLeft: 14, flex: 1 },
    streakLabel: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: '#1C1A17',
    },
    streakSub: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: '#8C887E',
        marginTop: 2,
    },
    section: { marginTop: 24 },
    sectionTitle: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 11,
        letterSpacing: 1.6,
        color: '#97928A',
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
        color: '#1C1A17',
    },
    rowSub: {
        fontFamily: 'Matter-Regular',
        fontSize: 12,
        color: '#8C887E',
        marginTop: 1,
    },
    calendarInner: { padding: 14 },
});

const cal = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    navBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    monthLabel: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: CAL_INK, letterSpacing: -0.2 },
    dayRow: { flexDirection: 'row', marginBottom: 4 },
    dayHead: { flex: 1, textAlign: 'center', fontFamily: 'Matter-Medium', fontSize: 10.5, color: CAL_MUTE, letterSpacing: 0.2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%` as any, aspectRatio: 1, padding: 1.5, alignItems: 'center', justifyContent: 'center' },
    thumb: { width: '92%', height: '92%', borderRadius: 5, overflow: 'hidden' },
    thumbToday: { borderWidth: 1.5, borderColor: CAL_INK },
    dayNum: { width: '80%', height: '80%', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
    dayNumToday: { backgroundColor: CAL_INK },
    dayText: { fontFamily: 'Matter-Regular', fontSize: 11.5, color: CAL_INK },
    dayTextToday: { color: CAL_ON_INK, fontFamily: 'Matter-SemiBold' },
    scanDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#2E7D52', marginTop: 1 },
});

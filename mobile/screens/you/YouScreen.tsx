/**
 * You hub (spec 3.1) - profile/progress home under the 4-tab nav.
 *
 * Top hero = progress calendar (month grid with scan dots + progress photo
 * thumbnails). Scan button lives in the navbar center — no redundant rows here.
 * Sections: Achievements, Plan shape, Purchases, Account.
 */
import React, { useCallback, useMemo, useState } from 'react';
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
import { GlassCard } from '../../components/glass/GlassCard';
import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryClient';
import api from '../../services/api';

// ── palette (matches Craft aesthetic) ──────────────────────────────────────
const INK  = '#1C1A17';
const MUTE = '#97928A';
const ON_INK = '#FFFFFF';
const TRACK = '#E4E3E0';

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

// ── scan-history helper ─────────────────────────────────────────────────────
function parseScanPoints(raw: any): { score: number; at?: string }[] {
    const list = raw?.scans ?? raw?.history ?? (Array.isArray(raw) ? raw : []);
    const pts = (list as any[])
        .map((s: any) => {
            const score = Number(
                s?.overall_score ?? s?.rating ?? s?.score ??
                s?.analysis?.psl_rating?.appeal ?? s?.psl_rating?.appeal,
            );
            return Number.isFinite(score) ? { score, at: s?.created_at as string | undefined } : null;
        })
        .filter(Boolean) as { score: number; at?: string }[];
    pts.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
    return pts;
}

// ── ProgressCalendar ────────────────────────────────────────────────────────
function ProgressCalendar({
    progressPhotos,
    scanPts,
    streak,
}: {
    progressPhotos: any[];
    scanPts: { score: number; at?: string }[];
    streak: number;
}) {
    const today = useMemo(() => new Date(), []);
    const [viewYear, setViewYear]   = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const navigation = useNavigation<any>();

    const goBack = useCallback(() => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    }, [viewMonth]);

    const goForward = useCallback(() => {
        if (
            viewYear > today.getFullYear() ||
            (viewYear === today.getFullYear() && viewMonth >= today.getMonth())
        ) return;
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    }, [viewMonth, viewYear, today]);

    const isFuture =
        viewYear > today.getFullYear() ||
        (viewYear === today.getFullYear() && viewMonth >= today.getMonth());

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
    const startOffset  = (firstWeekday + 6) % 7;
    const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr     = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const cells: number[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(0);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(0);

    return (
        <GlassCard radius={20}>
            <View style={cal.wrap}>
                {/* header row: streak stat + month nav */}
                <View style={cal.header}>
                    <View>
                        <Text style={cal.streakNum}>{streak}</Text>
                        <Text style={cal.streakLabel}>day streak</Text>
                    </View>
                    <View style={cal.monthNav}>
                        <TouchableOpacity onPress={goBack} hitSlop={10} style={cal.navBtn}>
                            <Ionicons name="chevron-back" size={18} color={INK} />
                        </TouchableOpacity>
                        <Text style={cal.monthLabel}>
                            {MONTH_NAMES[viewMonth].slice(0,3)} {viewYear}
                        </Text>
                        <TouchableOpacity onPress={goForward} hitSlop={10} style={cal.navBtn} disabled={isFuture}>
                            <Ionicons name="chevron-forward" size={18} color={isFuture ? TRACK : INK} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* day-of-week labels */}
                <View style={cal.dayRow}>
                    {['M','T','W','T','F','S','S'].map((d, i) => (
                        <Text key={i} style={cal.dayHead}>{d}</Text>
                    ))}
                </View>

                {/* grid */}
                <View style={cal.grid}>
                    {cells.map((day, i) => {
                        if (!day) return <View key={`e${i}`} style={cal.cell} />;
                        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const photo   = photoByDate[dateStr];
                        const hasScan = scanDateSet.has(dateStr);
                        const isToday = dateStr === todayStr;

                        return (
                            <TouchableOpacity
                                key={dateStr}
                                style={cal.cell}
                                onPress={() => {
                                    if (photo) navigation.navigate('ProgressArchive');
                                    else if (isToday) navigation.navigate('FaceScan');
                                }}
                                activeOpacity={(photo || isToday) ? 0.7 : 1}
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

                <TouchableOpacity
                    style={cal.scanCta}
                    onPress={() => navigation.navigate('FaceScan')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="camera-outline" size={14} color={MUTE} />
                    <Text style={cal.scanCtaText}>Add scan or photo</Text>
                </TouchableOpacity>
            </View>
        </GlassCard>
    );
}

const cal = StyleSheet.create({
    wrap:         { padding: 18 },
    header:       { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
    streakNum:    { fontFamily: 'PlayfairDisplay-Regular', fontSize: 32, color: INK, lineHeight: 34 },
    streakLabel:  { fontFamily: 'Matter-Regular', fontSize: 11, color: MUTE, letterSpacing: 0.3, marginTop: -2 },
    monthNav:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
    navBtn:       { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    monthLabel:   { fontFamily: 'Matter-SemiBold', fontSize: 13, color: INK, letterSpacing: -0.1 },
    dayRow:       { flexDirection: 'row', marginBottom: 4 },
    dayHead:      { flex: 1, textAlign: 'center', fontFamily: 'Matter-Medium', fontSize: 10, color: MUTE, letterSpacing: 0.2 },
    grid:         { flexDirection: 'row', flexWrap: 'wrap' },
    cell:         { width: `${100 / 7}%` as any, aspectRatio: 1, padding: 1.5, alignItems: 'center', justifyContent: 'center' },
    thumb:        { width: '90%', height: '90%', borderRadius: 5, overflow: 'hidden' },
    thumbToday:   { borderWidth: 1.5, borderColor: INK },
    dayNum:       { width: '80%', height: '80%', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
    dayNumToday:  { backgroundColor: INK },
    dayText:      { fontFamily: 'Matter-Regular', fontSize: 11, color: INK },
    dayTextToday: { color: ON_INK, fontFamily: 'Matter-SemiBold' },
    scanDot:      { width: 4, height: 4, borderRadius: 2, backgroundColor: '#2E7D52', marginTop: 1 },
    scanCta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(17,17,19,0.07)' },
    scanCtaText:  { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, letterSpacing: 0.2 },
});

// ── Row / Section components ────────────────────────────────────────────────
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
                <Ionicons name={row.icon} size={19} color={INK} />
            </View>
            <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={MUTE} />
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

// ── Main screen ─────────────────────────────────────────────────────────────
export default function YouScreen() {
    const navigation = useNavigation<any>();
    const insets     = useSafeAreaInsets();
    const { user }   = useAuth();

    const { data: schedData } = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
    });
    const streak = schedData?.schedule_streak?.current ?? 0;

    const { data: progressData } = useQuery({
        queryKey: ['progressPhotos'],
        queryFn: () => api.getProgressPhotos(),
        staleTime: 5 * 60_000,
    });
    const progressPhotos: any[] = progressData?.photos ?? progressData ?? [];

    const { data: scanHistory } = useQuery({
        queryKey: ['scanHistory'],
        queryFn: () => api.getScanHistory(),
        staleTime: 5 * 60_000,
    });
    const scanPts = useMemo(() => parseScanPoints(scanHistory), [scanHistory]);

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

                {/* ── Progress Calendar (replaces streak card) ── */}
                <View style={styles.calWrap}>
                    <ProgressCalendar
                        progressPhotos={progressPhotos}
                        scanPts={scanPts}
                        streak={streak}
                    />
                </View>

                <Section
                    title="PROGRESS"
                    rows={[
                        {
                            icon: 'trophy-outline',
                            label: 'Achievements',
                            sub: 'Badges & milestones',
                            onPress: () => navigation.navigate('Achievements'),
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
                            icon: 'map-outline',
                            label: 'Day shape',
                            sub: 'Busy blocks and the places in your day.',
                            onPress: () => navigation.navigate('DaySetup'),
                        },
                        {
                            icon: 'calendar-outline',
                            label: 'Week view',
                            sub: 'Full schedule',
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
    content:      { paddingHorizontal: 20 },
    kicker: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 12,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: MUTE,
    },
    title: {
        fontFamily: 'PlayfairDisplay-Regular',
        fontSize: 40,
        color: INK,
        marginTop: 2,
    },
    calWrap: { marginTop: 16, marginBottom: 6 },
    section:      { marginTop: 20 },
    sectionTitle: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 11,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: MUTE,
        marginBottom: 8,
        marginLeft: 4,
    },
    cardInner: { paddingHorizontal: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    rowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(17,17,19,0.06)',
    },
    rowIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(17,17,19,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    rowText:  { flex: 1 },
    rowLabel: { fontFamily: 'Matter-Medium', fontSize: 15, color: INK, letterSpacing: -0.1 },
    rowSub:   { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 1 },
});

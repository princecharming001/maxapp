import React, { useState, useMemo, useCallback } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
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

// ─── Constants ───────────────────────────────────────────────────────────────
const INK = '#111113';
const ON_INK = '#FFFFFF';
const MUTE = '#9A9A9A';
const TRACK = '#E4E3E0';
const CARD = '#FFFFFF';
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Types ───────────────────────────────────────────────────────────────────
type ScanPoint = { score: number; appeal?: number; potential?: number; at?: string };
type DayData = { photo?: any; scan?: ScanPoint; dateStr: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseScanPoints(raw: any): ScanPoint[] {
    const list = raw?.scans ?? raw?.history ?? (Array.isArray(raw) ? raw : []);
    return (list as any[])
        .map((s: any) => {
            const score = Number(s?.overall_score ?? s?.rating ?? s?.score);
            if (!Number.isFinite(score)) return null;
            const appeal = s?.appeal != null ? Number(s.appeal) : undefined;
            const potential = s?.potential != null ? Number(s.potential) : undefined;
            return {
                score,
                appeal: Number.isFinite(appeal) ? appeal : undefined,
                potential: Number.isFinite(potential) ? potential : undefined,
                at: s?.created_at as string | undefined,
            };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()) as ScanPoint[];
}

function fmtScore(v: number | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(1);
}

function scoreTint(v: number | undefined): string {
    if (v == null) return INK;
    if (v >= 7.5) return '#1A6E42';
    if (v >= 5) return '#7A5C00';
    return '#8B1A1A';
}

function formatDayLabel(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const suffix = d === 1 || d === 21 || d === 31 ? 'st'
        : d === 2 || d === 22 ? 'nd'
        : d === 3 || d === 23 ? 'rd' : 'th';
    return `${SHORT_MONTHS[m - 1]} ${d}${suffix}, ${y}`;
}

function httpStatus(err: unknown): number | null {
    const e = err as any;
    return e?.response?.status ?? e?.status ?? null;
}

// ─── Calendar status states ───────────────────────────────────────────────────
type CalStatus =
    | { kind: 'loading' }
    | { kind: 'paywall' }
    | { kind: 'error'; msg: string; retry: () => void }
    | { kind: 'empty' }
    | { kind: 'ok' };

function CalendarStatusCard({
    status,
    onUpgrade,
}: {
    status: CalStatus;
    onUpgrade: () => void;
}) {
    if (status.kind === 'ok') return null;

    if (status.kind === 'loading') {
        return (
            <View style={cs.wrap}>
                <ActivityIndicator size="small" color={MUTE} />
                <Text style={cs.body}>Loading your progress…</Text>
            </View>
        );
    }

    if (status.kind === 'paywall') {
        return (
            <View style={cs.wrap}>
                <View style={cs.iconCircle}>
                    <Ionicons name="lock-closed-outline" size={22} color={INK} />
                </View>
                <Text style={cs.title}>Scan history is a paid feature</Text>
                <Text style={cs.body}>
                    Upgrade to Chad or Chadlite to unlock face analysis, see your
                    appeal / rating / potential over time, and track progress in this calendar.
                </Text>
                <TouchableOpacity style={cs.btn} onPress={onUpgrade} activeOpacity={0.8}>
                    <Text style={cs.btnText}>Upgrade →</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (status.kind === 'error') {
        return (
            <View style={cs.wrap}>
                <View style={cs.iconCircle}>
                    <Ionicons name="wifi-outline" size={22} color={INK} />
                </View>
                <Text style={cs.title}>Couldn't load progress data</Text>
                <Text style={cs.body}>{status.msg}</Text>
                <TouchableOpacity style={cs.btn} onPress={status.retry} activeOpacity={0.8}>
                    <Text style={cs.btnText}>Try again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (status.kind === 'empty') {
        return (
            <View style={cs.wrap}>
                <View style={cs.iconCircle}>
                    <Ionicons name="camera-outline" size={22} color={INK} />
                </View>
                <Text style={cs.title}>No scans yet</Text>
                <Text style={cs.body}>
                    Tap the scan button at the bottom of the screen to take your first
                    face scan. Your photo and scores will appear here.
                </Text>
            </View>
        );
    }

    return null;
}

// ─── Day detail modal ─────────────────────────────────────────────────────────
function DayModal({
    data,
    onClose,
    onNewScan,
}: {
    data: DayData | null;
    onClose: () => void;
    onNewScan: () => void;
}) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const cardW = Math.min(width - 40, 360);
    const imgH = Math.round(cardW * 1.1);

    if (!data) return null;
    const { photo, scan, dateStr } = data;
    const hasMetrics = scan && (scan.score != null || scan.appeal != null || scan.potential != null);

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                style={md.backdrop}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                    <View style={[md.card, { width: cardW, paddingBottom: insets.bottom + 8 }]}>
                        {/* Photo */}
                        {photo ? (
                            <View style={[md.imgWrap, { height: imgH }]}>
                                <CachedImage
                                    uri={api.resolveAttachmentUrl(photo.image_url)}
                                    style={md.img}
                                    contentFit="cover"
                                />
                                {/* Date badge */}
                                <View style={md.dateBadge}>
                                    <Text style={md.dateBadgeText}>{formatDayLabel(dateStr)}</Text>
                                </View>
                            </View>
                        ) : (
                            <View style={md.noPhotoWrap}>
                                <Ionicons name="camera-outline" size={32} color={MUTE} />
                                <Text style={md.noPhotoText}>{formatDayLabel(dateStr)}</Text>
                                <TouchableOpacity style={md.scanCta} onPress={onNewScan} activeOpacity={0.8}>
                                    <Text style={md.scanCtaText}>Take a photo →</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Metrics */}
                        {hasMetrics ? (
                            <View style={md.metrics}>
                                <MetricTile label="RATING" value={scan!.score} />
                                <View style={md.metricDivider} />
                                <MetricTile label="APPEAL" value={scan!.appeal} />
                                <View style={md.metricDivider} />
                                <MetricTile label="POTENTIAL" value={scan!.potential} />
                            </View>
                        ) : scan ? (
                            // Scan exists but no breakdown (old format)
                            <View style={md.metrics}>
                                <MetricTile label="SCORE" value={scan.score} />
                            </View>
                        ) : (
                            <View style={md.noScanRow}>
                                <Text style={md.noScanText}>No scan on this day</Text>
                                <TouchableOpacity onPress={onNewScan} activeOpacity={0.8}>
                                    <Text style={md.noScanCta}>Scan now →</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Close */}
                        <TouchableOpacity style={md.close} onPress={onClose} hitSlop={12}>
                            <Ionicons name="close" size={18} color={INK} />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

function MetricTile({ label, value }: { label: string; value: number | undefined }) {
    const tint = scoreTint(value);
    return (
        <View style={md.metricTile}>
            <Text style={md.metricLabel}>{label}</Text>
            <Text style={[md.metricValue, { color: tint }]}>{fmtScore(value)}</Text>
            <Text style={md.metricSub}>/10</Text>
        </View>
    );
}

// ─── Progress calendar ────────────────────────────────────────────────────────
function ProgressCalendar({
    progressPhotos,
    scanByDate,
    scanPts,
    onDayPress,
    onScanDay,
}: {
    progressPhotos: any[];
    scanByDate: Record<string, ScanPoint>;
    scanPts: ScanPoint[];
    onDayPress: (data: DayData) => void;
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
                    <Ionicons name="chevron-back" size={18} color={INK} />
                </TouchableOpacity>
                <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
                <TouchableOpacity onPress={goForward} hitSlop={8} style={cal.navBtn} disabled={isFuture}>
                    <Ionicons name="chevron-forward" size={18} color={isFuture ? TRACK : INK} />
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
                    const scan = scanByDate[dateStr];
                    const isToday = dateStr === todayStr;
                    const hasContent = !!photo || !!scan;
                    const tappable = hasContent || isToday;

                    return (
                        <TouchableOpacity
                            key={dateStr}
                            style={cal.cell}
                            onPress={() => {
                                if (hasContent) {
                                    onDayPress({ photo, scan, dateStr });
                                } else if (isToday) {
                                    onScanDay();
                                }
                            }}
                            activeOpacity={tappable ? 0.7 : 1}
                        >
                            {photo ? (
                                <View style={[cal.thumb, isToday && cal.thumbToday]}>
                                    <CachedImage
                                        uri={api.resolveAttachmentUrl(photo.image_url)}
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                    />
                                    {scan && <View style={cal.scanBadge} />}
                                </View>
                            ) : (
                                <View style={[cal.dayNum, isToday && cal.dayNumToday, scan && cal.dayNumScan]}>
                                    <Text style={[cal.dayText, isToday && cal.dayTextToday]}>{day}</Text>
                                    {scan && !isToday ? <View style={cal.scanDot} /> : null}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Section list helpers ─────────────────────────────────────────────────────
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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function YouScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user, isPaid, isScanUser } = useAuth();
    const faceScanEnabled = useFlag('faceScan');
    const canSeeScanHistory = isPaid || isScanUser;

    const [dayModal, setDayModal] = useState<DayData | null>(null);

    const { data: schedData } = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
    });
    const streak = schedData?.schedule_streak?.current ?? 0;

    const {
        data: progressPhotosData,
        isError: photosError,
        error: photosErrorRaw,
        isPending: photosLoading,
        refetch: refetchPhotos,
    } = useQuery({
        queryKey: ['progressPhotos'],
        queryFn: () => api.getProgressPhotos(),
        staleTime: 60_000,
        retry: 1,
    });

    const {
        data: scanHistoryData,
        isError: scansError,
        error: scansErrorRaw,
        isPending: scansLoading,
        refetch: refetchScans,
    } = useQuery({
        queryKey: ['scanHistory'],
        queryFn: () => api.getScanHistory(),
        staleTime: 60_000,
        retry: 1,
        enabled: canSeeScanHistory,
    });

    const progressPhotos: any[] = (progressPhotosData as any)?.photos ?? (Array.isArray(progressPhotosData) ? progressPhotosData : []);
    const scanPts = useMemo(() => parseScanPoints(scanHistoryData), [scanHistoryData]);

    // Derive the calendar's status: drives the status card shown above/instead of the calendar
    const calStatus = useMemo((): CalStatus => {
        if (photosLoading || (canSeeScanHistory && scansLoading)) return { kind: 'loading' };
        if (photosError) {
            const code = httpStatus(photosErrorRaw);
            if (code === 402 || code === 403) return { kind: 'paywall' };
            return {
                kind: 'error',
                msg: 'Check your connection and try again.',
                retry: () => { void refetchPhotos(); void refetchScans(); },
            };
        }
        if (scansError && canSeeScanHistory) {
            const code = httpStatus(scansErrorRaw);
            if (code === 402 || code === 403) return { kind: 'paywall' };
            return {
                kind: 'error',
                msg: 'Could not load your scan history. Check your connection.',
                retry: () => void refetchScans(),
            };
        }
        if (!canSeeScanHistory && progressPhotos.length === 0) return { kind: 'empty' };
        if (canSeeScanHistory && progressPhotos.length === 0 && scanPts.length === 0) return { kind: 'empty' };
        return { kind: 'ok' };
    }, [
        photosLoading, scansLoading, photosError, scansError,
        photosErrorRaw, scansErrorRaw, canSeeScanHistory,
        progressPhotos.length, scanPts.length,
        refetchPhotos, refetchScans,
    ]);

    // date → scan metrics, most recent scan per day wins
    const scanByDate = useMemo(() => {
        const map: Record<string, ScanPoint> = {};
        scanPts.forEach(pt => {
            if (pt.at) {
                const d = pt.at.split('T')[0];
                map[d] = pt;
            }
        });
        return map;
    }, [scanPts]);

    const { data: market } = useQuery({
        queryKey: ['marketplaceBrowse'],
        queryFn: () => api.getMarketplace(),
        staleTime: 60_000,
    });
    const purchases = [
        ...(market?.maxxes ?? []),
        ...(market?.courses ?? []),
    ].filter((item: any) => item.entered);

    const firstName = (user as any)?.first_name || (user as any)?.username || 'you';

    const handleNewScan = useCallback(() => {
        setDayModal(null);
        navigation.navigate('FaceScan');
    }, [navigation]);

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

                {/* Streak */}
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
                            {calStatus.kind !== 'ok' ? (
                                <CalendarStatusCard
                                    status={calStatus}
                                    onUpgrade={() => navigation.navigate('ManageSubscription')}
                                />
                            ) : (
                                <ProgressCalendar
                                    progressPhotos={progressPhotos}
                                    scanByDate={scanByDate}
                                    scanPts={scanPts}
                                    onDayPress={setDayModal}
                                    onScanDay={handleNewScan}
                                />
                            )}
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

            <DayModal
                data={dayModal}
                onClose={() => setDayModal(null)}
                onNewScan={handleNewScan}
            />
        </ScreenBackdrop>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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
    streakNumber: { fontFamily: 'Matter-SemiBold', fontSize: 20, color: '#1C1A17' },
    streakText: { marginLeft: 14, flex: 1 },
    streakLabel: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: '#1C1A17' },
    streakSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#8C887E', marginTop: 2 },
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
    calendarInner: { padding: 14 },
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
    rowLabel: { fontFamily: 'Matter-Regular', fontSize: 15, color: '#1C1A17' },
    rowSub: { fontFamily: 'Matter-Regular', fontSize: 12, color: '#8C887E', marginTop: 1 },
});

const cal = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    navBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    monthLabel: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK, letterSpacing: -0.2 },
    dayRow: { flexDirection: 'row', marginBottom: 4 },
    dayHead: { flex: 1, textAlign: 'center', fontFamily: 'Matter-Medium', fontSize: 10.5, color: MUTE, letterSpacing: 0.2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%` as any, aspectRatio: 1, padding: 1.5, alignItems: 'center', justifyContent: 'center' },
    thumb: { width: '92%', height: '92%', borderRadius: 5, overflow: 'hidden', position: 'relative' },
    thumbToday: { borderWidth: 1.5, borderColor: INK },
    scanBadge: {
        position: 'absolute', bottom: 3, right: 3,
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: '#2E7D52',
        borderWidth: 1, borderColor: '#fff',
    },
    dayNum: { width: '80%', height: '80%', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
    dayNumToday: { backgroundColor: INK },
    dayNumScan: { backgroundColor: 'rgba(46,125,82,0.10)' },
    dayText: { fontFamily: 'Matter-Regular', fontSize: 11.5, color: INK },
    dayTextToday: { color: ON_INK, fontFamily: 'Matter-SemiBold' },
    scanDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#2E7D52', marginTop: 1 },
});

const md = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: CARD,
        borderRadius: 24,
        overflow: 'hidden',
    },
    imgWrap: {
        width: '100%',
        position: 'relative',
    },
    img: {
        width: '100%',
        height: '100%',
    },
    dateBadge: {
        position: 'absolute',
        bottom: 12,
        left: 12,
        backgroundColor: 'rgba(0,0,0,0.52)',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    dateBadgeText: {
        fontFamily: 'Matter-Medium',
        fontSize: 12,
        color: '#fff',
        letterSpacing: 0.2,
    },
    noPhotoWrap: {
        alignItems: 'center',
        paddingVertical: 36,
        paddingHorizontal: 24,
        gap: 8,
    },
    noPhotoText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: INK,
        marginTop: 4,
    },
    scanCta: {
        marginTop: 6,
        backgroundColor: INK,
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 9,
    },
    scanCtaText: {
        fontFamily: 'Matter-Medium',
        fontSize: 13,
        color: ON_INK,
        letterSpacing: 0.2,
    },
    metrics: {
        flexDirection: 'row',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(17,17,19,0.08)',
    },
    metricTile: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 4,
    },
    metricDivider: {
        width: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(17,17,19,0.08)',
        marginVertical: 14,
    },
    metricLabel: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 9,
        letterSpacing: 1.4,
        color: MUTE,
        marginBottom: 6,
    },
    metricValue: {
        fontFamily: 'PlayfairDisplay-Regular',
        fontSize: 28,
        color: INK,
        lineHeight: 30,
    },
    metricSub: {
        fontFamily: 'Matter-Regular',
        fontSize: 10,
        color: MUTE,
        marginTop: 1,
    },
    noScanRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(17,17,19,0.08)',
    },
    noScanText: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: MUTE,
    },
    noScanCta: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13,
        color: INK,
    },
    close: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const cs = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
        gap: 8,
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F2F1EF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    title: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: INK,
        textAlign: 'center',
        letterSpacing: -0.2,
    },
    body: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: MUTE,
        textAlign: 'center',
        lineHeight: 19,
        marginTop: 2,
    },
    btn: {
        marginTop: 10,
        backgroundColor: INK,
        borderRadius: 999,
        paddingHorizontal: 22,
        paddingVertical: 10,
    },
    btnText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13,
        color: ON_INK,
        letterSpacing: 0.2,
    },
});

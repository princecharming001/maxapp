/**
 * MarketplaceScreen (Explore tab) - browse + enter native maxes ($3.99/wk each)
 * and creator courses (creator-set price). Browse is open; the paywall is the
 * "enter"/"get" action. Glass aesthetic, voice-safe copy.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    RefreshControl,
    Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GlassButton } from '../../components/glass/GlassButton';
import SectionLabel from '../../components/SectionLabel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { track } from '../../lib/analytics';
import api, { type MarketplaceItem } from '../../services/api';

const INK = '#1C1A17';
const MUTE = '#97928A';
const SUB = '#5C574E';
const CREAM = '#F7F0EA';
const CARD = '#FFFFFF';
const BORDER = '#E8E0D3';
const GOLD = '#2C6BED';

const VERDICT_META = {
    green: { color: '#3D8B4F', icon: 'checkmark-circle' as const, line: 'Fits your real week' },
    amber: { color: '#B07D10', icon: 'alert-circle' as const, line: 'Tight, but workable' },
    red: { color: '#C0452C', icon: 'remove-circle' as const, line: 'Your week is packed' },
};

/** Schedule-fit sim (spec 3.4) - the moat made visible, shown BEFORE buying. */
function FeasibilityBlock({ programId }: { programId: string }) {
    const q = useQuery({
        queryKey: ['feasibility', programId],
        queryFn: () => api.getPlannerFeasibility(programId),
        staleTime: 5 * 60_000,
    });
    if (q.isLoading) {
        return (
            <View style={styles.feasWrap}>
                <View style={styles.feasSkeleton} />
            </View>
        );
    }
    const d = q.data;
    if (!d) return null;
    const meta = VERDICT_META[d.verdict] ?? VERDICT_META.amber;
    return (
        <View style={styles.feasWrap}>
            <View style={styles.feasHeader}>
                <Ionicons name={meta.icon} size={15} color={meta.color} />
                <Text style={[styles.feasVerdict, { color: meta.color }]}>{meta.line}</Text>
            </View>
            <Text style={styles.feasLine}>
                Fits {d.fits_n_of_m.fits} of {d.fits_n_of_m.of} weekly sessions.
            </Text>
            <View style={styles.ghostStrip}>
                {d.ghost_week.map((g) => (
                    <View key={g.day} style={styles.ghostDay}>
                        <View
                            style={[
                                styles.ghostDot,
                                g.slots.length
                                    ? { backgroundColor: GOLD }
                                    : { backgroundColor: 'rgba(17,17,19,0.12)' },
                            ]}
                        />
                        <Text style={styles.ghostDayLabel}>{g.day[0]}</Text>
                        {g.slots.length ? (
                            <Text style={styles.ghostSlot}>{g.slots[0]}</Text>
                        ) : (
                            <Text style={styles.ghostSlot}> </Text>
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}

export default function MarketplaceScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const [maxxes, setMaxxes] = useState<MarketplaceItem[]>([]);
    const [courses, setCourses] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [detail, setDetail] = useState<MarketplaceItem | null>(null);

    // Deep links / You > Purchases pass itemId - open that detail sheet.
    useEffect(() => {
        const itemId = route.params?.itemId;
        if (!itemId || loading) return;
        const item = [...maxxes, ...courses].find((i) => i.id === itemId);
        if (item) {
            navigation.setParams({ itemId: undefined });
            navigation.push('MaxDetail', { item });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.itemId, loading]);

    // Returning from Stripe checkout (or anywhere): refetch entitlements so
    // a completed purchase shows as entered without a manual reload.
    useEffect(() => {
        const unsub = navigation.addListener?.('focus', () => {
            if (!loading) void load();
        });
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigation, loading]);

    const load = useCallback(async () => {
        try {
            setError(null);
            const data = await api.getMarketplace();
            setMaxxes(data.maxxes || []);
            setCourses(data.courses || []);
        } catch (e: any) {
            setError('Could not load the marketplace. Pull to retry.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const markEntered = useCallback((id: string) => {
        const upd = (arr: MarketplaceItem[]) => arr.map((it) => (it.id === id ? { ...it, entered: true } : it));
        setMaxxes(upd);
        setCourses(upd);
        setDetail((d) => (d && d.id === id ? { ...d, entered: true } : d));
    }, []);

    if (loading) {
        return (
            <View style={styles.root}>
                <View style={[styles.center, { paddingTop: insets.top }]}>
                    <ActivityIndicator color={INK} />
                    <Text style={styles.loadingText}>Loading Explore</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ScrollView
                contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 90 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
            >
                <Text style={styles.h1}>Find your <Text style={{ fontFamily: 'Fraunces-Italic' }}>max</Text></Text>

                {error ? (
                    <View style={styles.errorCard}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <View style={[styles.sectionHead, { marginTop: 28 }]}>
                    <SectionLabel label="MAXES" style={styles.sectionLabelInline} />
                    <Text style={styles.sectionNote}>$3.99 / week each</Text>
                </View>
                <View style={styles.list}>
                    {maxxes.map((m, i) => (
                        <CourseRow key={m.id} item={m} first={i === 0} onPress={() => navigation.push('MaxDetail', { item: m })} />
                    ))}
                </View>

                {courses.length > 0 ? (
                    <>
                        <SectionLabel label="CREATOR COURSES" style={{ marginTop: 36, marginBottom: 4 }} />
                        <View style={styles.list}>
                            {courses.map((c, i) => (
                                <CourseRow key={c.id} item={c} first={i === 0} onPress={() => navigation.push('MaxDetail', { item: c })} />
                            ))}
                        </View>
                    </>
                ) : null}
            </ScrollView>

            <DetailModal item={detail} onClose={() => setDetail(null)} onEntered={markEntered} />
        </View>
    );
}

/** A flat, editorial marketplace row — no card box, no tinted tile. The max's
 *  color lives in the icon itself; creator courses show a small cover thumbnail.
 *  Rows are separated by hairlines on the cream page. */
function CourseRow({ item, first, onPress }: { item: MarketplaceItem; first: boolean; onPress: () => void }) {
    const img = (item as any).image_url as string | undefined;
    const base = item.color || GOLD;
    const tagline = (item as any).tagline as string | undefined;
    const sub = tagline || (item.native ? 'by Max' : `@${item.creator.handle}${item.creator.verified ? ' ✓' : ''}`);
    return (
        <TouchableOpacity style={[styles.row, !first && styles.rowBorder]} activeOpacity={0.6} onPress={onPress}>
            {img ? (
                <Image source={{ uri: img }} style={styles.rowThumb} contentFit="cover" transition={200} />
            ) : (
                <View style={styles.rowIconWrap}>
                    <Ionicons name={(item.icon as any) || 'ellipse-outline'} size={26} color={base} />
                </View>
            )}
            <View style={styles.rowMid}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
            </View>
            <View style={styles.rowRight}>
                {item.rating ? (
                    <Text style={styles.rowRating}>★ {item.rating.toFixed(1)}</Text>
                ) : null}
                <Text style={[styles.rowPrice, item.entered && { color: base }]}>
                    {item.entered ? 'Open' : item.price_label.replace(' / week', '/wk')}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={MUTE} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
    );
}

function DetailModal({ item, onClose, onEntered }: { item: MarketplaceItem | null; onClose: () => void; onEntered: (id: string) => void }) {
    const [busy, setBusy] = useState(false);
    const [miniReveal, setMiniReveal] = useState<{ count: number; first: string } | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [manageNote, setManageNote] = useState<string | null>(null);
    const queryClient = useQueryClient();
    if (!item) return null;
    const isWeekly = item.price_model === 'weekly';

    // Honest price display (spec 3.4): total is the big number for flat, with
    // the weekly equivalent small; weekly shows cancel-anytime. Never hidden.
    const priceSub = isWeekly
        ? 'cancel anytime'
        : item.weeks
          ? `about $${(item.price_cents / 100 / item.weeks).toFixed(2)} a week`
          : null;

    const enter = async () => {
        if (busy || item.entered) return;
        setBusy(true);
        try {
            const res = await api.enterMarketplaceItem(item.id);
            // The program's schedule generates server-side on enter - flush
            // the Today/week caches so "See my day" shows the landed tasks.
            queryClient.invalidateQueries({ queryKey: ['plannerToday'] });
            queryClient.invalidateQueries({ queryKey: ['plannerHeldBack'] });
            queryClient.invalidateQueries({ queryKey: ['activeSchedulesFull'] });
            if (res.checkout_url) {
                // Real capture: hand off to hosted Stripe Checkout. The
                // webhook grants the entitlement on completion.
                if (Platform.OS === 'web') {
                    window.location.href = res.checkout_url;
                } else {
                    const { Linking } = require('react-native');
                    await Linking.openURL(res.checkout_url);
                }
                return;
            }
            track('enter', { item: item.id, kind: item.native ? 'maxx' : 'course' });
            onEntered(item.id);
            // Post-purchase mini-reveal: the new program lands on the user's
            // real week (data from the same feasibility sim, cached).
            try {
                const feas = await api.getPlannerFeasibility(item.id);
                const firstDay = feas.ghost_week.find((g) => g.slots.length);
                setMiniReveal({
                    count: feas.fits_n_of_m.fits,
                    first: firstDay ? `${firstDay.day} ${firstDay.slots[0]}` : 'tomorrow',
                });
            } catch {
                setMiniReveal({ count: 1, first: 'tomorrow' });
            }
        } catch {
            // keep modal open; user can retry
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalRoot}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(28,26,23,0.45)' }]} />
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                <View style={styles.sheet}>
                    {miniReveal ? (
                        <View style={styles.sheetInner}>
                            <View style={styles.grabber} />
                            <View style={[styles.iconWrapLg, { backgroundColor: hexA(item.color, 0.18) }]}>
                                <Ionicons name="sparkles" size={30} color={GOLD} />
                            </View>
                            <Text style={styles.sheetTitle}>You're in</Text>
                            <Text style={styles.sheetTagline}>
                                {miniReveal.count} new thing{miniReveal.count === 1 ? '' : 's'} landed on
                                your week. First one {miniReveal.first}.
                            </Text>
                            <View style={{ marginTop: 18 }}>
                                <GlassButton
                                    variant="primary"
                                    label="See my day"
                                    onPress={() => {
                                        onClose();
                                        const { navigationRef } = require('../../lib/navigationRef');
                                        if (navigationRef.isReady()) {
                                            (navigationRef as any).navigate('Main', {
                                                screen: 'MasterScheduleTab',
                                            });
                                        }
                                    }}
                                />
                            </View>
                            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: 'center' }} activeOpacity={0.6}>
                                <Text style={styles.closeText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                    <View style={styles.sheetInner}>
                        <View style={styles.grabber} />
                        <View style={[styles.iconWrapLg, { backgroundColor: hexA(item.color, 0.18) }]}>
                            <Ionicons name={(item.icon as any) || 'ellipse-outline'} size={30} color={item.color} />
                        </View>
                        <Text style={styles.sheetTitle}>{item.title}</Text>
                        <Text style={styles.sheetCreator}>
                            {item.native ? 'by Max' : `by ${item.creator.name}  @${item.creator.handle}${item.creator.verified ? '  (verified)' : ''}`}
                        </Text>
                        <Text style={styles.sheetTagline}>{item.tagline}</Text>

                        {!item.native ? (
                            <View style={styles.statsRow}>
                                {item.participants ? <Stat label="members" value={fmtK(item.participants)} /> : null}
                                {item.completion_rate ? <Stat label="finish week 1" value={`${Math.round(item.completion_rate * 100)}%`} /> : null}
                                {item.rating ? <Stat label="rating" value={`${item.rating.toFixed(1)} / 5`} /> : null}
                            </View>
                        ) : null}

                        <FeasibilityBlock programId={item.id} />

                        {!item.native && item.weeks ? (
                            <View style={styles.previewWrap}>
                                <Text style={styles.previewLabel}>CURRICULUM</Text>
                                <View style={styles.previewRow}>
                                    <Ionicons name="play-circle-outline" size={16} color={GOLD} />
                                    <Text style={styles.previewText}>Week 1 - free preview</Text>
                                </View>
                                {Array.from({ length: Math.min(3, item.weeks - 1) }, (_, i) => (
                                    <View key={i} style={styles.previewRow}>
                                        <Ionicons name="lock-closed-outline" size={14} color={MUTE} />
                                        <Text style={[styles.previewText, { color: MUTE }]}>
                                            Week {i + 2}
                                        </Text>
                                    </View>
                                ))}
                                {item.weeks > 4 ? (
                                    <Text style={styles.previewMore}>+ {item.weeks - 4} more weeks</Text>
                                ) : null}
                            </View>
                        ) : null}

                        <View style={styles.bullets}>
                            <Bullet text="Fit to your real wake, work and gym times" />
                            <Bullet text="Reminders at the right moment, not all day" />
                            <Bullet text={isWeekly ? 'Cancel anytime' : `${item.weeks ?? ''} weeks, one payment`} />
                        </View>

                        <View style={styles.priceLine}>
                            <View>
                                <Text style={styles.priceBig}>{item.price_label}</Text>
                                {priceSub ? <Text style={styles.priceSub}>{priceSub}</Text> : null}
                            </View>
                        </View>

                        <GlassButton
                            variant="primary"
                            label={
                                item.entered
                                    ? 'Open my plan'
                                    : busy
                                      ? 'One sec'
                                      : `Start ${item.native ? item.title : 'this plan'} · ${item.price_label.replace(' / week', '/wk')}`
                            }
                            onPress={item.entered ? onClose : enter}
                            loading={busy}
                        />
                        {item.entered && !manageOpen ? (
                            <TouchableOpacity
                                onPress={() => setManageOpen(true)}
                                style={{ paddingVertical: 10, alignItems: 'center' }}
                                activeOpacity={0.6}
                                accessibilityRole="button"
                                accessibilityLabel="Manage this program"
                            >
                                <Text style={styles.closeText}>Manage</Text>
                            </TouchableOpacity>
                        ) : null}
                        {item.entered && manageOpen ? (
                            <View style={{ marginTop: 10, alignSelf: 'stretch' }}>
                                {manageNote ? (
                                    <Text style={styles.manageNote}>{manageNote}</Text>
                                ) : (
                                    <>
                                        <GlassButton
                                            variant="glass"
                                            label="Pause a month, keep my streak"
                                            loading={busy}
                                            onPress={async () => {
                                                setBusy(true);
                                                try {
                                                    await api.cancelMarketplaceItem(item.id, true);
                                                    setManageNote('Paused for a month. Your streak holds. Come back whenever.');
                                                } catch {
                                                    setManageNote("Couldn't reach Max. Try again in a bit.");
                                                } finally {
                                                    setBusy(false);
                                                }
                                            }}
                                        />
                                        <TouchableOpacity
                                            onPress={async () => {
                                                setBusy(true);
                                                try {
                                                    const res = await api.cancelMarketplaceItem(item.id, false);
                                                    setManageNote(
                                                        res.access_until
                                                            ? 'Canceled. Everything stays yours until the period ends.'
                                                            : 'Canceled.',
                                                    );
                                                } catch {
                                                    setManageNote("Couldn't reach Max. Try again in a bit.");
                                                } finally {
                                                    setBusy(false);
                                                }
                                            }}
                                            style={{ paddingVertical: 12, alignItems: 'center' }}
                                            activeOpacity={0.6}
                                            accessibilityRole="button"
                                            accessibilityLabel="Cancel anyway"
                                        >
                                            <Text style={styles.closeText}>Cancel anyway</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        ) : null}
                        <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: 'center' }} activeOpacity={0.6}>
                            <Text style={styles.closeText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}
function Bullet({ text }: { text: string }) {
    return (
        <View style={styles.bulletRow}>
            <Ionicons name="checkmark" size={16} color="#10B981" style={{ marginTop: 1 }} />
            <Text style={styles.bulletText}>{text}</Text>
        </View>
    );
}

function hexA(hex: string, a: number): string {
    const h = (hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function fmtK(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}
/** Lighten (f>1) or darken (f<1) a hex color, returned as rgb() for gradients. */
function shade(hex: string, f: number): string {
    const h = (hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return `rgb(${cl(((n >> 16) & 255) * f)}, ${cl(((n >> 8) & 255) * f)}, ${cl((n & 255) * f)})`;
}

const styles = StyleSheet.create({
    feasWrap: {
        marginTop: 14,
        padding: 14,
        borderRadius: 16,
        backgroundColor: '#F6F1E9',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: BORDER,
        alignSelf: 'stretch',
    },
    feasSkeleton: { height: 52, borderRadius: 10, backgroundColor: 'rgba(17,17,19,0.06)' },
    feasHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    feasVerdict: { fontFamily: 'Matter-SemiBold', fontSize: 13.5 },
    feasLine: { fontFamily: 'Matter-Regular', fontSize: 13, color: SUB, marginTop: 4, lineHeight: 19 },
    ghostStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    ghostDay: { alignItems: 'center', gap: 3, flex: 1 },
    ghostDot: { width: 8, height: 8, borderRadius: 4 },
    ghostDayLabel: { fontFamily: 'Matter-Medium', fontSize: 10, color: MUTE },
    ghostSlot: { fontFamily: 'Matter-Regular', fontSize: 9, color: MUTE },
    previewWrap: { alignSelf: 'stretch', marginTop: 14 },
    previewLabel: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.4, color: MUTE, marginBottom: 6 },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
    previewText: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: INK },
    previewMore: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 2, marginLeft: 22 },
    priceSub: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 2 },
    manageNote: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: '#5C574E', textAlign: 'center', paddingVertical: 8 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: MUTE },
    h1: { fontFamily: 'PlayfairDisplay', fontSize: 34, color: INK, letterSpacing: -0.6, marginTop: 2 },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, lineHeight: 21, marginTop: 6 },
    errorText: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#B23A3A' },
    section: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: SUB, marginTop: 22 },
    sectionSub: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 3 },
    root: { flex: 1, backgroundColor: CREAM },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sectionLabelInline: { marginBottom: 0 },
    sectionNote: { fontFamily: 'Matter-Medium', fontSize: 12, color: MUTE },
    errorCard: {
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        backgroundColor: CARD,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: BORDER,
    },

    // Flat, hairline-separated marketplace list (no card boxes).
    list: { marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
    rowThumb: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#EFE7DC' },
    rowIconWrap: { width: 46, alignItems: 'center', justifyContent: 'center' },
    rowMid: { flex: 1, marginLeft: 14 },
    rowTitle: { fontFamily: 'Matter-SemiBold', fontSize: 16.5, color: INK, letterSpacing: -0.2 },
    rowSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 2 },
    rowRight: { alignItems: 'flex-end', marginLeft: 10 },
    rowRating: { fontFamily: 'Matter-Medium', fontSize: 11.5, color: '#B0892F' },
    rowPrice: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK, marginTop: 2 },

    // (legacy grid styles below are unused)
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
    gridItem: { width: '48%', marginBottom: 18 },
    cover: {
        aspectRatio: 1,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#EFE7DC',
        justifyContent: 'flex-end',
    },
    watermark: { position: 'absolute', right: -14, top: -10 },
    scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
    coverTitle: {
        fontFamily: 'Matter-Bold',
        fontSize: 15.5,
        color: '#fff',
        paddingHorizontal: 12,
        paddingBottom: 12,
        lineHeight: 19,
        letterSpacing: -0.2,
    },
    pill: {
        position: 'absolute',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.42)',
    },
    pillTL: { top: 10, left: 10 },
    pillTR: { top: 10, right: 10 },
    pillText: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: '#fff' },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 9,
        paddingHorizontal: 2,
    },
    footerAvatar: { width: 18, height: 18, borderRadius: 9, marginRight: 6, backgroundColor: '#EFE7DC' },
    footerCreator: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: SUB, flex: 1 },
    footerPrice: { fontFamily: 'Matter-SemiBold', fontSize: 13, color: INK, marginLeft: 8 },
    cardRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: INK },
    cardTagline: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    creator: { fontFamily: 'Matter-Medium', fontSize: 12, color: SUB },
    meta: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE },
    price: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK },
    // modal
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
    sheetInner: { backgroundColor: CARD, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 34, alignItems: 'center' },
    grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(17,17,19,0.18)', marginBottom: 16 },
    iconWrapLg: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    sheetTitle: { fontFamily: 'PlayfairDisplay', fontSize: 28, color: INK, letterSpacing: -0.4, textAlign: 'center' },
    sheetCreator: { fontFamily: 'Matter-Medium', fontSize: 13, color: SUB, marginTop: 4, textAlign: 'center' },
    sheetTagline: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, marginTop: 10, textAlign: 'center', lineHeight: 21 },
    statsRow: { flexDirection: 'row', gap: 26, marginTop: 18 },
    stat: { alignItems: 'center' },
    statValue: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: INK },
    statLabel: { fontFamily: 'Matter-Regular', fontSize: 11, color: MUTE, marginTop: 2 },
    bullets: { alignSelf: 'stretch', gap: 9, marginTop: 20 },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletText: { fontFamily: 'Matter-Regular', fontSize: 14, color: SUB, flex: 1, lineHeight: 20 },
    priceLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 22, marginBottom: 14 },
    priceBig: { fontFamily: 'Matter-Bold', fontSize: 20, color: INK },
    enteredTag: { fontFamily: 'Matter-Medium', fontSize: 13, color: '#10B981' },
    closeText: { fontFamily: 'Matter-Medium', fontSize: 13, color: MUTE },
});

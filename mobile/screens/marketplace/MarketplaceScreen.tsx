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
import { A11yBlurView as BlurView } from '../../components/glass/SolidFallback';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassButton } from '../../components/glass/GlassButton';
import { useQuery } from '@tanstack/react-query';
import { track } from '../../lib/analytics';
import api, { type MarketplaceItem } from '../../services/api';

const INK = '#111113';
const MUTE = '#8A8A92';
const SUB = '#3A3A3F';
const GOLD = '#D4A017';

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
                Max can fit {d.fits_n_of_m.fits} of {d.fits_n_of_m.of} weekly sessions into
                your real week.
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
    const [maxxes, setMaxxes] = useState<MarketplaceItem[]>([]);
    const [courses, setCourses] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [detail, setDetail] = useState<MarketplaceItem | null>(null);

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
            <ScreenBackdrop>
                <View style={[styles.center, { paddingTop: insets.top }]}>
                    <ActivityIndicator color={INK} />
                    <Text style={styles.loadingText}>Loading Explore</Text>
                </View>
            </ScreenBackdrop>
        );
    }

    return (
        <ScreenBackdrop>
            <ScrollView
                contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 90 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={INK} />}
            >
                <Text style={styles.kicker}>EXPLORE</Text>
                <Text style={styles.h1}>Find your max</Text>
                <Text style={styles.sub}>Pick a program. Max fits it to your real days and keeps you on it.</Text>

                {error ? (
                    <GlassCard radius={18} intensity={30} style={{ marginTop: 16 }}>
                        <View style={{ padding: 16 }}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    </GlassCard>
                ) : null}

                <Text style={styles.section}>MAXES</Text>
                <Text style={styles.sectionSub}>Built by Max. $3.99 a week each.</Text>
                <View style={{ gap: 12, marginTop: 10 }}>
                    {maxxes.map((m) => (
                        <ItemCard key={m.id} item={m} onPress={() => { track('paywall_view', { item: m.id }); setDetail(m); }} />
                    ))}
                </View>

                <Text style={[styles.section, { marginTop: 26 }]}>CREATOR COURSES</Text>
                <Text style={styles.sectionSub}>From coaches and pros. Fit to your schedule.</Text>
                <View style={{ gap: 12, marginTop: 10 }}>
                    {courses.map((c) => (
                        <ItemCard key={c.id} item={c} onPress={() => { track('paywall_view', { item: c.id }); setDetail(c); }} />
                    ))}
                </View>
            </ScrollView>

            <DetailModal item={detail} onClose={() => setDetail(null)} onEntered={markEntered} />
        </ScreenBackdrop>
    );
}

function ItemCard({ item, onPress }: { item: MarketplaceItem; onPress: () => void }) {
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
            <GlassCard radius={22} intensity={36}>
                <View style={styles.cardRow}>
                    <View style={[styles.iconWrap, { backgroundColor: hexA(item.color, 0.16) }]}>
                        <Ionicons name={(item.icon as any) || 'ellipse-outline'} size={22} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                            {item.entered ? <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} /> : null}
                        </View>
                        <Text style={styles.cardTagline} numberOfLines={1}>{item.tagline}</Text>
                        <View style={styles.metaRow}>
                            {!item.native ? (
                                <Text style={styles.creator} numberOfLines={1}>
                                    @{item.creator.handle}{item.creator.verified ? '  ✓' : ''}
                                </Text>
                            ) : (
                                <Text style={styles.creator}>by Max</Text>
                            )}
                            {item.rating ? <Text style={styles.meta}>  ★ {item.rating.toFixed(1)}</Text> : null}
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.price, item.entered && { color: '#10B981' }]}>
                            {item.entered ? 'In' : item.price_label}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={MUTE} style={{ marginTop: 4 }} />
                    </View>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
}

function DetailModal({ item, onClose, onEntered }: { item: MarketplaceItem | null; onClose: () => void; onEntered: (id: string) => void }) {
    const [busy, setBusy] = useState(false);
    const [miniReveal, setMiniReveal] = useState<{ count: number; first: string } | null>(null);
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
            await api.enterMarketplaceItem(item.id);
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
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                <View style={styles.sheet}>
                    <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
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
                                <GlassButton variant="primary" label="See my day" onPress={onClose} />
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
                            {item.native ? 'by Max' : `by ${item.creator.name}  @${item.creator.handle}${item.creator.verified ? '  ✓' : ''}`}
                        </Text>
                        <Text style={styles.sheetTagline}>{item.tagline}</Text>

                        {!item.native ? (
                            <View style={styles.statsRow}>
                                {item.participants ? <Stat label="on plan" value={fmtK(item.participants)} /> : null}
                                {item.completion_rate ? <Stat label="finish wk 1" value={`${Math.round(item.completion_rate * 100)}%`} /> : null}
                                {item.rating ? <Stat label="rating" value={`★ ${item.rating.toFixed(1)}`} /> : null}
                            </View>
                        ) : null}

                        <FeasibilityBlock programId={item.id} />

                        {!item.native && item.weeks ? (
                            <View style={styles.previewWrap}>
                                <Text style={styles.previewLabel}>WHAT'S INSIDE</Text>
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
                            {item.entered ? <Text style={styles.enteredTag}>You're in</Text> : null}
                        </View>

                        <GlassButton
                            variant="primary"
                            label={item.entered ? 'Open' : busy ? 'One sec' : item.native ? 'Enter this max' : 'Get this plan'}
                            onPress={item.entered ? onClose : enter}
                            loading={busy}
                        />
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

const styles = StyleSheet.create({
    feasWrap: {
        marginTop: 14,
        padding: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: MUTE },
    h1: { fontFamily: 'PlayfairDisplay', fontSize: 34, color: INK, letterSpacing: -0.6, marginTop: 2 },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, lineHeight: 21, marginTop: 6 },
    errorText: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: '#B23A3A' },
    section: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: SUB, marginTop: 22 },
    sectionSub: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 3 },
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
    sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
    sheetInner: { backgroundColor: 'rgba(255,255,255,0.82)', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 34, alignItems: 'center' },
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

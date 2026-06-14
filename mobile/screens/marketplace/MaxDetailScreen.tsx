/**
 * MaxDetailScreen — the full "browse before you buy" page for a max or creator
 * course. A real pushed screen (not a sheet), so there's room to actually learn
 * what you're paying for: a hero with the creator's photo + social proof, the
 * "fits your real week" sim, what you'll get, the week-by-week curriculum, the
 * instructor's bio + credentials, real reviews, an FAQ and a guarantee — with a
 * sticky price + CTA that follows you down the page.
 *
 * Content comes from GET /marketplace/item/{id} (the `detail` payload). The card
 * passed in route params renders instantly; the rest fills in on fetch.
 */
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api, { type MarketplaceItem } from '../../services/api';
import { hexA } from '../../utils/scheduleAggregation';
import { track } from '../../lib/analytics';

const CANVAS = '#F7F0EA';
const INK = '#1C1A17';
const MUTE = '#97928A';
const SUB = '#5C574E';
const GOLD = '#2C6BED';
const ACCENT = '#2F6B4E';
const HAIRLINE = '#E2DBCD';

function shade(hex: string, f: number): string {
    const h = (hex || '#2C6BED').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return `rgb(${cl(((n >> 16) & 255) * f)}, ${cl(((n >> 8) & 255) * f)}, ${cl((n & 255) * f)})`;
}
function fmtK(n?: number): string {
    if (!n) return '';
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}

const VERDICT = {
    green: { color: ACCENT, line: 'Fits your real week' },
    amber: { color: '#B07D10', line: 'Tight, but workable' },
    red: { color: '#C0452C', line: 'Your week is packed' },
};

function Feasibility({ id }: { id: string }) {
    const q = useQuery({
        queryKey: ['feasibility', id],
        queryFn: () => api.getPlannerFeasibility(id),
        staleTime: 5 * 60_000,
    });
    if (q.isLoading) return <View style={[styles.card, styles.feasSkeleton]} />;
    const d = q.data;
    if (!d) return null;
    const meta = VERDICT[d.verdict] ?? VERDICT.amber;
    return (
        <View style={styles.card}>
            <View style={styles.rowCenter}>
                <Ionicons name="checkmark-circle" size={16} color={meta.color} />
                <Text style={[styles.feasVerdict, { color: meta.color }]}>{meta.line}</Text>
            </View>
            <Text style={styles.feasLine}>
                Max can fit {d.fits_n_of_m.fits} of {d.fits_n_of_m.of} weekly sessions into your real week.
            </Text>
            <View style={styles.ghostRow}>
                {d.ghost_week.map((g) => (
                    <View key={g.day} style={styles.ghostDay}>
                        <View style={[styles.ghostDot, { backgroundColor: g.slots.length ? GOLD : 'rgba(28,26,23,0.12)' }]} />
                        <Text style={styles.ghostLetter}>{g.day[0]}</Text>
                        <Text style={styles.ghostSlot}>{g.slots[0] || ' '}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function Stars({ n }: { n: number }) {
    return (
        <View style={{ flexDirection: 'row', gap: 1 }}>
            {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons key={i} name={i <= Math.round(n) ? 'star' : 'star-outline'} size={12} color="#E0A500" />
            ))}
        </View>
    );
}

function Accordion({ title, sub, badge, children, open, onToggle }: {
    title: string; sub?: string; badge?: string; children?: React.ReactNode; open: boolean; onToggle: () => void;
}) {
    return (
        <View style={styles.accItem}>
            <TouchableOpacity style={styles.accHead} activeOpacity={0.7} onPress={onToggle}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.accTitle}>{title}</Text>
                    {sub ? <Text style={styles.accSub}>{sub}</Text> : null}
                </View>
                {badge ? <Text style={styles.freeBadge}>{badge}</Text> : null}
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={MUTE} />
            </TouchableOpacity>
            {open ? <View style={styles.accBody}>{children}</View> : null}
        </View>
    );
}

export default function MaxDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const passed = route.params?.item as MarketplaceItem | undefined;
    const itemId = route.params?.itemId || passed?.id;

    const [item, setItem] = useState<MarketplaceItem | undefined>(passed);
    const [busy, setBusy] = useState(false);
    const [openWeek, setOpenWeek] = useState(0);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        let alive = true;
        if (!itemId) return;
        api.getMarketplaceItem(itemId).then((full) => { if (alive) setItem(full); }).catch(() => {});
        track('paywall_view', { item: itemId });
        return () => { alive = false; };
    }, [itemId]);

    if (!item) {
        return (
            <View style={[styles.root, styles.center]}>
                <ActivityIndicator color={INK} />
            </View>
        );
    }

    const d = item.detail || {};
    const isCourse = !item.native;
    const base = item.color || GOLD;

    const goToSchedule = () => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: 'MasterScheduleTab' });
        } catch { navigation.goBack(); }
    };

    // Native maxes onboard in chat: the coach asks a few questions and tailors
    // the freshly-built schedule. `initSchedule` is the maxx token (= item.id).
    const goToChat = (maxxId: string) => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) {
                navigationRef.navigate('Main', { screen: 'Chat', params: { initSchedule: maxxId } });
            }
        } catch { navigation.goBack(); }
    };

    const onCta = async () => {
        if (item.entered) { goToSchedule(); return; }
        if (busy) return;
        setBusy(true);
        try {
            const res = await api.enterMarketplaceItem(item.id);
            if (res.checkout_url) {
                if (Platform.OS === 'web') window.location.href = res.checkout_url;
                else { const { Linking } = require('react-native'); await Linking.openURL(res.checkout_url); }
                return;
            }
            track('enter', { item: item.id, kind: item.native ? 'maxx' : 'course' });
            setItem({ ...item, entered: true });
            if (isCourse) goToSchedule(); else goToChat(item.id);
        } catch {
            // keep page open; user can retry
        } finally {
            setBusy(false);
        }
    };

    const ctaLabel = item.entered
        ? 'Open my plan'
        : busy
          ? 'One sec…'
          : `Start ${isCourse ? 'this plan' : item.title} · ${item.price_label.replace(' / week', '/wk')}`;

    return (
        <View style={styles.root}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {/* Flat color-pocket header */}
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => navigation.goBack()}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="chevron-back" size={24} color={INK} />
                    </TouchableOpacity>
                    <View style={[styles.heroIcon, { backgroundColor: hexA(base, 0.12) }]}>
                        <Ionicons name={(item.icon as any) || 'sparkles-outline'} size={30} color={base} />
                    </View>
                    {item.category ? <Text style={styles.heroKicker}>{item.category.toUpperCase()}</Text> : null}
                    <Text style={styles.heroTitle}>{item.title}</Text>
                    <View style={[styles.heroRule, { backgroundColor: base }]} />
                </View>

                {/* Creator + social proof */}
                <View style={styles.metaWrap}>
                    <View style={styles.creatorRow}>
                        {item.creator.avatar ? (
                            <Image source={{ uri: item.creator.avatar }} style={styles.avatar} contentFit="cover" transition={150} />
                        ) : (
                            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: shade(base, 1.1) }]}>
                                <Ionicons name="sparkles" size={18} color="#fff" />
                            </View>
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={styles.creatorName}>
                                {item.native ? 'Built by Max' : item.creator.name}
                                {item.creator.verified ? '  ✓' : ''}
                            </Text>
                            <Text style={styles.creatorHandle}>
                                {item.native ? 'The Max team' : `@${item.creator.handle}`}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.lead}>{d.long_description || item.tagline}</Text>

                    {isCourse ? (
                        <View style={styles.statsRow}>
                            {item.rating ? <Stat value={`${item.rating.toFixed(1)} ★`} label="rating" /> : null}
                            {item.participants ? <Stat value={fmtK(item.participants)} label="members" /> : null}
                            {item.completion_rate ? <Stat value={`${Math.round(item.completion_rate * 100)}%`} label="finish wk 1" /> : null}
                        </View>
                    ) : null}
                </View>

                {/* Fits your week */}
                <Section><Feasibility id={item.id} /></Section>

                {/* What you'll get */}
                {d.outcomes?.length ? (
                    <Section label="WHAT YOU'LL GET">
                        <View style={styles.card}>
                            {d.outcomes.map((o, i) => (
                                <View key={i} style={[styles.bulletRow, i > 0 && { marginTop: 12 }]}>
                                    <Ionicons name="checkmark-circle" size={18} color={ACCENT} style={{ marginTop: 1 }} />
                                    <Text style={styles.bulletText}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    </Section>
                ) : null}

                {/* For you if */}
                {d.for_you_if?.length ? (
                    <Section label="THIS IS FOR YOU IF">
                        <View style={styles.card}>
                            {d.for_you_if.map((o, i) => (
                                <View key={i} style={[styles.bulletRow, i > 0 && { marginTop: 12 }]}>
                                    <Ionicons name="ellipse" size={7} color={MUTE} style={{ marginTop: 7 }} />
                                    <Text style={styles.bulletText}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    </Section>
                ) : null}

                {/* Curriculum */}
                {d.curriculum?.length ? (
                    <Section label="WHAT'S INSIDE">
                        <View style={styles.card}>
                            {d.curriculum.map((w, i) => (
                                <Accordion
                                    key={i}
                                    title={w.title}
                                    badge={isCourse && i === 0 ? 'Free preview' : undefined}
                                    open={openWeek === i}
                                    onToggle={() => setOpenWeek(openWeek === i ? -1 : i)}
                                >
                                    {w.lessons.map((l, j) => (
                                        <View key={j} style={styles.lessonRow}>
                                            <Ionicons
                                                name={i === 0 ? 'play-circle-outline' : 'lock-closed-outline'}
                                                size={15}
                                                color={i === 0 ? GOLD : MUTE}
                                            />
                                            <Text style={styles.lessonText}>{l}</Text>
                                        </View>
                                    ))}
                                </Accordion>
                            ))}
                        </View>
                    </Section>
                ) : null}

                {/* Instructor */}
                {isCourse && d.bio ? (
                    <Section label="YOUR INSTRUCTOR">
                        <View style={styles.card}>
                            <View style={styles.creatorRow}>
                                {item.creator.avatar ? (
                                    <Image source={{ uri: item.creator.avatar }} style={styles.avatarLg} contentFit="cover" transition={150} />
                                ) : null}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.creatorName}>{item.creator.name}{item.creator.verified ? '  ✓' : ''}</Text>
                                    <Text style={styles.creatorHandle}>@{item.creator.handle}</Text>
                                </View>
                            </View>
                            <Text style={[styles.bioText]}>{d.bio}</Text>
                            {d.credentials?.length ? (
                                <View style={styles.chipsWrap}>
                                    {d.credentials.map((c, i) => (
                                        <View key={i} style={styles.credChip}><Text style={styles.credText}>{c}</Text></View>
                                    ))}
                                </View>
                            ) : null}
                        </View>
                    </Section>
                ) : null}

                {/* Reviews */}
                {d.reviews?.length ? (
                    <Section label={item.rating ? `REVIEWS · ${item.rating.toFixed(1)} ★` : 'REVIEWS'}>
                        <View style={{ gap: 10 }}>
                            {d.reviews.map((r, i) => (
                                <View key={i} style={styles.card}>
                                    <View style={styles.rowCenter}>
                                        {r.avatar ? <Image source={{ uri: r.avatar }} style={styles.revAvatar} contentFit="cover" /> : null}
                                        <Text style={styles.revName}>{r.name}</Text>
                                        <View style={{ flex: 1 }} />
                                        <Stars n={r.rating} />
                                    </View>
                                    <Text style={styles.revText}>{r.text}</Text>
                                </View>
                            ))}
                        </View>
                    </Section>
                ) : null}

                {/* FAQ */}
                {d.faqs?.length ? (
                    <Section label="QUESTIONS">
                        <View style={styles.card}>
                            {d.faqs.map((f, i) => (
                                <Accordion key={i} title={f.q} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)}>
                                    <Text style={styles.faqAnswer}>{f.a}</Text>
                                </Accordion>
                            ))}
                        </View>
                    </Section>
                ) : null}

                {/* Guarantee */}
                {d.guarantee ? (
                    <View style={styles.guaranteeRow}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={ACCENT} />
                        <Text style={styles.guaranteeText}>{d.guarantee}</Text>
                    </View>
                ) : null}
            </ScrollView>

            {/* Sticky price + CTA */}
            <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.ctaPrice}>{item.price_label}</Text>
                    <Text style={styles.ctaSub}>
                        {item.price_model === 'weekly' ? 'cancel anytime' : item.weeks ? `${item.weeks} weeks · one payment` : 'one payment'}
                    </Text>
                </View>
                <TouchableOpacity style={[styles.ctaBtn, item.entered && { backgroundColor: ACCENT }]} activeOpacity={0.88} onPress={onCta} disabled={busy}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaBtnText}>{item.entered ? 'Open' : 'Start'}</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
            {children}
        </View>
    );
}
function Stat({ value, label }: { value: string; label: string }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CANVAS },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { paddingHorizontal: 20, paddingBottom: 4 },
    backBtn: { width: 40, height: 40, marginLeft: -8, alignItems: 'flex-start', justifyContent: 'center', marginBottom: 10 },
    heroIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroKicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: MUTE, marginBottom: 6 },
    heroTitle: { fontFamily: 'PlayfairDisplay', fontSize: 36, color: INK, letterSpacing: -0.8, lineHeight: 40 },
    heroRule: { width: 40, height: 3, borderRadius: 2, marginTop: 14 },

    metaWrap: { paddingHorizontal: 20, paddingTop: 18 },
    creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: HAIRLINE },
    avatarLg: { width: 52, height: 52, borderRadius: 26, backgroundColor: HAIRLINE },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    creatorName: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: INK },
    creatorHandle: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 1 },
    lead: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 22, marginTop: 14 },
    statsRow: { flexDirection: 'row', gap: 28, marginTop: 18 },
    stat: {},
    statValue: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: INK },
    statLabel: { fontFamily: 'Matter-Regular', fontSize: 11.5, color: MUTE, marginTop: 2 },

    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: MUTE, marginBottom: 10 },
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIRLINE, padding: 16,
        shadowColor: '#2E2A20', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    feasSkeleton: { height: 96 },
    feasVerdict: { fontFamily: 'Matter-SemiBold', fontSize: 14 },
    feasLine: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB, marginTop: 6, lineHeight: 19 },
    ghostRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    ghostDay: { alignItems: 'center', gap: 4, flex: 1 },
    ghostDot: { width: 8, height: 8, borderRadius: 4 },
    ghostLetter: { fontFamily: 'Matter-Medium', fontSize: 10.5, color: MUTE },
    ghostSlot: { fontFamily: 'Matter-Regular', fontSize: 9.5, color: MUTE },

    bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    bulletText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 21 },

    accItem: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE },
    accHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
    accTitle: { fontFamily: 'Matter-SemiBold', fontSize: 14.5, color: INK },
    accSub: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 2 },
    freeBadge: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: GOLD },
    accBody: { paddingBottom: 14, gap: 9 },
    lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    lessonText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB },

    bioText: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 22, marginTop: 14 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    credChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F2EDE4', borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
    credText: { fontFamily: 'Matter-Medium', fontSize: 12, color: SUB },

    revAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: HAIRLINE },
    revName: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK },
    revText: { fontFamily: 'Matter-Regular', fontSize: 14, color: SUB, lineHeight: 21, marginTop: 10 },

    faqAnswer: { fontFamily: 'Matter-Regular', fontSize: 14, color: SUB, lineHeight: 21 },

    guaranteeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 24 },
    guaranteeText: { flex: 1, fontFamily: 'Matter-Medium', fontSize: 13, color: SUB, lineHeight: 19 },

    ctaBar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 20, paddingTop: 12,
        backgroundColor: 'rgba(247,240,234,0.96)',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE,
    },
    ctaPrice: { fontFamily: 'Matter-Bold', fontSize: 18, color: INK },
    ctaSub: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 1 },
    ctaBtn: { backgroundColor: INK, borderRadius: 999, paddingHorizontal: 30, paddingVertical: 15, minWidth: 120, alignItems: 'center' },
    ctaBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: '#fff' },
});

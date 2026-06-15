/**
 * MaxDetailScreen — the page you land on when you tap a max (or creator course)
 * in Explore. Minimalist + editorial: a calm cream page, Fraunces serif title,
 * the max's colour used only as a small accent.
 *
 * The information shown ADAPTS to what you're looking at:
 *   • A native max ($3.99/wk, ongoing) is lean — the one-line promise, "does it
 *     fit my real week", what you'll get, and one honest line of proof. No fake
 *     curriculum / instructor / FAQ filler.
 *   • A creator course (one payment, fixed weeks) earns the deeper page —
 *     curriculum, instructor, reviews, FAQ, guarantee.
 *
 * Card data from route params renders instantly; GET /marketplace/item/{id}
 * fills the rest in.
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
const CARD = '#FCFAF6';
const INK = '#1C1A17';
const MUTE = '#97928A';
const SUB = '#5C574E';
const GOLD = '#2C6BED';
const ACCENT = '#2F6B4E';
const HAIRLINE = '#E8E0D3';
const SERIF = 'Fraunces';
const SERIF_I = 'Fraunces-Italic';

function fmtK(n?: number): string {
    if (!n) return '';
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}

const VERDICT = {
    green: { color: ACCENT, line: 'Fits your real week' },
    amber: { color: '#B07D10', line: 'Tight, but workable' },
    red: { color: '#C0452C', line: 'Your week is packed' },
};

/** "Fits your real week" — the moat, made visible. A clean card. */
function Feasibility({ id, color }: { id: string; color: string }) {
    const q = useQuery({
        queryKey: ['feasibility', id],
        queryFn: () => api.getPlannerFeasibility(id),
        staleTime: 5 * 60_000,
    });
    const d = q.data;
    if (q.isLoading || !d) return <View style={[styles.card, { height: 112 }]} />;
    const meta = VERDICT[d.verdict] ?? VERDICT.amber;
    return (
        <View style={styles.card}>
            <View style={styles.rowCenter}>
                <Ionicons name="checkmark-circle" size={16} color={meta.color} />
                <Text style={[styles.feasVerdict, { color: meta.color }]}>{meta.line}</Text>
            </View>
            <Text style={styles.feasLine}>
                Max fits {d.fits_n_of_m.fits} of {d.fits_n_of_m.of} weekly sessions into your real week.
            </Text>
            <View style={styles.ghostRow}>
                {d.ghost_week.map((g) => (
                    <View key={g.day} style={styles.ghostDay}>
                        <View style={[styles.ghostDot, { backgroundColor: g.slots.length ? color : 'rgba(28,26,23,0.14)' }]} />
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

function Accordion({ title, badge, children, open, onToggle }: {
    title: string; badge?: string; children?: React.ReactNode; open: boolean; onToggle: () => void;
}) {
    return (
        <View style={styles.accItem}>
            <TouchableOpacity style={styles.accHead} activeOpacity={0.7} onPress={onToggle}>
                <Text style={styles.accTitle}>{title}</Text>
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
    const quote = d.reviews?.[0];

    const goToSchedule = () => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: 'MasterScheduleTab' });
        } catch { navigation.goBack(); }
    };
    const goToChat = (maxxId: string) => {
        try {
            const { navigationRef } = require('../../lib/navigationRef');
            if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: 'Chat', params: { initSchedule: maxxId } });
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

    return (
        <View style={styles.root}>
            {/* Minimal top bar — just a back affordance over the cream page. */}
            <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingBottom: 130 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header — type-led, no templated icon chip. */}
                <View style={styles.header}>
                    <View style={styles.kickerRow}>
                        <View style={[styles.kickerDot, { backgroundColor: base }]} />
                        <Text style={styles.kicker}>{(item.category || (isCourse ? 'Course' : 'Max')).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.heroTitle}>{item.title}</Text>
                    <View style={[styles.heroRule, { backgroundColor: base }]} />
                    <Text style={styles.heroTagline}>{item.tagline}</Text>
                </View>

                {/* Creator — courses only. */}
                {isCourse ? (
                    <View style={styles.creatorRow}>
                        {item.creator.avatar ? (
                            <Image source={{ uri: item.creator.avatar }} style={styles.avatar} contentFit="cover" transition={150} />
                        ) : (
                            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: hexA(base, 0.18) }]}>
                                <Ionicons name="person" size={16} color={base} />
                            </View>
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={styles.creatorName}>{item.creator.name}{item.creator.verified ? '  ✓' : ''}</Text>
                            <Text style={styles.creatorHandle}>@{item.creator.handle}</Text>
                        </View>
                        {item.rating ? (
                            <View style={{ alignItems: 'flex-end' }}>
                                <Stars n={item.rating} />
                                <Text style={styles.ratingSub}>{item.rating.toFixed(1)} · {fmtK(item.participants)} members</Text>
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {/* The promise. */}
                {d.long_description ? <Text style={styles.lead}>{d.long_description}</Text> : null}

                {/* Fits your week. */}
                <View style={styles.block}>
                    <Feasibility id={item.id} color={base} />
                </View>

                {/* What you'll get. */}
                {d.outcomes?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>What you'll get</Text>
                        <View style={{ gap: 13 }}>
                            {d.outcomes.map((o, i) => (
                                <View key={i} style={styles.outRow}>
                                    <Ionicons name="checkmark" size={17} color={base} style={{ marginTop: 2 }} />
                                    <Text style={styles.outText}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {/* One honest line of proof — native maxes keep it to one quote. */}
                {!isCourse && quote ? (
                    <View style={styles.block}>
                        <Text style={styles.pullQuote}>“{quote.text}”</Text>
                        <Text style={styles.pullAttr}>— {quote.name}</Text>
                    </View>
                ) : null}

                {/* ── Course-only depth ─────────────────────────────────── */}
                {isCourse && d.for_you_if?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>This is for you if</Text>
                        <View style={{ gap: 11 }}>
                            {d.for_you_if.map((o, i) => (
                                <View key={i} style={styles.bulletRow}>
                                    <Ionicons name="ellipse" size={6} color={MUTE} style={{ marginTop: 8 }} />
                                    <Text style={styles.bulletText}>{o}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {isCourse && d.curriculum?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>What's inside</Text>
                        <View style={styles.cardHair}>
                            {d.curriculum.map((w, i) => (
                                <Accordion
                                    key={i}
                                    title={w.title}
                                    badge={i === 0 ? 'Free preview' : undefined}
                                    open={openWeek === i}
                                    onToggle={() => setOpenWeek(openWeek === i ? -1 : i)}
                                >
                                    {w.lessons.map((l, j) => (
                                        <View key={j} style={styles.lessonRow}>
                                            <Ionicons name={i === 0 ? 'play-circle-outline' : 'lock-closed-outline'} size={15} color={i === 0 ? base : MUTE} />
                                            <Text style={styles.lessonText}>{l}</Text>
                                        </View>
                                    ))}
                                </Accordion>
                            ))}
                        </View>
                    </View>
                ) : null}

                {isCourse && d.bio ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>Your instructor</Text>
                        <View style={styles.creatorRowInline}>
                            {item.creator.avatar ? (
                                <Image source={{ uri: item.creator.avatar }} style={styles.avatarLg} contentFit="cover" transition={150} />
                            ) : null}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.creatorName}>{item.creator.name}{item.creator.verified ? '  ✓' : ''}</Text>
                                <Text style={styles.creatorHandle}>@{item.creator.handle}</Text>
                            </View>
                        </View>
                        <Text style={styles.bioText}>{d.bio}</Text>
                        {d.credentials?.length ? (
                            <View style={styles.chipsWrap}>
                                {d.credentials.map((c, i) => (
                                    <View key={i} style={styles.credChip}><Text style={styles.credText}>{c}</Text></View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {isCourse && d.reviews?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>{item.rating ? `Reviews · ${item.rating.toFixed(1)} ★` : 'Reviews'}</Text>
                        <View style={{ gap: 16 }}>
                            {d.reviews.map((r, i) => (
                                <View key={i}>
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
                    </View>
                ) : null}

                {isCourse && d.faqs?.length ? (
                    <View style={styles.block}>
                        <Text style={styles.sectionLabel}>Questions</Text>
                        <View style={styles.cardHair}>
                            {d.faqs.map((f, i) => (
                                <Accordion key={i} title={f.q} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)}>
                                    <Text style={styles.faqAnswer}>{f.a}</Text>
                                </Accordion>
                            ))}
                        </View>
                    </View>
                ) : null}

                {d.guarantee ? (
                    <View style={styles.guaranteeRow}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={ACCENT} />
                        <Text style={styles.guaranteeText}>{d.guarantee}</Text>
                    </View>
                ) : null}
            </ScrollView>

            {/* Sticky CTA */}
            <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 14 }]}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.ctaPrice}>{item.price_label}</Text>
                    <Text style={styles.ctaSub}>
                        {item.price_model === 'weekly' ? 'cancel anytime' : item.weeks ? `${item.weeks} weeks · one payment` : 'one payment'}
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.ctaBtn, { backgroundColor: item.entered ? ACCENT : INK }]}
                    activeOpacity={0.88}
                    onPress={onCta}
                    disabled={busy}
                >
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaBtnText}>{item.entered ? 'Open' : 'Start'}</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CANVAS },
    center: { alignItems: 'center', justifyContent: 'center' },

    topBar: { paddingHorizontal: 14, paddingBottom: 2 },
    backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },

    header: { paddingHorizontal: 22, paddingTop: 10 },
    kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
    kickerDot: { width: 7, height: 7, borderRadius: 4 },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.8, color: MUTE },
    heroTitle: { fontFamily: SERIF, fontSize: 44, color: INK, letterSpacing: -1, lineHeight: 47 },
    heroRule: { width: 38, height: 3, borderRadius: 2, marginTop: 18 },
    heroTagline: { fontFamily: 'Matter-Regular', fontSize: 16.5, color: SUB, marginTop: 16, lineHeight: 24 },

    creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, marginTop: 22 },
    creatorRowInline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: HAIRLINE },
    avatarLg: { width: 50, height: 50, borderRadius: 25, backgroundColor: HAIRLINE },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    creatorName: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    creatorHandle: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 1 },
    ratingSub: { fontFamily: 'Matter-Regular', fontSize: 11, color: MUTE, marginTop: 3 },

    lead: { fontFamily: 'Matter-Regular', fontSize: 16, color: SUB, lineHeight: 24, paddingHorizontal: 22, marginTop: 22 },

    block: { paddingHorizontal: 22, marginTop: 28 },
    sectionLabel: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK, marginBottom: 15 },

    // Cards
    card: {
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIRLINE,
        padding: 17,
    },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    feasVerdict: { fontFamily: 'Matter-SemiBold', fontSize: 14.5 },
    feasLine: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB, marginTop: 7, lineHeight: 19 },
    ghostRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
    ghostDay: { alignItems: 'center', gap: 5, flex: 1 },
    ghostDot: { width: 8, height: 8, borderRadius: 4 },
    ghostLetter: { fontFamily: 'Matter-Medium', fontSize: 10.5, color: MUTE },
    ghostSlot: { fontFamily: 'Matter-Regular', fontSize: 9.5, color: MUTE },

    // Outcomes
    outRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
    outText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 15, color: INK, lineHeight: 22 },

    // Pull quote
    pullQuote: { fontFamily: SERIF_I, fontSize: 21, color: INK, lineHeight: 30, letterSpacing: -0.2 },
    pullAttr: { fontFamily: 'Matter-Medium', fontSize: 13, color: MUTE, marginTop: 10 },

    bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    bulletText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 22 },

    cardHair: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE },
    accItem: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIRLINE },
    accHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 15 },
    accTitle: { flex: 1, fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    freeBadge: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: GOLD },
    accBody: { paddingBottom: 15, gap: 10 },
    lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    lessonText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB },

    bioText: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 23, marginTop: 14 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    credChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F2EDE4', borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
    credText: { fontFamily: 'Matter-Medium', fontSize: 12, color: SUB },

    revAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: HAIRLINE },
    revName: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK },
    revText: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 22, marginTop: 9 },

    faqAnswer: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 22 },

    guaranteeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, marginTop: 28 },
    guaranteeText: { flex: 1, fontFamily: 'Matter-Medium', fontSize: 13, color: SUB, lineHeight: 19 },

    // Sticky CTA
    ctaBar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 22, paddingTop: 14,
        backgroundColor: 'rgba(247,240,234,0.97)',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE,
    },
    ctaPrice: { fontFamily: 'Matter-Bold', fontSize: 18, color: INK },
    ctaSub: { fontFamily: 'Matter-Regular', fontSize: 12, color: SUB, marginTop: 1 },
    ctaBtn: { borderRadius: 999, paddingHorizontal: 32, paddingVertical: 15, minWidth: 124, alignItems: 'center' },
    ctaBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: '#fff' },
});

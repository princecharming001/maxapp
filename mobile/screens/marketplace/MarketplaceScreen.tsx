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
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassButton } from '../../components/glass/GlassButton';
import api, { type MarketplaceItem } from '../../services/api';

const INK = '#111113';
const MUTE = '#8A8A92';
const SUB = '#3A3A3F';

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
                        <ItemCard key={m.id} item={m} onPress={() => setDetail(m)} />
                    ))}
                </View>

                <Text style={[styles.section, { marginTop: 26 }]}>CREATOR COURSES</Text>
                <Text style={styles.sectionSub}>From coaches and pros. Fit to your schedule.</Text>
                <View style={{ gap: 12, marginTop: 10 }}>
                    {courses.map((c) => (
                        <ItemCard key={c.id} item={c} onPress={() => setDetail(c)} />
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
    if (!item) return null;
    const isWeekly = item.price_model === 'weekly';

    const enter = async () => {
        if (busy || item.entered) return;
        setBusy(true);
        try {
            await api.enterMarketplaceItem(item.id);
            onEntered(item.id);
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
                                {item.rating ? <Stat label="rating" value={`★ ${item.rating.toFixed(1)}`} /> : null}
                                {item.participants ? <Stat label="on plan" value={fmtK(item.participants)} /> : null}
                                {item.completion_rate ? <Stat label="finish wk 1" value={`${Math.round(item.completion_rate * 100)}%`} /> : null}
                            </View>
                        ) : null}

                        <View style={styles.bullets}>
                            <Bullet text="Fit to your real wake, work and gym times" />
                            <Bullet text="Reminders at the right moment, not all day" />
                            <Bullet text={isWeekly ? 'Cancel anytime' : `${item.weeks ?? ''} weeks, one payment`} />
                        </View>

                        <View style={styles.priceLine}>
                            <Text style={styles.priceBig}>{item.price_label}</Text>
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

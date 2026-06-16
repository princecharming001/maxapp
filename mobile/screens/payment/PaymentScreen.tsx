/**
 * PaymentScreen — two-tier subscription page, Craft aesthetic.
 *
 * Minimalist + flat: warm cream canvas, ONE dominant ink hero (Chad) and a
 * deliberately quiet single-line option (Chadlite). Ink on cream, one muted-gold
 * accent. No gradients, no blur.
 *
 * Conversion structure (ethical persuasion — no fake scarcity, no hidden
 * billing; the auto-renew + cancel-anytime disclosure stays):
 *   • Center-stage / visual dominance — Chad is the big card; Chadlite is a
 *     subordinate row, so the eye and the default land on the premium tier.
 *   • Anchoring via price-per-day — the weekly price reframed as "$0.86/day"
 *     reads as trivially small.
 *   • Decoy / value-gap — Chadlite is framed as "the basics"; a bridge line
 *     ("only $2/week more") makes the upgrade feel negligible for everything.
 *   • Social proof — "most popular" on Chad.
 *   • Charm pricing — $5.99 / $3.99.
 *
 * Tiers:
 *   Chadlite (basic):   chatbot · 2 active programs · weekly face scan
 *   Chad (premium):     chatbot pro · 3 active programs · daily scans
 *                       · full course library · priority support
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ScrollView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStripeSubscription } from '../../hooks/useStripeSubscription';
import { useAppleSubscription } from '../../hooks/useAppleSubscription';
import { colors, fonts, spacing } from '../../theme/dark';
import { APPLE_IAP_BASIC_SKU, APPLE_IAP_PREMIUM_SKU } from '../../constants/appleIap';
import { useFlag } from '../../constants/featureFlags';

/* ── Tier features ────────────────────────────────────────────────────── */

const PREMIUM_PERKS: string[] = [
    'Chatbot Pro',
    '3 active programs',
    'Daily face scans',
    'Full course library',
    'Priority support',
];

const BASIC_SUMMARY = 'The basics — 2 programs, weekly scan';

const IS_IOS = Platform.OS === 'ios';
const INK = '#1C1A17';
const CREAM = '#F7F0EA';
const GOLD = '#C9A24E';

// Dev-only payment bypass: shows ONLY in the computer/web dev build, never in
// the real native app (Platform.OS !== 'web') and never in a production bundle
// (__DEV__ false). Lets you skip Stripe/StoreKit and proceed exactly as if the
// subscription had actually gone through.
const SHOW_DEV_BYPASS = Platform.OS === 'web' && __DEV__;

/* ── Price framing helpers (anchoring) ────────────────────────────────────
   Parse a localized price like "$5.99" into a symbol + amount so we can show
   a per-day figure and the Chad↔Chadlite delta. Only used when there's a
   leading currency symbol (USD/GBP/…); trailing-symbol locales safely skip it
   rather than render a wrong number. */
function parseAmount(s: string): { sym: string; n: number } | null {
    const m = String(s).match(/^\s*([^\d\s]+)?\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const sym = (m[1] || '').trim();
    const n = parseFloat(m[2].replace(',', '.'));
    if (!isFinite(n)) return null;
    return { sym, n };
}
function perDayLabel(weekly: string): string | null {
    const a = parseAmount(weekly);
    if (!a || a.n <= 0 || !a.sym) return null;
    return `${a.sym}${(a.n / 7).toFixed(2)}`;
}
function deltaLabel(premium: string, basic: string): string | null {
    const p = parseAmount(premium);
    const b = parseAmount(basic);
    if (!p || !b || !p.sym || p.n <= b.n) return null;
    const d = p.n - b.n;
    return `${p.sym}${Number.isInteger(d) ? d.toFixed(0) : d.toFixed(2)}`;
}

export default function PaymentScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user, refreshUser } = useAuth();

    // Face-scan kill switch (constants/featureFlags). When off, the paywall does
    // NOT gate purchase on a completed scan, and the scan-related perk/summary
    // copy drops out so nothing references a feature the user can't reach.
    const faceScanEnabled = useFlag('faceScan');
    const premiumPerks = faceScanEnabled ? PREMIUM_PERKS : PREMIUM_PERKS.filter((p) => !/scan/i.test(p));
    const basicSummary = faceScanEnabled ? BASIC_SUMMARY : 'The basics — 2 active programs';

    const stripe = useStripeSubscription();
    const apple = useAppleSubscription();
    const useAppleSim = !IS_IOS && __DEV__ && Platform.OS === 'web';
    const sub = IS_IOS || useAppleSim ? apple : stripe;

    const appleRestoring = 'restoring' in apple ? !!apple.restoring : false;
    const busy = sub.loading !== null || appleRestoring;

    // Prefer the real StoreKit localized price on iOS (correct currency/amount
    // per App Store Connect). Falls back to the listed price on web/Stripe or
    // before the product list loads. `products` only exists on the iOS hook.
    const appleProducts: any[] = IS_IOS ? ((apple as any).products ?? []) : [];
    const priceFor = (sku: string, fallback: string): string => {
        const p = appleProducts.find((x) => (x?.productId ?? x?.id) === sku);
        return (p?.displayPrice || p?.localizedPrice || fallback) as string;
    };
    const premiumPrice = priceFor(APPLE_IAP_PREMIUM_SKU, '$5.99');
    const basicPrice = priceFor(APPLE_IAP_BASIC_SKU, '$3.99');
    const perDay = perDayLabel(premiumPrice);
    const delta = deltaLabel(premiumPrice, basicPrice);

    // Dev bypass — activates the subscription server-side (same call the dev
    // drawer uses) then refreshes auth, so RootNavigator routes onward just
    // like a real purchase. Web/dev only (see SHOW_DEV_BYPASS).
    const [devBusy, setDevBusy] = useState<'basic' | 'premium' | null>(null);
    const devBypass = async (tier: 'basic' | 'premium') => {
        if (devBusy) return;
        setDevBusy(tier);
        try {
            await api.testActivateSubscription(tier);
            await refreshUser();
        } catch (e: any) {
            Alert.alert('Dev bypass failed', String(e?.message || e || 'Could not activate. Is the backend running?'));
        } finally {
            setDevBusy(null);
        }
    };

    const handleRestore = async () => {
        if (!IS_IOS || busy) return;
        try {
            await apple.restorePurchases();
            await refreshUser();
        } catch (error: any) {
            Alert.alert('Restore failed', String(error?.message || 'Could not restore.'));
        }
    };

    const handleSubscribe = async (tier: 'basic' | 'premium') => {
        if (faceScanEnabled && user && !user.first_scan_completed) {
            const goScan = () => navigation.navigate('FaceScan');
            // Alert.alert's button callbacks are no-ops on react-native-web, which
            // left "Get Chad" a silent dead end in the web build. Use a native
            // confirm there and route straight to the scan.
            if (Platform.OS === 'web') {
                if (
                    typeof window === 'undefined' ||
                    window.confirm(
                        'Complete your AI face scan to see your preview score, then you can subscribe.\n\nStart the scan now?',
                    )
                ) {
                    goScan();
                }
                return;
            }
            Alert.alert(
                'Face scan first',
                'Complete your AI face scan to see your preview score, then you can subscribe.',
                [
                    { text: 'Start scan', onPress: goScan },
                    { text: 'Cancel', style: 'cancel' },
                ],
            );
            return;
        }
        await (tier === 'basic' ? sub.subscribeBasic() : sub.subscribePremium());
    };

    return (
        <View style={s.container}>
            {/* ── Top bar ─────────────────────────────────────────── */}
            <View style={[s.topBar, { paddingTop: Math.max(insets.top + spacing.sm, 44) }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={s.backBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom + spacing.xl, spacing.xxl) }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero ─────────────────────────────────────────── */}
                <Text style={s.headline}>Pick your level.</Text>
                <Text style={s.subline}>Cancel anytime. Switch or stop whenever you want.</Text>

                {/* ── PREMIUM (Chad) — the hero ───────────────────── */}
                <PremiumCard
                    busy={busy}
                    loadingTier={sub.loading}
                    price={premiumPrice}
                    perDay={perDay}
                    perks={premiumPerks}
                    onPress={() => handleSubscribe('premium')}
                />

                {/* Decoy bridge: makes the upgrade feel negligible. */}
                {delta ? (
                    <Text style={s.bridge}>
                        Only <Text style={s.bridgeStrong}>{delta}/week</Text> more than Chadlite.
                    </Text>
                ) : null}

                {/* ── BASIC (Chadlite) — quiet, subordinate row ────── */}
                <BasicRow
                    busy={busy}
                    loadingTier={sub.loading}
                    price={basicPrice}
                    summary={basicSummary}
                    onPress={() => handleSubscribe('basic')}
                />

                {/* App Store compliance for auto-renewable subscriptions:
                    auto-renew disclosure + Restore (iOS) + Terms + Privacy. */}
                <Text style={s.disclosure}>
                    Chad and Chadlite are weekly subscriptions that renew automatically until you cancel.
                    Cancel anytime in your {IS_IOS ? 'App Store' : 'account'} settings. Payment is charged at confirmation of purchase.
                </Text>

                <View style={s.legalRow}>
                    {IS_IOS ? (
                        <TouchableOpacity onPress={handleRestore} disabled={busy} hitSlop={8} activeOpacity={0.7}>
                            <Text style={s.legalLink}>{appleRestoring ? 'Restoring' : 'Restore'}</Text>
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                        onPress={() => navigation.navigate('LegalDocument', { document: 'terms' })}
                        hitSlop={8}
                        activeOpacity={0.7}
                    >
                        <Text style={s.legalLink}>Terms</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('LegalDocument', { document: 'privacy' })}
                        hitSlop={8}
                        activeOpacity={0.7}
                    >
                        <Text style={s.legalLink}>Privacy</Text>
                    </TouchableOpacity>
                </View>

                {/* ── DEV bypass (computer/web only) ──────────────────── */}
                {SHOW_DEV_BYPASS ? (
                    <View style={s.devBlock}>
                        <Text style={s.devLabel}>DEV · COMPUTER ONLY · skips payment</Text>
                        <View style={s.devRow}>
                            <TouchableOpacity
                                style={[s.devBtn, devBusy && s.ctaDisabled]}
                                onPress={() => devBypass('premium')}
                                disabled={!!devBusy}
                                activeOpacity={0.85}
                            >
                                <Text style={s.devBtnText}>{devBusy === 'premium' ? 'Activating…' : 'Skip → Chad'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.devBtn, devBusy && s.ctaDisabled]}
                                onPress={() => devBypass('basic')}
                                disabled={!!devBusy}
                                activeOpacity={0.85}
                            >
                                <Text style={s.devBtnText}>{devBusy === 'basic' ? 'Activating…' : 'Skip → Chadlite'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}

/* ── Premium card (the hero, ink fill) ───────────────────────────────── */

function PremiumCard({
    busy, loadingTier, price, perDay, perks, onPress,
}: {
    busy: boolean;
    loadingTier: 'basic' | 'premium' | null;
    price: string;
    perDay: string | null;
    perks: string[];
    onPress: () => void;
}) {
    return (
        <View style={s.premiumCard}>
            <View style={s.cardHead}>
                <Text style={[s.cardName, { color: CREAM }]}>Chad</Text>
                <View style={s.popPill}>
                    <Text style={s.popPillText}>MOST POPULAR</Text>
                </View>
            </View>

            <View style={s.priceRow}>
                <Text style={[s.priceValueLg, { color: CREAM }]}>{price}</Text>
                <Text style={s.pricePerLight}>/week</Text>
            </View>
            {perDay ? <Text style={s.perDay}>that's just {perDay} a day</Text> : null}

            <View style={s.cardDivider} />

            <View style={s.perksList}>
                {perks.map((p, i) => (
                    <View key={i} style={s.perkRow}>
                        <View style={s.perkDot}>
                            <Ionicons name="checkmark" size={12} color={GOLD} />
                        </View>
                        <Text style={s.perkText}>{p}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={[s.ctaPrimary, busy && s.ctaDisabled]}
                onPress={onPress}
                disabled={busy}
                activeOpacity={0.85}
            >
                <Text style={s.ctaPrimaryText}>
                    {loadingTier === 'premium' ? 'Processing…' : `Get Chad · ${price}/wk`}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={INK} />
            </TouchableOpacity>
        </View>
    );
}

/* ── Basic row (deliberately quiet, single line, still tappable) ──────── */

function BasicRow({
    busy, loadingTier, price, summary, onPress,
}: {
    busy: boolean;
    loadingTier: 'basic' | 'premium' | null;
    price: string;
    summary: string;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[s.liteRow, busy && s.ctaDisabled]}
            onPress={onPress}
            disabled={busy}
            activeOpacity={0.7}
        >
            <View style={s.liteTextWrap}>
                <Text style={s.liteName}>Chadlite</Text>
                <Text style={s.liteSub}>{summary}</Text>
            </View>
            <View style={s.litePriceWrap}>
                <Text style={s.litePrice}>{loadingTier === 'basic' ? '…' : price}</Text>
                <Text style={s.liteWk}>/wk</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
    );
}


/* ── Styles ──────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    topBar: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
    },
    backBtn: {
        width: 32,
        height: 32,
        justifyContent: 'center',
    },
    scroll: {
        paddingHorizontal: spacing.lg,
    },

    /* hero */
    headline: {
        fontFamily: fonts.serif,
        fontSize: 38,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -1.2,
        lineHeight: 42,
        marginTop: spacing.md,
    },
    subline: {
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
        marginTop: 7,
        marginBottom: spacing.xl,
    },

    /* premium card (ink fill, the hero) */
    premiumCard: {
        backgroundColor: INK,
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(201,162,78,0.30)',
        paddingHorizontal: 24,
        paddingVertical: 24,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#3A352B', shadowOpacity: 0.16, shadowRadius: 26, shadowOffset: { width: 0, height: 12 } }
            : { elevation: 6 }),
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    popPill: {
        backgroundColor: GOLD,
        borderRadius: 999,
        paddingVertical: 5,
        paddingHorizontal: 11,
    },
    popPillText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10,
        letterSpacing: 1.2,
        color: INK,
    },
    cardName: {
        fontFamily: fonts.serif,
        fontSize: 28,
        fontWeight: '400',
        letterSpacing: -0.5,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        marginTop: 14,
    },
    priceValueLg: {
        fontFamily: fonts.serif,
        fontSize: 44,
        fontWeight: '400',
        letterSpacing: -0.5,
    },
    pricePerLight: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: 'rgba(247,240,234,0.55)',
    },
    perDay: {
        fontFamily: fonts.sansMedium,
        fontSize: 12.5,
        letterSpacing: 0.2,
        color: GOLD,
        marginTop: 5,
    },

    cardDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(247,240,234,0.14)',
        marginTop: spacing.lg,
    },
    perksList: {
        marginTop: spacing.lg,
        marginBottom: spacing.lg,
        gap: 12,
    },
    perkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    perkDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(201,162,78,0.16)',
    },
    perkText: {
        fontFamily: fonts.sans,
        fontSize: 14.5,
        flex: 1,
        lineHeight: 20,
        color: 'rgba(247,240,234,0.92)',
    },

    ctaPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: CREAM,
        borderRadius: 999,
        paddingVertical: 15,
    },
    ctaPrimaryText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        letterSpacing: 0.2,
        color: INK,
    },
    ctaDisabled: { opacity: 0.45 },

    /* decoy bridge line between the two tiers */
    bridge: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.md,
        marginBottom: spacing.md,
    },
    bridgeStrong: {
        fontFamily: fonts.sansSemiBold,
        color: colors.foreground,
    },

    /* basic — quiet subordinate row */
    liteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surfaceLight,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 18,
        marginBottom: spacing.lg,
    },
    liteTextWrap: { flex: 1 },
    liteName: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 16,
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    liteSub: {
        fontFamily: fonts.sans,
        fontSize: 12.5,
        color: colors.textMuted,
        marginTop: 2,
    },
    litePriceWrap: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
    },
    litePrice: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        color: colors.textSecondary,
    },
    liteWk: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: colors.textMuted,
    },

    /* App Store compliance footer */
    disclosure: {
        fontFamily: fonts.sans,
        fontSize: 11,
        lineHeight: 16,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.sm,
        marginBottom: spacing.md,
    },
    legalRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.lg,
        marginBottom: spacing.sm,
    },
    legalLink: {
        fontFamily: fonts.sansMedium,
        fontSize: 12,
        color: colors.textSecondary,
        textDecorationLine: 'underline',
    },

    /* dev bypass (web/dev only) */
    devBlock: {
        marginTop: spacing.xl,
        paddingTop: spacing.lg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        alignItems: 'center',
        gap: spacing.sm,
    },
    devLabel: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10,
        letterSpacing: 1.4,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    devRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
    devBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.textMuted,
        backgroundColor: 'transparent',
    },
    devBtnText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        color: colors.textSecondary,
        letterSpacing: 0.1,
    },
});

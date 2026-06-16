/**
 * PaymentScreen — two-tier subscription page, Craft aesthetic.
 *
 * Minimal + flat: warm cream canvas, one featured ink card (Chad) and one
 * quiet hairline card (Chadlite). A single muted-gold accent carries the
 * "most popular" cue + the premium checks; everything else is ink on cream.
 * No aurora gradients, no blur — clean and premium.
 *
 * Sales structure kept: anchoring (weekly price), decoy (Chadlite is lighter),
 * social proof (most-popular), App Store auto-renew disclosure + Restore/legal.
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

/* ── Tier features ────────────────────────────────────────────────────── */

const BASIC_PERKS: { label: string; included: boolean }[] = [
    { label: 'Chatbot access',           included: true  },
    { label: '2 active programs',        included: true  },
    { label: 'Weekly face scan',         included: true  },
];

const PREMIUM_PERKS: string[] = [
    'Chatbot Pro',
    '3 active programs',
    'Daily face scans',
    'Full course library',
    'Priority support',
];

const IS_IOS = Platform.OS === 'ios';
const INK = '#1C1A17';
const CREAM = '#F7F0EA';
const GOLD = '#C9A24E';

// Dev-only payment bypass: shows ONLY in the computer/web dev build, never in
// the real native app (Platform.OS !== 'web') and never in a production bundle
// (__DEV__ false). Lets you skip Stripe/StoreKit and proceed exactly as if the
// subscription had actually gone through.
const SHOW_DEV_BYPASS = Platform.OS === 'web' && __DEV__;

export default function PaymentScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user, refreshUser } = useAuth();

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
        if (user && !user.first_scan_completed) {
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
                <Text style={s.eyebrow}>CHOOSE YOUR PLAN</Text>
                <Text style={s.headline}>Pick your level.</Text>
                <Text style={s.subline}>Cancel anytime. Switch or stop whenever you want.</Text>

                {/* ── PREMIUM (Chad) — featured ───────────────────── */}
                <PremiumCard
                    busy={busy}
                    loadingTier={sub.loading}
                    price={premiumPrice}
                    onPress={() => handleSubscribe('premium')}
                />

                {/* ── BASIC (Chadlite) ─────────────────────────────── */}
                <BasicCard
                    busy={busy}
                    loadingTier={sub.loading}
                    price={basicPrice}
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

/* ── Premium card (featured, ink fill) ───────────────────────────────── */

function PremiumCard({
    busy, loadingTier, price, onPress,
}: {
    busy: boolean;
    loadingTier: 'basic' | 'premium' | null;
    price: string;
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

            <View style={s.cardDivider} />

            <View style={s.perksList}>
                {PREMIUM_PERKS.map((p, i) => (
                    <View key={i} style={s.perkRow}>
                        <View style={s.perkDot}>
                            <Ionicons name="checkmark" size={12} color={GOLD} />
                        </View>
                        <Text style={[s.perkText, { color: 'rgba(247,240,234,0.92)' }]}>{p}</Text>
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

/* ── Basic card (quiet hairline) ─────────────────────────────────────── */

function BasicCard({
    busy, loadingTier, price, onPress,
}: {
    busy: boolean;
    loadingTier: 'basic' | 'premium' | null;
    price: string;
    onPress: () => void;
}) {
    return (
        <View style={s.basicCard}>
            <View style={s.basicHead}>
                <Text style={s.cardName}>Chadlite</Text>
                <View style={s.basicPriceRow}>
                    <Text style={s.basicPriceValue}>{price}</Text>
                    <Text style={s.pricePer}>/week</Text>
                </View>
            </View>

            <View style={s.inlinePerks}>
                {BASIC_PERKS.map((p, i) => (
                    <View key={i} style={s.inlinePerk}>
                        <Ionicons name="checkmark" size={13} color={GOLD} />
                        <Text style={s.inlinePerkText}>{p.label}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={[s.ctaSecondary, busy && s.ctaDisabled]}
                onPress={onPress}
                disabled={busy}
                activeOpacity={0.85}
            >
                <Text style={s.ctaSecondaryText}>
                    {loadingTier === 'basic' ? 'Processing…' : 'Get Chadlite'}
                </Text>
            </TouchableOpacity>
        </View>
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
    eyebrow: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 1.8,
        color: colors.textMuted,
        marginTop: spacing.sm,
        marginBottom: 10,
    },
    headline: {
        fontFamily: fonts.serif,
        fontSize: 38,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -1.2,
        lineHeight: 42,
    },
    subline: {
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
        marginTop: 7,
        marginBottom: spacing.md,
    },

    /* premium card (ink fill) */
    premiumCard: {
        backgroundColor: INK,
        borderRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(201,162,78,0.35)',
        paddingHorizontal: 22,
        paddingVertical: 20,
        marginBottom: spacing.md,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#3A352B', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } }
            : { elevation: 5 }),
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

    /* basic card (quiet secondary — a soft lift gives it presence
       without the height of a full second card) */
    basicCard: {
        backgroundColor: colors.surfaceLight,
        borderRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        paddingVertical: 20,
        paddingHorizontal: 22,
        marginBottom: spacing.lg,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#3A352B', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }
            : { elevation: 2 }),
    },
    basicHead: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },
    basicPriceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    basicPriceValue: {
        fontFamily: fonts.serif,
        fontSize: 24,
        fontWeight: '400',
        letterSpacing: -0.4,
        color: colors.foreground,
    },
    inlinePerks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 7,
        columnGap: 14,
        marginTop: 12,
        marginBottom: spacing.md,
    },
    inlinePerk: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    inlinePerkText: {
        fontFamily: fonts.sans,
        fontSize: 13.5,
        color: colors.textPrimary,
    },

    /* shared per-card */
    cardName: {
        fontFamily: fonts.serif,
        fontSize: 27,
        fontWeight: '400',
        letterSpacing: -0.5,
        color: colors.foreground,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        marginTop: 8,
    },
    priceValueLg: {
        fontFamily: fonts.serif,
        fontSize: 40,
        fontWeight: '400',
        letterSpacing: -0.5,
        color: colors.foreground,
    },
    pricePer: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: colors.textSecondary,
    },
    pricePerLight: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: 'rgba(247,240,234,0.55)',
    },

    cardDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(247,240,234,0.14)',
        marginTop: spacing.md,
    },
    perksList: {
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        gap: 11,
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
    },

    /* CTAs */
    ctaPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: CREAM,
        borderRadius: 999,
        paddingVertical: 14,
    },
    ctaPrimaryText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        letterSpacing: 0.2,
        color: INK,
    },
    ctaSecondary: {
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: colors.foreground,
        paddingVertical: 13,
        alignItems: 'center',
    },
    ctaSecondaryText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        letterSpacing: 0.2,
        color: colors.foreground,
    },
    ctaDisabled: { opacity: 0.45 },

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

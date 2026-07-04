/**
 * PaymentScreen — Grok-style full-bleed paywall, light edition.
 *
 * Layout: a classical bust dissolving into blue particle-smoke (Higgsfield,
 * cream + ink + brand-blue — same palette as the maxx clay icons) fills the
 * screen, a soft cream gradient keeps text legible, a light frosted feature
 * card floats in the middle, Chad/Chad Lite plan picker at the bottom, single
 * ink pill CTA.
 *
 * Tiers (unchanged):
 *   Chad Lite (basic):  chatbot · 2 active programs · weekly face scan
 *   Chad (premium):     chatbot pro · 3 active programs · daily scans
 *                       · full course library · priority support
 */

import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
    Image,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { LinearGradient } from 'expo-linear-gradient';
const DUST = require('../../assets/paywall-dust.webp');
import { LiquidGlass, LiquidGlassFill } from '../../components/glass/LiquidGlass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import api from '../../services/api';
import { track } from '../../lib/analytics';
import { useAuth } from '../../context/AuthContext';
import { useStripeSubscription } from '../../hooks/useStripeSubscription';
import { useAppleSubscription } from '../../hooks/useAppleSubscription';
import { APPLE_IAP_PREMIUM_SKU } from '../../constants/appleIap';
import { useFlag } from '../../constants/featureFlags';

/* ── Palette ── light cream paywall (ink + blue, matches maxx clay icons) ─ */
const WHITE   = '#FFFFFF';
const INK     = '#111113';
const CREAM   = '#F4EEE3';                    // base canvas under the hero
const CARD_BG  = 'rgba(255,255,255,0.55)';   // light frosted — bust shows through
const HAIR     = 'rgba(17,17,19,0.07)';
const MUTED    = 'rgba(17,17,19,0.50)';
const PLAN_BG  = 'rgba(17,17,19,0.05)';       // plan container
const PLAN_SEL = '#FFFFFF';                   // selected option — white pill

const IS_IOS = Platform.OS === 'ios';
const SHOW_DEV_BYPASS = __DEV__;

/* ── Feature rows per plan ──────────────────────────────────────────────── */
type Feature = { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string };

const CHAD_FEATURES: Feature[] = [
    { icon: 'flash-outline',      title: 'Max Chat Pro',        sub: 'Unlimited AI coaching conversations'          },
    { icon: 'grid-outline',       title: '3 Active Routines',   sub: 'Run up to 3 looksmaxxing programs at once'    },
    { icon: 'scan-outline',       title: 'Daily Face Scans',    sub: 'AI face analysis every single day'            },
    { icon: 'book-outline',       title: 'Full Course Library', sub: 'Every creator course and piece of content'    },
    { icon: 'ribbon-outline',     title: 'Priority Support',    sub: 'Faster responses and dedicated help'          },
];
const CHAD_FEATURES_NO_SCAN: Feature[] = [
    { icon: 'flash-outline',      title: 'Max Chat Pro',        sub: 'Unlimited AI coaching conversations'          },
    { icon: 'grid-outline',       title: '3 Active Routines',   sub: 'Run up to 3 looksmaxxing programs at once'    },
    { icon: 'book-outline',       title: 'Full Course Library', sub: 'Every creator course and piece of content'    },
    { icon: 'ribbon-outline',     title: 'Priority Support',    sub: 'Faster responses and dedicated help'          },
];
// Chad Lite is retired (funnel V4): one plan, one price, 3-day free trial.
// Existing Lite subscribers are grandfathered INTO Chad server-side.

/* ── Price helpers ─────────────────────────────────────────────────────── */
function parseAmount(s: string): { sym: string; n: number } | null {
    const m = String(s).match(/^\s*([^\d\s]+)?\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const sym = (m[1] || '').trim();
    const n   = parseFloat(m[2].replace(',', '.'));
    if (!isFinite(n)) return null;
    return { sym, n };
}
function perDayLabel(weekly: string): string | null {
    const a = parseAmount(weekly);
    if (!a || a.n <= 0 || !a.sym) return null;
    return `${a.sym}${(a.n / 7).toFixed(2)}/day`;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function PaymentScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets     = useSafeAreaInsets();
    const { user, refreshUser, isAnonymous, isFreeTier, chooseFreeTier } = useAuth();

    // Funnel V4: the paywall comes BEFORE account creation — anonymous users
    // purchase (Apple IAP is Apple-ID-scoped; the entitlement attaches to this
    // authed anon account) and claim the account on the next screen.
    const onboardingCompleted = user?.onboarding?.completed === true;

    useEffect(() => {
        track('paywall_view');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const faceScanEnabled = useFlag('faceScan');
    const chadFeatures = faceScanEnabled ? CHAD_FEATURES : CHAD_FEATURES_NO_SCAN;

    const stripe = useStripeSubscription();
    const apple  = useAppleSubscription();
    const useAppleSim = !IS_IOS && __DEV__ && Platform.OS === 'web';
    const sub = IS_IOS || useAppleSim ? apple : stripe;

    const appleRestoring = 'restoring' in apple ? !!apple.restoring : false;
    const busy = sub.loading !== null || appleRestoring;

    const appleProducts: any[] = IS_IOS ? ((apple as any).products ?? []) : [];
    const priceFor = (sku: string, fallback: string): string => {
        const p = appleProducts.find((x) => (x?.productId ?? x?.id) === sku);
        return (p?.displayPrice || p?.localizedPrice || fallback) as string;
    };
    const premiumPrice = priceFor(APPLE_IAP_PREMIUM_SKU, '$5.99');
    const perDay       = perDayLabel(premiumPrice);

    // Where a successful purchase goes. Mid-funnel (onboarding incomplete) the
    // next step is claiming the account ("Save your results"); a completed user
    // hitting this as an in-app gate rides the paid-stack remount instead.
    const afterPurchase = () => {
        if (!onboardingCompleted) {
            navigation.navigate('CreateAccount');
        } else if (navigation.canGoBack()) {
            navigation.goBack();
        }
    };

    const [devBusy, setDevBusy] = useState<'premium' | null>(null);
    const devBypass = async () => {
        if (devBusy) return;
        setDevBusy('premium');
        try {
            await api.testActivateSubscription('premium');
            await refreshUser();
            afterPurchase();
        } catch (e: any) {
            Alert.alert('Dev bypass failed', String(e?.message || e || 'Could not activate.'));
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

    const handleSubscribe = async () => {
        // In any dev build (__DEV__) the primary CTA activates the plan directly.
        // Production builds run the real Apple IAP purchase — the 3-day free
        // trial is Apple's introductory offer on the Chad SKU, so "subscribe
        // free now, auto-converts to paid" needs no second opt-in from the user.
        track('purchase_started', { plan: 'premium' });
        if (SHOW_DEV_BYPASS) {
            await devBypass();
            return;
        }
        try {
            await sub.subscribePremium();
            track('purchase_success', { plan: 'premium' });
            afterPurchase();
        } catch (e: any) {
            track('purchase_failed', { plan: 'premium', error: String(e?.message ?? 'unknown') });
            throw e;
        }
    };

    const ctaBusy = busy || devBusy !== null;
    const ctaLabel = ctaBusy ? 'Processing…' : 'Start my 3-day free trial';

    // "Continue with the free plan" — browse-only access. Mid-funnel it records
    // the choice and continues to the account step (the funnel still finishes);
    // when the paywall was PUSHED as an in-app gate (already free tier,
    // canGoBack), it simply dismisses back to where the user was.
    const onContinueFree = async () => {
        if (ctaBusy) return;
        track('paywall_view', { action: 'continue_free' });
        if (isFreeTier && navigation.canGoBack()) {
            navigation.goBack();
            return;
        }
        await chooseFreeTier();
        if (!onboardingCompleted) navigation.navigate('CreateAccount');
    };

    return (
        <View style={s.root}>
            {/* ── Full-bleed background ── wisps of brand-colored dust over the
                cream canvas (same hues as the Explore max icons). A soft cream
                wash on top/bottom keeps the title and plans legible. ───────── */}
            {/* The dust image is pre-padded to the phone's portrait aspect (0.462) with
                matching cream, so cover fills full-bleed yet only ever crops the invisible
                cream margins — the full 5-wisp composition always shows, un-zoomed. */}
            <Image source={DUST} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(244,238,227,0.78)', 'rgba(244,238,227,0.10)', 'rgba(244,238,227,0.28)', 'rgba(244,238,227,0.95)']}
                locations={[0, 0.30, 0.62, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/* ── Skip (DEV-only — real users can't bypass the paywall) ── */}
            {SHOW_DEV_BYPASS && (
                <TouchableOpacity
                    style={[s.skip, { top: Math.max(insets.top + 8, 52) }]}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                    hitSlop={12}
                >
                    <Text style={s.skipText}>Skip</Text>
                </TouchableOpacity>
            )}

            {/* ── Close (free-tier gate) — when the paywall was pushed over the app
                by an action gate, a free user can dismiss it and keep browsing. ── */}
            {!SHOW_DEV_BYPASS && isFreeTier && navigation.canGoBack() && (
                <TouchableOpacity
                    style={[s.close, { top: Math.max(insets.top + 8, 52) }]}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                >
                    <Ionicons name="close" size={18} color={INK} />
                </TouchableOpacity>
            )}

            {/* ── Content column ───────────────────────────────────── */}
            <View style={[s.content, { paddingTop: Math.max(insets.top + 30, 74), paddingBottom: Math.max(insets.bottom + 20, 36) }]}>

                {/* Title — sits just below skip, no dead space */}
                <Text style={s.title}>Unlock your <Text style={s.titleI}>potential</Text></Text>

                {/* Feature card — the canonical liquid-glass surface, floating
                    over the dust gradient (its contrast is what makes the glass
                    read). LiquidGlass owns the blur, speculars, rim and float. */}
                <LiquidGlass radius={30} intensity={IS_IOS ? 46 : 16} spec={1.15} style={s.featureCard} contentStyle={s.featureCardContent}>
                    {chadFeatures.map((f) => (
                        <View key={f.title} style={s.featureRow}>
                            <View style={s.featureIconWrap}>
                                <Ionicons name={f.icon} size={22} color={INK} />
                            </View>
                            <View style={s.featureText}>
                                <Text style={s.featureTitle}>{f.title}</Text>
                                <Text style={s.featureSub}>{f.sub}</Text>
                            </View>
                        </View>
                    ))}
                </LiquidGlass>

                {/* One plan — the trial terms, stated plainly. Nothing is charged
                    today; Apple's intro offer converts to the weekly price after
                    3 days unless they cancel. */}
                <View style={s.planContainer}>
                    <View style={[s.planOption, s.planOptionSel, s.planOptionFull]}>
                        <Text style={s.planName}>Chad · 3 days free</Text>
                        <Text style={s.planPrice}>{premiumPrice}<Text style={s.planPer}>/wk after</Text></Text>
                        <Text style={s.planNote}>{perDay ? `${perDay} · ` : ''}cancel anytime before the trial ends</Text>
                    </View>
                </View>

                {/* CTA — dark liquid glass (float shadow on the outer wrapper so the
                    inner overflow:hidden clip doesn't mask it). */}
                <View style={[s.ctaWrap, ctaBusy && s.ctaDisabled]}>
                    <TouchableOpacity
                        style={s.cta}
                        onPress={handleSubscribe}
                        disabled={ctaBusy}
                        activeOpacity={0.9}
                    >
                        <LiquidGlassFill dark idSuffix="cta" />
                        <View style={s.ctaVeil} pointerEvents="none" />
                        {ctaBusy
                            ? <ActivityIndicator color={WHITE} />
                            : <Text style={s.ctaText}>{ctaLabel}</Text>
                        }
                    </TouchableOpacity>
                </View>

                {/* Continue free — quiet escape hatch under the CTA. Browse-only:
                    every action re-gates to this screen until they subscribe. */}
                <TouchableOpacity
                    style={s.freeLink}
                    onPress={() => void onContinueFree()}
                    disabled={ctaBusy}
                    activeOpacity={0.7}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with the free plan"
                >
                    <Text style={s.freeLinkText}>Continue with the free plan</Text>
                </TouchableOpacity>

                {/* Legal footer */}
                <View style={s.legalRow}>
                    <TouchableOpacity onPress={() => navigation.navigate('LegalDocument', { document: 'terms' })} hitSlop={8} activeOpacity={0.7}>
                        <Text style={s.legalLink}>Terms of Service</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.navigate('LegalDocument', { document: 'privacy' })} hitSlop={8} activeOpacity={0.7}>
                        <Text style={s.legalLink}>Privacy Policy</Text>
                    </TouchableOpacity>
                    {/* Apple requires a working Restore control (Guideline 3.1.1). This is
                        the single canonical one — it actually restores, not a link to Terms. */}
                    {IS_IOS && (
                        <TouchableOpacity onPress={handleRestore} disabled={busy} hitSlop={8} activeOpacity={0.7}>
                            <Text style={s.legalLink}>{appleRestoring ? 'Restoring…' : 'Restore Purchases'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

            </View>
        </View>
    );
}

/* ── Styles ──────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: CREAM },

    skip: {
        position: 'absolute',
        right: 22,
        zIndex: 10,
        backgroundColor: 'rgba(17,17,19,0.07)',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    skipText: {
        fontFamily: 'Matter-Medium',
        fontSize: 14,
        color: INK,
        letterSpacing: 0.2,
    },

    /* free-tier gate close chip (mirrors skip placement) */
    close: {
        position: 'absolute',
        right: 22,
        zIndex: 10,
        backgroundColor: 'rgba(17,17,19,0.07)',
        borderRadius: 999,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* continue-free link under the CTA */
    freeLink: {
        alignSelf: 'center',
        paddingVertical: 6,
        marginTop: 2,
    },
    freeLinkText: {
        fontFamily: 'Matter-Medium',
        fontSize: 13,
        color: 'rgba(17,17,19,0.55)',
        textDecorationLine: 'underline',
        letterSpacing: 0.1,
    },

    content: {
        flex: 1,
        paddingHorizontal: 20,
        gap: 8,
    },

    title: {
        fontFamily: 'Fraunces',
        fontSize: 32,
        color: INK,
        letterSpacing: -0.8,
        lineHeight: 36,
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 24,
    },
    titleI: {
        fontFamily: 'Fraunces-Italic',
        fontStyle: 'italic',
    },
    subtitle: {
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: MUTED,
        textAlign: 'center',
        letterSpacing: 0.1,
    },

    /* feature card — the LiquidGlass primitive owns the body/blur/rim/float.
       This outer style just sizes it; the content padding lives below. */
    featureCard: {
        flex: 1,
    },
    featureCardContent: {
        flex: 1,
        paddingHorizontal: 18,
        paddingVertical: 6,
    },
    featureRow: {
        flex: 1,                    // each row claims equal share of the card height
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    featureIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: 'rgba(255,255,255,0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    featureText: { flex: 1 },
    featureTitle: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: INK,
        letterSpacing: -0.1,
    },
    featureSub: {
        fontFamily: 'Matter-Regular',
        fontSize: 12.5,
        color: MUTED,
        marginTop: 2,
        lineHeight: 17,
    },

    /* plan picker — single container, Grok-style */
    planContainer: {
        flexDirection: 'row',
        backgroundColor: PLAN_BG,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIR,
        padding: 5,
        gap: 4,
    },
    planOption: {
        flex: 1,
        borderRadius: 13,
        paddingVertical: 14,
        paddingHorizontal: 14,
    },
    planOptionSel: {
        backgroundColor: PLAN_SEL,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(17,17,19,0.08)',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }
            : { elevation: 3 }),
    },
    // Single-plan (V4): the one card spans the container, centered.
    planOptionFull: {
        alignItems: 'center',
    },
    planName: {
        fontFamily: 'Matter-Medium',
        fontSize: 12,
        color: 'rgba(17,17,19,0.45)',
        letterSpacing: 0.2,
        marginBottom: 5,
    },
    planPrice: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 26,
        color: INK,
        letterSpacing: -0.8,
    },
    planPer: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        letterSpacing: 0,
    },
    planNote: {
        fontFamily: 'Matter-Regular',
        fontSize: 11,
        color: 'rgba(17,17,19,0.42)',
        marginTop: 3,
    },

    /* CTA — dark ink pill pops on the light cream canvas */
    // Outer wrapper carries the float shadow (un-clipped).
    ctaWrap: {
        borderRadius: 999,
        borderCurve: 'continuous',
        ...(IS_IOS
            ? { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 6 }),
    },
    // Inner clip: dark liquid glass (LiquidGlassFill dark + a dark veil for text legibility).
    cta: {
        borderRadius: 999,
        borderCurve: 'continuous',
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    ctaVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,17,19,0.46)' },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 16,
        color: WHITE,
        letterSpacing: 0.1,
    },

    /* legal */
    legalRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 14,
    },
    legalLink: {
        fontFamily: 'Matter-Regular',
        fontSize: 11,
        color: MUTED,
        textDecorationLine: 'underline',
    },
});

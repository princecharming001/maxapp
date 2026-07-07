/**
 * PaymentScreen — Grok-style full-bleed paywall, light edition.
 *
 * Layout: a classical bust dissolving into blue particle-smoke (Higgsfield,
 * cream + ink + brand-blue — same palette as the maxx clay icons) fills the
 * screen, a soft cream gradient keeps text legible, a light frosted feature
 * card floats in the middle, then a minimal two-option plan selector (free
 * trial default / subscribe now) and a single ink pill CTA.
 *
 * Single plan (funnel V4): Chad — 3-day free trial (Apple introductory
 * offer), then the SKU's period price. Both selector options run the same
 * StoreKit purchase (Apple applies the intro offer per eligibility); the
 * choice is presentation only. Hard paywall: no free tier entry point.
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

/* ── Component ─────────────────────────────────────────────────────────── */
export default function PaymentScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets     = useSafeAreaInsets();
    const { user, refreshUser, isAnonymous, isFreeTier } = useAuth();

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

    // Free trial is the default; the user can opt to subscribe immediately.
    // Both run the SAME StoreKit purchase — Apple applies the 3-day intro
    // offer to eligible accounts either way — so this is a presentation
    // choice, not two different SKUs.
    const [payNow, setPayNow] = useState(false);

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
    const ctaLabel = ctaBusy
        ? 'Processing…'
        : payNow ? 'Subscribe now' : 'Start my 3-day free trial';

    // The free tier is RETIRED as an entry point (hard paywall: trial or
    // subscribe). chooseFreeTier stays in AuthContext only so accounts that
    // already chose it keep working; the close chip below still lets them
    // dismiss a gate-pushed paywall.

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

            {/* ── Skip payment (DEV-only — sim testing; real users can't bypass
                the paywall). Continues the funnel WITHOUT purchasing: mid-funnel
                → Save-your-results → schedule questions; gate context → back. ── */}
            {SHOW_DEV_BYPASS && (
                <TouchableOpacity
                    style={[s.skip, { top: Math.max(insets.top + 8, 52) }]}
                    onPress={afterPurchase}
                    activeOpacity={0.7}
                    hitSlop={12}
                >
                    <Text style={s.skipText}>Skip payment</Text>
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

                {/* Plan choice — free trial (default) or subscribe now. The
                    selected row carries the price + period (Apple requires it
                    visible by the CTA); both options run the same purchase. */}
                <View style={s.planStack}>
                    <PlanOption
                        selected={!payNow}
                        onPress={() => setPayNow(false)}
                        title="3-day free trial"
                        sub={`Free today, then ${premiumPrice}/wk`}
                    />
                    <PlanOption
                        selected={payNow}
                        onPress={() => setPayNow(true)}
                        title="Subscribe now"
                        sub={`${premiumPrice}/wk · start today`}
                    />
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

                {/* The one line a hesitant thumb needs to hear, right under the CTA. */}
                <Text style={s.noPaymentNote}>
                    {payNow ? 'Cancel anytime in Settings' : 'No payment due today · cancel anytime'}
                </Text>

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

/* ── Plan option (free trial / subscribe now) ──────────────────────────── */
function PlanOption({ selected, onPress, title, sub }: {
    selected: boolean; onPress: () => void; title: string; sub: string;
}) {
    return (
        <TouchableOpacity
            style={[s.planRow, selected && s.planRowSel]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${title}, ${sub}`}
        >
            <View style={[s.radio, selected && s.radioSel]}>
                {selected ? <View style={s.radioDot} /> : null}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.planRowTitle}>{title}</Text>
                <Text style={s.planRowSub}>{sub}</Text>
            </View>
        </TouchableOpacity>
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

    /* "No payment due now" reassurance under the CTA */
    noPaymentNote: {
        alignSelf: 'center',
        marginTop: 10,
        fontFamily: 'Matter-Medium',
        fontSize: 13,
        color: 'rgba(17,17,19,0.55)',
        letterSpacing: 0.1,
    },
    /* plan choice — free trial (default) / subscribe now, radio rows */
    planStack: { gap: 10 },
    planRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderRadius: 16,
        borderCurve: 'continuous',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIR,
    },
    planRowSel: {
        backgroundColor: '#FFFFFF',
        borderColor: INK,
        borderWidth: 1.5,
        ...(IS_IOS
            ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }
            : { elevation: 3 }),
    },
    radio: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 1.5, borderColor: 'rgba(17,17,19,0.28)',
        alignItems: 'center', justifyContent: 'center',
    },
    radioSel: { borderColor: INK },
    radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: INK },
    planRowTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: INK, letterSpacing: -0.1 },
    planRowSub: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTED, marginTop: 2 },

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

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

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Platform,
    ActivityIndicator,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStripeSubscription } from '../../hooks/useStripeSubscription';
import { useAppleSubscription } from '../../hooks/useAppleSubscription';
import { APPLE_IAP_BASIC_SKU, APPLE_IAP_PREMIUM_SKU } from '../../constants/appleIap';
import { useFlag } from '../../constants/featureFlags';
import { ReferralCodeField } from '../../components/ReferralCodeField';

/* ── Palette ── light cream paywall (ink + blue, matches maxx clay icons) ─ */
const WHITE   = '#FFFFFF';
const INK     = '#111113';
const CREAM   = '#F4EEE3';                    // base canvas under the hero
const CARD_BG  = 'rgba(255,255,255,0.55)';   // light frosted — bust shows through
const HAIR     = 'rgba(17,17,19,0.07)';
const MUTED    = 'rgba(17,17,19,0.50)';
const PLAN_BG  = 'rgba(17,17,19,0.05)';       // plan container
const PLAN_SEL = '#FFFFFF';                   // selected option — white pill

const HERO = require('../../assets/paywall-hero.webp');

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
const CHAD_LITE_FEATURES: Feature[] = [
    { icon: 'chatbubble-outline', title: 'Max Chat',            sub: 'AI coaching for your looksmaxxing journey'    },
    { icon: 'grid-outline',       title: '2 Active Routines',   sub: 'Run up to 2 programs at once'                 },
    { icon: 'scan-outline',       title: 'Weekly Face Scan',    sub: 'AI face analysis once per week'               },
    { icon: 'library-outline',    title: 'Selected Courses',    sub: 'Access to free creator content'               },
    { icon: 'people-outline',     title: 'Community Support',   sub: 'Help from the Max community'                  },
];
const CHAD_LITE_FEATURES_NO_SCAN: Feature[] = [
    { icon: 'chatbubble-outline', title: 'Max Chat',            sub: 'AI coaching for your looksmaxxing journey'    },
    { icon: 'grid-outline',       title: '2 Active Routines',   sub: 'Run up to 2 programs at once'                 },
    { icon: 'library-outline',    title: 'Selected Courses',    sub: 'Access to free creator content'               },
    { icon: 'people-outline',     title: 'Community Support',   sub: 'Help from the Max community'                  },
];

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
    const { user, refreshUser } = useAuth();

    const faceScanEnabled = useFlag('faceScan');
    const chadFeatures      = faceScanEnabled ? CHAD_FEATURES      : CHAD_FEATURES_NO_SCAN;
    const chadLiteFeatures  = faceScanEnabled ? CHAD_LITE_FEATURES : CHAD_LITE_FEATURES_NO_SCAN;

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
    const basicPrice   = priceFor(APPLE_IAP_BASIC_SKU,   '$3.99');
    const perDay       = perDayLabel(premiumPrice);
    const perDayBasic  = perDayLabel(basicPrice);

    // Selected plan — default to chad (premium)
    const [selected, setSelected] = useState<'basic' | 'premium'>('premium');

    const [devBusy, setDevBusy] = useState<'basic' | 'premium' | null>(null);
    const devBypass = async (tier: 'basic' | 'premium') => {
        if (devBusy) return;
        setDevBusy(tier);
        try {
            await api.testActivateSubscription(tier);
            await refreshUser();
            // Real purchases reach the results via a stack remount + HomeScreen
            // redirect. The dev bypass doesn't trigger that (we're already in the
            // paid stack), so route to the post-pay results view explicitly.
            navigation.navigate('FaceScanResults', { postPay: true });
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
        // In any dev build (__DEV__) the primary CTA activates the selected plan
        // directly — the same effect the old "Skip → Chad / Chad Lite" dev buttons
        // had. This works on web and on a simulator/device where real Apple IAP
        // can't complete. Production builds (__DEV__ false) always run the real
        // Stripe / Apple IAP purchase flow below, unchanged.
        if (SHOW_DEV_BYPASS) {
            await devBypass(selected);
            return;
        }
        await (selected === 'basic' ? sub.subscribeBasic() : sub.subscribePremium());
    };

    const ctaBusy = busy || devBusy !== null;
    const ctaLabel = ctaBusy
        ? 'Processing…'
        : selected === 'premium'
        ? `Upgrade to Chad · ${premiumPrice}/wk`
        : `Get Chad Lite · ${basicPrice}/wk`;

    return (
        <View style={s.root}>
            {/* ── Full-bleed background ─────────────────────────────── */}
            <Image source={HERO} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(244,238,227,0.55)', 'rgba(244,238,227,0.00)', 'rgba(244,238,227,0.45)', 'rgba(244,238,227,0.94)']}
                locations={[0, 0.32, 0.66, 1]}
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

            {/* ── Content column ───────────────────────────────────── */}
            <View style={[s.content, { paddingTop: Math.max(insets.top + 16, 60), paddingBottom: Math.max(insets.bottom + 20, 36) }]}>

                {/* Title — sits just below skip, no dead space */}
                <Text style={s.title}>Max Pro</Text>
                <Text style={s.subtitle}>Unlock your full potential</Text>

                {/* Feature card — flex:1 fills all space between subtitle and plan picker */}
                <View style={s.featureCard}>
                    {(selected === 'premium' ? chadFeatures : chadLiteFeatures).map((f) => (
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
                </View>

                {/* Plan picker — single container, Grok-style */}
                <View style={s.planContainer}>
                    <TouchableOpacity
                        style={[s.planOption, selected === 'basic' && s.planOptionSel]}
                        onPress={() => setSelected('basic')}
                        activeOpacity={0.85}
                    >
                        <Text style={s.planName}>Chad Lite</Text>
                        <Text style={s.planPrice}>{basicPrice}<Text style={s.planPer}>/wk</Text></Text>
                        {perDayBasic ? <Text style={s.planNote}>{perDayBasic}</Text> : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.planOption, selected === 'premium' && s.planOptionSel]}
                        onPress={() => setSelected('premium')}
                        activeOpacity={0.85}
                    >
                        <Text style={s.planName}>Chad</Text>
                        <Text style={s.planPrice}>{premiumPrice}<Text style={s.planPer}>/wk</Text></Text>
                        {perDay ? <Text style={s.planNote}>{perDay}</Text> : null}
                    </TouchableOpacity>
                </View>

                {/* CTA */}
                <TouchableOpacity
                    style={[s.cta, ctaBusy && s.ctaDisabled]}
                    onPress={handleSubscribe}
                    disabled={ctaBusy}
                    activeOpacity={0.9}
                >
                    {ctaBusy
                        ? <ActivityIndicator color={WHITE} />
                        : <Text style={s.ctaText}>{ctaLabel}</Text>
                    }
                </TouchableOpacity>

                {/* Referral / promo code (hidden + no-op when the `referrals` flag is OFF).
                    On a free comp the server grants entitlement; refresh + route past paywall. */}
                <ReferralCodeField
                    initialCode={route?.params?.referralCode}
                    onComped={async () => {
                        await refreshUser();
                        navigation.navigate('FaceScanResults', { postPay: true });
                    }}
                />

                {/* Legal footer */}
                <View style={s.legalRow}>
                    {IS_IOS && (
                        <TouchableOpacity onPress={handleRestore} disabled={busy} hitSlop={8} activeOpacity={0.7}>
                            <Text style={s.legalLink}>{appleRestoring ? 'Restoring…' : 'Restore'}</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => navigation.navigate('LegalDocument', { document: 'terms' })} hitSlop={8} activeOpacity={0.7}>
                        <Text style={s.legalLink}>Terms of Service</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.navigate('LegalDocument', { document: 'privacy' })} hitSlop={8} activeOpacity={0.7}>
                        <Text style={s.legalLink}>Privacy Policy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.navigate('LegalDocument', { document: 'terms' })} hitSlop={8} activeOpacity={0.7}>
                        <Text style={s.legalLink}>Restore Purchases</Text>
                    </TouchableOpacity>
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

    content: {
        flex: 1,
        paddingHorizontal: 20,
        gap: 8,
    },

    title: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 38,
        fontWeight: '700',
        color: INK,
        letterSpacing: -1,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: MUTED,
        textAlign: 'center',
        letterSpacing: 0.1,
    },

    /* feature card — flex:1 fills all available vertical space */
    featureCard: {
        flex: 1,
        backgroundColor: CARD_BG,
        borderRadius: 22,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIR,
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
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(17,17,19,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
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
    cta: {
        backgroundColor: INK,
        borderRadius: 999,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 6 }),
    },
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

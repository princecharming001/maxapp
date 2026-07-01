/**
 * ReferralCodeScreen — the step right before the paywall. Enter a referral code
 * (caps-only) and Apply → "Approved". On a full free comp (e.g. CASH99) the
 * bottom button redeems server-side and routes PAST the payment screen straight
 * into the app. No code → continue to checkout as normal. The client never
 * self-grants — a comp only routes forward after the server confirms entitlement.
 *
 * Centered, "Craft"-aesthetic layout (cream canvas, serif display title) to match
 * Landing / the paywall.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ReferralCodeField, ReferralCodeHandle } from '../../components/ReferralCodeField';
import { useAuth } from '../../context/AuthContext';
import { useFlag } from '../../constants/featureFlags';
import { markPostPayPending } from '../../lib/postPayNav';
import { fonts } from '../../theme/dark';

const INK = '#15130F';
const SUB = '#6B6B6B';
const BG = '#F4F2ED';

export default function ReferralCodeScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { isAnonymous } = useAuth();
    const referralsEnabled = useFlag('referrals');
    const initialCode: string | undefined = route?.params?.referralCode;

    const fieldRef = useRef<ReferralCodeHandle>(null);
    const [compReady, setCompReady] = useState(false);

    // When the `referrals` flag is OFF, the code field renders nothing — this
    // mandatory funnel step would otherwise show a "Have a referral code?" prompt
    // with no input. Skip straight to the paywall so users aren't stranded.
    useEffect(() => {
        if (!referralsEnabled) nav.replace('Payment', route?.params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [referralsEnabled]);

    // Guest gate: an unclaimed anonymous "guest" must create/claim an account before
    // the paywall — never let a guest reach referral/payment (or the app) as anon.
    // Debounced: right after claiming (from CreateAccount) the auth state can lag one
    // render, so isAnonymous is briefly still true when we arrive here. Only bounce a
    // guest back if they're STILL anon after the transition settles — otherwise a
    // just-claimed user gets kicked back into CreateAccount in a loop.
    const isAnonRef = useRef(isAnonymous);
    isAnonRef.current = isAnonymous;
    useEffect(() => {
        if (!isAnonymous) return;
        const t = setTimeout(() => {
            if (isAnonRef.current) nav.replace('CreateAccount', route?.params);
        }, 600);
        return () => clearTimeout(t);
    }, [isAnonymous]);

    // No code (or a discount-only code): continue to the paywall, passing any
    // params (e.g. a pre-filled referralCode) straight through.
    const goPayment = () => nav.navigate('Payment', route?.params);

    // Bottom button: a full comp redeems + routes PAST the paywall; otherwise
    // it's a normal "continue to checkout".
    const onContinue = async () => {
        if (compReady) {
            const comped = await fieldRef.current?.redeem();
            if (comped) return; // onComped already routed us into the app
        }
        goPayment();
    };

    if (isAnonymous) return <View style={styles.root} />;  // redirecting an anon guest to CreateAccount
    if (!referralsEnabled) return <View style={styles.root} />;  // redirecting to Payment (referrals off)

    return (
        <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity style={styles.back} onPress={() => nav.goBack()} hitSlop={12} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={26} color={INK} />
            </TouchableOpacity>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.title}>
                        Have a referral{'\n'}<Text style={styles.titleItalic}>code?</Text>
                    </Text>
                    <Text style={styles.sub}>Enter it to unlock access. No code? Continue to checkout.</Text>

                    {/* Caps-only input + validate. On a full comp the bottom button
                        redeems (server grants), refreshes auth and routes past the paywall. */}
                    <ReferralCodeField
                        ref={fieldRef}
                        initialCode={initialCode}
                        onValidated={(res) => setCompReady(res.valid && res.free)}
                        onComped={() => {
                            // A full comp makes the user PAID, so the field's
                            // refreshUser() flips isPaid and REMOUNTS the navigator
                            // into the paid stack — a direct navigate() here races and
                            // loses to that remount (the screen just froze). Set the
                            // same one-shot post-pay flag the real IAP purchase path
                            // uses (BEFORE the field refreshes); App.tsx then routes to
                            // FaceScanResults (or Home) once the paid stack has mounted.
                            markPostPayPending();
                        }}
                    />

                    <TouchableOpacity style={styles.cta} onPress={onContinue} activeOpacity={0.85} accessibilityRole="button">
                        <Text style={styles.ctaText}>{compReady ? 'Unlock access' : 'Continue to checkout'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.skip} onPress={goPayment} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.skipText}>I don’t have a code</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },
    back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
    // flexGrow + center → vertically centered when there's room, scrolls when the keyboard is up.
    content: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
    title: { fontFamily: fonts.serif, fontSize: 33, color: INK, letterSpacing: -0.6, lineHeight: 37 },
    titleItalic: { fontFamily: fonts.serifItalic, fontStyle: 'italic' },
    sub: { fontFamily: fonts.sans, fontSize: 15.5, color: SUB, marginTop: 12, lineHeight: 22 },
    cta: {
        marginTop: 28, alignSelf: 'stretch', height: 58, borderRadius: 29, borderCurve: 'continuous',
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#1A1714', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 4 }),
    },
    ctaText: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: INK, letterSpacing: 0.2 },
    skip: { marginTop: 18, alignItems: 'center' },
    skipText: { fontFamily: fonts.sans, fontSize: 14, color: SUB, textDecorationLine: 'underline' },
});

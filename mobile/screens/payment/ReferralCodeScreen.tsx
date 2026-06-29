/**
 * ReferralCodeScreen — the step right before the paywall. Enter a referral code
 * (caps-only) and, on a full free comp (e.g. CASH99), the server grants premium
 * and we route PAST the payment screen straight into the app. No code → continue
 * to checkout as normal. The client never self-grants — a comp only routes the
 * user forward after the server has confirmed entitlement (ReferralCodeField →
 * refreshUser → onComped).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ReferralCodeField } from '../../components/ReferralCodeField';
import { useAuth } from '../../context/AuthContext';

const INK = '#15130F';
const SUB = '#6B6B6B';
const BG = '#F4F2ED';

export default function ReferralCodeScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { refreshUser } = useAuth();
    const initialCode: string | undefined = route?.params?.referralCode;

    // No code (or a discount-only code): continue to the paywall, passing any
    // params (e.g. a pre-filled referralCode) straight through.
    const goPayment = () => nav.navigate('Payment', route?.params);

    return (
        <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity style={styles.back} onPress={() => nav.goBack()} hitSlop={12} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={26} color={INK} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>Have a referral{'\n'}code?</Text>
                <Text style={styles.sub}>Enter it to unlock access. No code? Continue to checkout.</Text>

                {/* Caps-only input + validate/redeem. On a full comp the server grants
                    entitlement; we refresh auth and route past the paywall. */}
                <ReferralCodeField
                    initialCode={initialCode}
                    onComped={async () => {
                        await refreshUser();
                        nav.navigate('FaceScanResults', { postPay: true });
                    }}
                />

                <TouchableOpacity style={styles.cta} onPress={goPayment} activeOpacity={0.9} accessibilityRole="button">
                    <Text style={styles.ctaText}>Continue to checkout</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skip} onPress={goPayment} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.skipText}>I don’t have a code</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG, paddingHorizontal: 22 },
    back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
    content: { paddingTop: 18, paddingBottom: 48 },
    title: { fontFamily: 'Matter-Bold', fontSize: 34, color: INK, letterSpacing: -0.8, lineHeight: 38 },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, marginTop: 10, lineHeight: 21 },
    cta: { marginTop: 26, height: 54, borderRadius: 27, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.2 },
    skip: { marginTop: 16, alignItems: 'center' },
    skipText: { fontFamily: 'Matter-Regular', fontSize: 14, color: SUB, textDecorationLine: 'underline' },
});

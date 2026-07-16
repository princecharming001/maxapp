/**
 * AppleSignInButton — real Sign in with Apple (App Store guideline 4.8: an app
 * offering Google Sign-In must offer an equivalent Apple option).
 *
 * iOS-only: renders nothing on Android / web / unsupported iOS so those layouts
 * are unchanged. Styled to match each screen's existing dark button (pass the
 * screen's own `style`/`textStyle`/`iconColor`) — a black button with the Apple
 * mark + "Continue with Apple" is compliant with Apple's button guidelines.
 *
 * Apple returns the user's name/email only on the FIRST authorization, so we
 * forward whatever the credential carries; the backend matches by the stable
 * apple_sub afterward.
 */
import React, { useEffect, useState } from 'react';
import {
    Platform, TouchableOpacity, Text, ActivityIndicator, StyleSheet,
    StyleProp, ViewStyle, TextStyle, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../../context/AuthContext';

type OnAuthSuccess = (user?: { id: string; is_paid?: boolean; onboarding?: { completed?: boolean } }) => void;

export function AppleSignInButton({
    label = 'Continue with Apple',
    style,
    textStyle,
    iconColor = '#FFFFFF',
    onAuthSuccess,
}: {
    label?: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    iconColor?: string;
    onAuthSuccess?: OnAuthSuccess;
}) {
    const { signInWithApple } = useAuth();
    const [available, setAvailable] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        if (Platform.OS === 'ios') {
            AppleAuthentication.isAvailableAsync()
                .then((a) => mounted && setAvailable(a))
                .catch(() => mounted && setAvailable(false));
        }
        return () => { mounted = false; };
    }, []);

    if (Platform.OS !== 'ios' || !available) return null;

    const onPress = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const cred = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });
            if (!cred.identityToken) throw new Error('no identity token');
            const u = await signInWithApple(cred.identityToken, {
                givenName: cred.fullName?.givenName ?? undefined,
                familyName: cred.fullName?.familyName ?? undefined,
                email: cred.email ?? undefined,
            });
            onAuthSuccess?.(u as Parameters<OnAuthSuccess>[0]);
        } catch (e: any) {
            // User tapped Cancel on the Apple sheet — not an error, say nothing.
            if (e?.code !== 'ERR_REQUEST_CANCELED' && e?.code !== 'ERR_CANCELED') {
                Alert.alert('Apple Sign In', "Couldn't sign in with Apple. Try again.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <TouchableOpacity
            style={[styles.btn, style]}
            activeOpacity={0.85}
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            {busy ? (
                <ActivityIndicator color={iconColor} />
            ) : (
                <>
                    <Ionicons name="logo-apple" size={18} color={iconColor} />
                    <Text style={[styles.text, { color: iconColor }, textStyle]}>{label}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    btn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, height: 52, borderRadius: 14, backgroundColor: '#000000',
    },
    text: { fontSize: 16, fontWeight: '600' },
});

export default AppleSignInButton;

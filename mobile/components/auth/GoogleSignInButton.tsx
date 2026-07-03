/**
 * GoogleSignInButton - "Continue with Google" for sign-in AND sign-up
 * (Google identity is find-or-create on the backend, so one button does both).
 *
 * Real path: expo-auth-session Google provider returns an ID token from the
 * consent flow; we POST it to /auth/google which verifies it and issues our
 * tokens. Works on web and native once real client IDs are configured.
 *
 * Graceful + demoable: the OAuth hook (Google.useAuthRequest) crashes if it
 * runs without a client id, so it lives in a child that is ONLY mounted when
 * the server reports real client ids. When unconfigured, the button hides in
 * production but, in dev, runs a lightweight path against /auth/google/dev so
 * the identity flow is testable on localhost before OAuth clients exist.
 */
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

// Lets the auth popup close itself on web after the redirect.
WebBrowser.maybeCompleteAuthSession();

type Cfg = { available: boolean; web: string; ios: string };

function ButtonShell({
    label,
    busy,
    error,
    onPress,
    variant = 'solid',
}: {
    label: string;
    busy: boolean;
    error: string | null;
    onPress: () => void;
    variant?: 'solid' | 'glass';
}) {
    const glass = variant === 'glass';
    return (
        <View>
            <TouchableOpacity
                style={[styles.btn, glass && styles.btnGlass]}
                activeOpacity={0.85}
                onPress={onPress}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                {busy ? (
                    <ActivityIndicator color={glass ? '#FFFFFF' : '#1C1A17'} />
                ) : (
                    <>
                        <Ionicons name="logo-google" size={18} color="#4285F4" style={{ marginRight: 10 }} />
                        <Text style={[styles.label, glass && styles.labelGlass]}>{label}</Text>
                    </>
                )}
            </TouchableOpacity>
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
}

/** Real OAuth-backed button. Only mounted when client ids exist, so the
 *  useAuthRequest hook always receives valid input. */
/** Called with the signed-in user (AuthContext's User) so screens can tell an
 *  anon-account CLAIM (same user id) from a sign-in that switched accounts. */
type OnAuthSuccess = (user?: { id: string; is_paid?: boolean; onboarding?: { completed?: boolean } }) => void;

function RealGoogleButton({ cfg, label, variant, onAuthSuccess }: { cfg: Cfg; label: string; variant?: 'solid' | 'glass'; onAuthSuccess?: OnAuthSuccess }) {
    const { signInWithGoogle } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [request, response, promptAsync] = Google.useAuthRequest({
        webClientId: cfg.web || undefined,
        iosClientId: cfg.ios || undefined,
        responseType: 'id_token',
        scopes: ['openid', 'email', 'profile'],
    });

    useEffect(() => {
        if (!response) return;
        if (response.type === 'error') {
            setBusy(false);
            setError('Google sign-in was cancelled or failed.');
            return;
        }
        if (response.type !== 'success') return;
        const idToken =
            (response.params as any)?.id_token ||
            (response.authentication as any)?.idToken;
        if (!idToken) {
            setBusy(false);
            setError('Google did not return a token. Try again.');
            return;
        }
        setBusy(true);
        signInWithGoogle(idToken)
            .then((u) => onAuthSuccess?.(u as Parameters<OnAuthSuccess>[0]))
            .catch(() => setError("Couldn't sign in with Google. Try again."))
            .finally(() => setBusy(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [response]);

    return (
        <ButtonShell
            label={label}
            busy={busy}
            error={error}
            variant={variant}
            onPress={async () => {
                setError(null);
                if (!request) {
                    setError('Google sign-in is not ready yet.');
                    return;
                }
                setBusy(true);
                try {
                    await promptAsync();
                } catch {
                    setError('Could not open Google sign-in.');
                } finally {
                    setBusy(false);
                }
            }}
        />
    );
}

/** DEV fallback when no OAuth client is configured: proves the identity path
 *  end-to-end on localhost. Never calls the OAuth hook. */
function DevGoogleButton({ label, variant, onAuthSuccess }: { label: string; variant?: 'solid' | 'glass'; onAuthSuccess?: OnAuthSuccess }) {
    const { signInWithGoogleDev } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <ButtonShell
            label={label}
            busy={busy}
            error={error}
            variant={variant}
            onPress={async () => {
                setError(null);
                let email = 'demo.google@gmail.com';
                let name = 'Demo Google';
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    const entered = window.prompt(
                        'DEV Google sign-in\nEnter an email to sign in as:',
                        email,
                    );
                    if (!entered) return;
                    email = entered.trim();
                    name = email.split('@')[0];
                }
                setBusy(true);
                try {
                    const u = await signInWithGoogleDev(email, name);
                    onAuthSuccess?.(u as Parameters<OnAuthSuccess>[0]);
                } catch {
                    setError("Couldn't sign in. Try again.");
                } finally {
                    setBusy(false);
                }
            }}
        />
    );
}

/** Native iOS Google Sign-In via @react-native-google-signin.
 *
 *  expo-auth-session's web `id_token` flow is rejected by Google for iOS OAuth
 *  clients ("Access blocked: Authorization Error / invalid_request") — iOS
 *  clients can't do the implicit id_token flow. The native SDK runs Google's
 *  proper iOS flow and returns an ID token directly, which our backend verifies
 *  the same way. The module is loaded lazily so web never touches the native code. */
function NativeGoogleButton({ cfg, label, variant, onAuthSuccess }: { cfg: Cfg; label: string; variant?: 'solid' | 'glass'; onAuthSuccess?: OnAuthSuccess }) {
    const { signInWithGoogle } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const { GoogleSignin } = require('@react-native-google-signin/google-signin');
            GoogleSignin.configure({
                iosClientId: cfg.ios || undefined,
                webClientId: cfg.web || undefined,
                scopes: ['openid', 'email', 'profile'],
            });
        } catch {
            setError('Google sign-in is unavailable on this build.');
        }
    }, [cfg.ios, cfg.web]);

    const onPress = async () => {
        setError(null);
        setBusy(true);
        try {
            const { GoogleSignin } = require('@react-native-google-signin/google-signin');
            await GoogleSignin.hasPlayServices();
            const res: any = await GoogleSignin.signIn();
            // v13+ returns { type, data: { idToken } }; older returns { idToken }.
            if (res?.type === 'cancelled') { setBusy(false); return; }
            const idToken = res?.data?.idToken ?? res?.idToken;
            if (!idToken) {
                setError('Google did not return a token. Try again.');
                setBusy(false);
                return;
            }
            const u = await signInWithGoogle(idToken);
            onAuthSuccess?.(u as Parameters<OnAuthSuccess>[0]);
        } catch (e: any) {
            const msg = String(e?.message || '');
            const code = String(e?.code || '');
            if (/cancel/i.test(msg) || code === 'SIGN_IN_CANCELLED' || code === '-5') {
                setBusy(false);
                return;
            }
            setError("Couldn't sign in with Google. Try again.");
        } finally {
            setBusy(false);
        }
    };

    return <ButtonShell label={label} busy={busy} error={error} variant={variant} onPress={onPress} />;
}

export function GoogleSignInButton({ label, variant, onAuthSuccess }: { label?: string; variant?: 'solid' | 'glass'; onAuthSuccess?: OnAuthSuccess }) {
    const [cfg, setCfg] = useState<Cfg | null>(null);

    useEffect(() => {
        let alive = true;
        api.getGoogleAuthConfig()
            .then((c) => alive && setCfg({ available: c.available, web: c.web_client_id, ios: c.ios_client_id }))
            .catch(() => alive && setCfg({ available: false, web: '', ios: '' }));
        return () => { alive = false; };
    }, []);

    const text = label || 'Continue with Google';
    if (cfg === null) return null;                  // config still loading
    if (cfg.available) {
        // iOS: native SDK (reliable id_token). Web/other: expo-auth-session flow.
        return Platform.OS === 'ios'
            ? <NativeGoogleButton cfg={cfg} label={text} variant={variant} onAuthSuccess={onAuthSuccess} />
            : <RealGoogleButton cfg={cfg} label={text} variant={variant} onAuthSuccess={onAuthSuccess} />;
    }
    if (__DEV__) return <DevGoogleButton label={text} variant={variant} onAuthSuccess={onAuthSuccess} />;
    return null;                                     // unconfigured in prod: hide
}

const styles = StyleSheet.create({
    btn: {
        height: 54,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E2E2',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderCurve: 'continuous',
    },
    btnGlass: {
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderColor: 'rgba(255,255,255,0.45)',
    },
    label: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        letterSpacing: 0.3,
        color: '#1C1A17',
    },
    labelGlass: {
        color: '#FFFFFF',
    },
    error: {
        fontFamily: 'Matter-Regular',
        fontSize: 12.5,
        color: '#C0452C',
        marginTop: 8,
        textAlign: 'center',
    },
});

export default GoogleSignInButton;

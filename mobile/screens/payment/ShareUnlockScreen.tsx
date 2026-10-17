/**
 * ShareUnlockScreen — "Text 15 friends, get your first week free."
 *
 * One friend at a time: the system contact picker (no contacts permission is
 * asked for; the app only ever sees the one contact the person picks), then
 * the system Messages composer with the preset text filled in. iOS reports
 * whether they tapped Send; each sent message is posted to the server, which
 * counts distinct recipients and grants the week on the last one. The client
 * never self-grants: it shows the server's count and, once granted, routes
 * exactly like a referral comp (ReferralCodeScreen.onComped).
 *
 * Simulator / devices without Messages: the composer is unavailable, so a
 * __DEV__-only fallback fakes a send to a random number to exercise the flow.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SMS from 'expo-sms';
import * as Contacts from 'expo-contacts';
import * as Haptics from 'expo-haptics';
import { Alert } from '../../components/InAppAlert';
import api, { ShareUnlockStatus } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../lib/analytics';
import { fonts } from '../../theme/dark';

const INK = '#15130F';
const SUB = '#6B6B6B';
const BG = '#F4F2ED';
const ACCENT = '#2F6B4E';
const ERR = '#B23A2E';

/** The number to text for a picked contact: a mobile-labelled one first. */
function pickNumber(contact: Contacts.Contact): string | null {
    const nums = contact.phoneNumbers ?? [];
    const mobile = nums.find((p) => /mobile|iphone|cell/i.test(p.label ?? ''));
    const chosen = mobile ?? nums[0];
    const raw = chosen?.digits || chosen?.number || '';
    return raw.replace(/[^\d+]/g, '').length >= 7 ? raw : null;
}

/** Simulator only: Messages can't open there, so fake a distinct recipient. */
function devFakeNumber(): string {
    return '1555' + String(Math.floor(1000000 + Math.random() * 8999999));
}

export default function ShareUnlockScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { user, refreshUser } = useAuth();

    const [status, setStatus] = useState<ShareUnlockStatus | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            setStatus(await api.getShareUnlock());
        } catch {
            setLoadError(true);
        }
    }, []);

    useEffect(() => {
        track('share_unlock_view');
        void load();
    }, [load]);

    // Granted: leave the same way a referral comp does. Navigate FIRST, then
    // refresh — refreshUser flips isPaid, and mid-funnel the navigator never
    // remounts (onboarding incomplete), so the route must be explicit.
    const finish = async () => {
        if (user?.onboarding?.completed !== true) {
            nav.navigate('CreateAccount', route?.params);
        } else {
            const names: string[] = ((nav.getState?.() as any)?.routeNames) ?? [];
            if (names.includes('Main')) nav.navigate('Main');
            else if (nav.canGoBack()) nav.goBack();
        }
        try { await refreshUser(); } catch { /* the next /users/me catches up */ }
    };

    const textAFriend = async () => {
        if (busyRef.current || !status?.eligible) return;
        busyRef.current = true;
        setBusy(true);
        try {
            const available = await SMS.isAvailableAsync();
            let phone: string | null = null;
            if (!available) {
                if (!__DEV__) {
                    Alert.alert('Messages is not available', 'This device cannot send texts, so this offer is not available here.');
                    return;
                }
                phone = devFakeNumber();
            } else {
                const contact = await Contacts.presentContactPickerAsync();
                if (!contact) return;
                phone = pickNumber(contact);
                if (!phone) {
                    Alert.alert('No phone number', 'That contact has no phone number. Pick someone else.');
                    return;
                }
                const { result } = await SMS.sendSMSAsync([phone], status.message);
                if (result !== 'sent') return;       // cancelled in the composer: nothing to count
            }
            const res = await api.recordShareUnlockSend(phone, 'sent');
            setStatus(res);
            track('share_unlock_send', { sent: res.sent, counted: res.counted === true });
            if (!res.counted) {
                Alert.alert('Already counted', 'You already texted that friend. Pick someone new.');
                return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            if (res.granted_now || res.granted) {
                track('share_unlock_granted');
                Alert.alert('Your free week is on', `${res.grant_days} days of full access, starting now.`,
                    [{ text: 'Let\'s go', onPress: () => { void finish(); } }]);
            }
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            if (detail?.reason) {
                await load();
                Alert.alert('Not available', detail.message || 'This offer is not available for your account.');
            } else {
                Alert.alert('Something went wrong', 'Check your connection and try again. Your sent texts are saved.');
            }
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const target = status?.target ?? 15;
    const sent = status?.sent ?? 0;

    return (
        <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity style={styles.back} onPress={() => nav.goBack()} hitSlop={12} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={26} color={INK} />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {loadError ? (
                    <>
                        <Text style={styles.title}>Couldn't load{'\n'}<Text style={styles.titleItalic}>this offer</Text></Text>
                        <Text style={styles.sub}>Check your connection and try again.</Text>
                        <TouchableOpacity style={styles.cta} onPress={() => void load()} activeOpacity={0.85} accessibilityRole="button">
                            <Text style={styles.ctaText}>Try again</Text>
                        </TouchableOpacity>
                    </>
                ) : !status ? (
                    <ActivityIndicator color={INK} />
                ) : !status.eligible ? (
                    <>
                        <Text style={styles.title}>
                            {status.granted ? 'Your free week' : 'Nothing to'}{'\n'}
                            <Text style={styles.titleItalic}>{status.granted ? 'is already on' : 'unlock'}</Text>
                        </Text>
                        <Text style={styles.sub}>{status.reason_message || 'This offer is not available for your account.'}</Text>
                        <TouchableOpacity style={styles.cta} onPress={() => nav.goBack()} activeOpacity={0.85} accessibilityRole="button">
                            <Text style={styles.ctaText}>Back</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={styles.title}>
                            Text {target} friends,{'\n'}<Text style={styles.titleItalic}>get a week free</Text>
                        </Text>
                        <Text style={styles.sub}>
                            Send the message below to {target} people in Messages, one at a time. It counts the moment you tap Send. They don't need to reply.
                        </Text>

                        <View style={styles.card} accessibilityLabel="The message you will send">
                            <Text style={styles.cardLabel}>THE MESSAGE</Text>
                            <Text style={styles.cardText}>{status.message}</Text>
                        </View>

                        <View style={styles.dots} accessibilityLabel={`${sent} of ${target} sent`}>
                            {Array.from({ length: target }, (_, i) => (
                                <View key={i} style={[styles.dot, i < sent && styles.dotDone]} />
                            ))}
                        </View>
                        <Text style={styles.progress}>
                            {sent === 0 ? `0 of ${target} sent` : sent >= target ? 'Done' : `${sent} of ${target} sent`}
                        </Text>

                        <TouchableOpacity
                            style={[styles.cta, busy && styles.ctaBusy]}
                            onPress={() => void textAFriend()}
                            disabled={busy}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                        >
                            {busy
                                ? <ActivityIndicator color={INK} />
                                : <Text style={styles.ctaText}>{sent === 0 ? 'Text a friend' : 'Text another friend'}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.skip} onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button">
                            <Text style={styles.skipText}>Do this later</Text>
                        </TouchableOpacity>

                        <Text style={styles.fine}>
                            Your progress is saved. We use the number you pick only to count that friend once, and keep it as an irreversible code, never as the number itself. Your contact list is never uploaded.
                        </Text>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },
    back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
    content: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
    title: { fontFamily: fonts.serif, fontSize: 33, color: INK, letterSpacing: -0.6, lineHeight: 37 },
    titleItalic: { fontFamily: fonts.serifItalic, fontStyle: 'italic' },
    sub: { fontFamily: fonts.sans, fontSize: 15.5, color: SUB, marginTop: 12, lineHeight: 22 },
    card: {
        marginTop: 22, padding: 16, borderRadius: 16, borderCurve: 'continuous',
        backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E8E4DB',
    },
    cardLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.2, color: SUB },
    cardText: { fontFamily: fonts.sans, fontSize: 15.5, color: INK, marginTop: 8, lineHeight: 22 },
    dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 24 },
    dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E3DFD6' },
    dotDone: { backgroundColor: ACCENT },
    progress: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: INK, marginTop: 10 },
    cta: {
        marginTop: 24, alignSelf: 'stretch', height: 58, borderRadius: 29, borderCurve: 'continuous',
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#1A1714', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }
            : { elevation: 4 }),
    },
    ctaBusy: { opacity: 0.7 },
    ctaText: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: INK, letterSpacing: 0.2 },
    skip: { marginTop: 18, alignItems: 'center' },
    skipText: { fontFamily: fonts.sans, fontSize: 14, color: SUB, textDecorationLine: 'underline' },
    fine: { fontFamily: fonts.sans, fontSize: 12, color: SUB, marginTop: 22, lineHeight: 17 },
    err: { color: ERR },
});

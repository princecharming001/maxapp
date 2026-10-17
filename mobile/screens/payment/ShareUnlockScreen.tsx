/**
 * ShareUnlockScreen — "Text 15 friends, get your first week free."
 *
 * One friend at a time: the system contact picker (no contacts permission is
 * asked for; the app only ever sees the one contact the person picks), then
 * the system Messages composer with the preset text filled in. iOS reports
 * whether they tapped Send; each sent message is posted to the server with a
 * send id made up right then, and the server counts distinct recipients and
 * grants the week on the last one. The client never self-grants: it shows the
 * server's count and, once granted, routes exactly like a referral comp
 * (ReferralCodeScreen.onComped).
 *
 * A text that went out but couldn't be reported (offline, server blip) is
 * kept in lib/shareUnlockPending and replayed with the same send id the next
 * time this screen opens; the server answers a replay with its original
 * outcome, so nothing is ever counted twice or lost.
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
import {
    addPendingShareSend, loadPendingShareSends, newShareSendId, setPendingShareSends, PendingShareSend,
} from '../../lib/shareUnlockPending';
import { fonts } from '../../theme/dark';

const INK = '#15130F';
const SUB = '#6B6B6B';
const BG = '#F4F2ED';
const ACCENT = '#2F6B4E';

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What a failed report means for a text that already went out. `final`: the
 *  server has ruled on it (bad number, or the week is already earned), so
 *  replaying it is pointless. Anything else (offline, 5xx, rate limit, auth
 *  blip, feature off) is "not yet": keep it for a replay. */
function classifyFailure(e: any): { final: boolean; reason: string; message?: string } {
    const code = e?.response?.status as number | undefined;
    const detail = e?.response?.data?.detail;
    const reason = detail && typeof detail === 'object' ? String(detail.reason ?? '') : '';
    const message = detail && typeof detail === 'object' ? (detail.message as string | undefined) : undefined;
    return { final: code === 400 || code === 422 || reason === 'already_claimed', reason, message };
}

/** Report a send, retrying the "not yet" failures a few times first. */
async function postSend(send: PendingShareSend): Promise<ShareUnlockStatus> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await api.recordShareUnlockSend(send.phone, send.id);
        } catch (e) {
            lastErr = e;
            if (classifyFailure(e).final) throw e;
            await sleep(600 * (attempt + 1));
        }
    }
    throw lastErr;
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
    const grantedRef = useRef(false);
    // Read at call time, so callbacks keep one identity and the mount effect runs once.
    const latest = useRef({ userId: '', onboarded: false, params: route?.params });
    latest.current = { userId: String(user?.id ?? ''), onboarded: user?.onboarding?.completed === true, params: route?.params };

    // Granted: leave the same way a referral comp does. Navigate FIRST, then
    // refresh — refreshUser flips isPaid, and mid-funnel the navigator never
    // remounts (onboarding incomplete), so the route must be explicit.
    const onGranted = useCallback((res: ShareUnlockStatus) => {
        if (grantedRef.current) return;
        grantedRef.current = true;
        track('share_unlock_granted');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (!latest.current.onboarded) {
            nav.navigate('CreateAccount', latest.current.params);
        } else {
            const names: string[] = ((nav.getState?.() as any)?.routeNames) ?? [];
            if (names.includes('Main')) nav.navigate('Main');
            else if (nav.canGoBack()) nav.goBack();
        }
        void refreshUser().catch(() => undefined);     // the next /users/me catches up otherwise
        Alert.alert('Your free week is on', `${res.grant_days} days of full access, starting now.`);
    }, [nav, refreshUser]);

    const load = useCallback(async (): Promise<ShareUnlockStatus | null> => {
        setLoadError(false);
        try {
            const st = await api.getShareUnlock();
            setStatus(st);
            return st;
        } catch {
            setLoadError(true);
            return null;
        }
    }, []);

    // Sends that went out earlier but never reached the server.
    const flushPending = useCallback(async (): Promise<ShareUnlockStatus | null> => {
        const uid = latest.current.userId;
        if (!uid) return null;
        const pending = await loadPendingShareSends(uid);
        if (!pending.length) return null;
        const left: PendingShareSend[] = [];
        let last: ShareUnlockStatus | null = null;
        for (const send of pending) {
            try {
                last = await api.recordShareUnlockSend(send.phone, send.id);
            } catch (e) {
                if (!classifyFailure(e).final) left.push(send);
            }
        }
        await setPendingShareSends(uid, left);
        return last;
    }, []);

    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        track('share_unlock_view');
        void (async () => {
            const replayed = await flushPending();
            const st = (await load()) ?? replayed;
            if (!st) return;
            if (st.granted) {                  // the week landed but this device never heard (lost response)
                onGranted(st);
                return;
            }
            if (st.eligible && st.sent >= st.target) {   // finished while a subscription was live: pay out now
                try {
                    const claimed = await api.claimShareUnlock();
                    setStatus(claimed);
                    if (claimed.granted) onGranted(claimed);
                } catch {
                    /* next open */
                }
            }
        })();
    }, [flushPending, load, onGranted]);

    const textAFriend = async () => {
        if (busyRef.current || !status?.eligible) return;
        busyRef.current = true;
        setBusy(true);
        try {
            const available = await SMS.isAvailableAsync();
            let phone: string;
            if (!available) {
                if (!__DEV__) {
                    Alert.alert('Messages is not available', 'This device cannot send texts, so this offer is not available here.');
                    return;
                }
                phone = devFakeNumber();
            } else {
                const contact = await Contacts.presentContactPickerAsync();
                if (!contact) return;
                const picked = pickNumber(contact);
                if (!picked) {
                    Alert.alert('No phone number', 'That contact has no phone number. Pick someone else.');
                    return;
                }
                phone = picked;
                const { result } = await SMS.sendSMSAsync([phone], status.message);
                if (result !== 'sent') return;       // cancelled in the composer: nothing to count
            }

            const send: PendingShareSend = { phone, id: newShareSendId(), at: Date.now() };
            let res: ShareUnlockStatus;
            try {
                res = await postSend(send);
            } catch (e) {
                const failure = classifyFailure(e);
                if (!failure.final) {
                    // The text went out; make sure it counts later.
                    await addPendingShareSend(latest.current.userId, send);
                    Alert.alert('Sent, not counted yet', 'We could not reach the server. That text is saved and will count the next time you open this screen.');
                    return;
                }
                if (failure.reason === 'already_claimed') {   // the week is already theirs; go
                    const st = await load();
                    if (st) onGranted(st);
                    return;
                }
                Alert.alert('Not counted', failure.message || 'That contact could not be counted. Pick someone else.');
                return;
            }
            setStatus(res);
            track('share_unlock_send', { sent: res.sent, counted: res.counted === true, replay: res.replay === true });
            if (!res.counted && !res.replay) {
                Alert.alert('Already counted', 'You already texted that friend. Pick someone new.');
                return;
            }
            Haptics.selectionAsync().catch(() => {});
            if (res.granted) onGranted(res);
        } catch {
            Alert.alert('Something went wrong', 'Please try again.');
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
                            Your progress is saved. The number you pick is used only to count that friend once; our servers keep it as an irreversible code, never as the number itself. Your contact list is never uploaded.
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
});

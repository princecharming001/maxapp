import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus, View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable, PanResponder, Animated, KeyboardAvoidingView, Platform, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useChatHistoryQuery } from '../../hooks/useAppQueries';
import { queryKeys } from '../../lib/queryClient';
import { ChatTypingIndicator, ChatTypingMode } from '../../components/ChatTypingIndicator';
import { colors, spacing, borderRadius, typography, fonts } from '../../theme/dark';
import { CachedImage } from '../../components/CachedImage';
import ChatConversationsDrawer from '../../components/ChatConversationsDrawer';
import ChatSliderInput, { SliderSpec } from '../../components/ChatSliderInput';
import ChatHabitPicker, { HabitPickerSpec } from '../../components/ChatHabitPicker';
import { renderRichText } from '../../utils/chatMarkdown';

const PENDING_CHAT_KEY = '@max_pending_chat_v1';

/** Widgets the chat knows how to render inline (slider question / habit picker). */
function isRenderableWidget(w: any): boolean {
    return !!w && (w.type === 'slider' || w.type === 'habit_picker');
}

/** Starter prompts shown on the empty chat — tap to send, and they keep the
 *  blank state from feeling bare. Short, in the app's blunt coach voice. */
const EMPTY_STARTERS = [
    'Build my plan for today',
    'What should I use on my skin?',
    'Rate my routine',
];

interface Message {
  /** Server id; absent on optimistically-appended turns until /history reload. */
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  attachment_url?: string;
  attachment_type?: string;
  /** Local device uri for an optimistic image bubble (renders before upload completes). */
  localImageUri?: string;
  isTyping?: boolean;
  typingMode?: ChatTypingMode;
  /** Set on a freshly-received reply so it streams in (history loads instantly). */
  justArrived?: boolean;
  /** When this message replied to an earlier one, the inline quote strip. */
  reply_to?: { id: string; role: 'user' | 'assistant'; preview: string } | null;
}

/** Active reply-target — set by swipe-right on a bubble; cleared on send / cancel. */
interface ReplyTarget {
    id: string;
    role: 'user' | 'assistant';
    preview: string;
}

/**
 * iMessage-style swipe-to-reply row.
 *
 * Why a dedicated component (instead of inline ReanimatedSwipeable in
 * renderItem):
 *
 *  1. ReanimatedSwipeable's `onSwipeableOpen` callback in this version
 *     of `react-native-gesture-handler` ONLY receives `direction` — it
 *     does NOT pass the swipeable instance, so the previous code's
 *     `swipeable?.close?.()` was a no-op against undefined. The bubble
 *     never snapped back. To programmatically close, we need a ref.
 *
 *  2. A ref needs a stable owner — putting `useRef` inside a
 *     renderItem function would create a new ref on every render. The
 *     row needs to be its own component.
 *
 * UX contract (matches iMessage / WhatsApp):
 *
 *  - User drags right past the threshold → onSwipeableOpen fires →
 *    we call `onCommit()` (parent sets the reply target, triggering the
 *    reply preview bar above the input) AND immediately call
 *    `ref.current.close()` so the bubble snaps back to its resting
 *    position. The reply preview is the only persistent UI.
 *
 *  - Selection haptic on commit so the user feels the action register
 *    (the bubble's snap-back is so fast otherwise it can feel like
 *    nothing happened).
 *
 *  - Only one active reply: the parent's `replyTarget` is a single
 *    state slot. New commits replace the previous target. Each row's
 *    swipeable closes itself on commit, so there's never a stale
 *    indented bubble lying around.
 */
/**
 * Swipe-right-to-reply, cross-platform.
 *
 * Implementation: plain `PanResponder` driving an `Animated.Value` for
 * translateX. We tried `react-native-gesture-handler/ReanimatedSwipeable`
 * twice — its callbacks don't fire reliably on RN-Web (the localhost
 * browser) and its native worklet plumbing makes the JS callback go
 * stale across re-renders. PanResponder is universal, has zero worklet
 * indirection, and gives us the exact iMessage gesture: drag right,
 * release past threshold to commit, bubble springs back.
 *
 * Behaviour:
 *  - Pan grants only on horizontal-dominant drag (Math.abs(dx) > Math.abs(dy)
 *    AND |dx| > 6) so vertical scrolling stays uninterrupted.
 *  - Bubble translates right by dx, clamped to [0, 80] (right-only swipe).
 *  - Reveal a small reply icon underneath that fades in proportional to
 *    drag distance.
 *  - On release: if dx > 48 (commit threshold), fire onCommit() (with a
 *    selection haptic); spring back to 0 either way. Single-fire guard
 *    so a wobble doesn't double-commit.
 */
const SWIPE_THRESHOLD = 48;
const SWIPE_MAX = 80;

function ReplySwipeableRow({
    onCommit,
    children,
}: {
    onCommit: () => void;
    children: React.ReactNode;
}) {
    const translateX = useRef(new Animated.Value(0)).current;
    const onCommitRef = useRef(onCommit);
    onCommitRef.current = onCommit;
    const firedRef = useRef(false);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_e, g) =>
                Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6,
            onPanResponderGrant: () => {
                firedRef.current = false;
                translateX.setValue(0);
            },
            onPanResponderMove: (_e, g) => {
                if (g.dx <= 0) return;
                const clamped = Math.min(g.dx, SWIPE_MAX);
                translateX.setValue(clamped);
                if (!firedRef.current && clamped >= SWIPE_THRESHOLD) {
                    firedRef.current = true;
                    onCommitRef.current();
                    if (Platform.OS !== 'web') {
                        Haptics.selectionAsync().catch(() => {});
                    }
                }
            },
            onPanResponderRelease: () => {
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    speed: 18,
                    bounciness: 6,
                }).start();
            },
            onPanResponderTerminate: () => {
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    speed: 18,
                    bounciness: 6,
                }).start();
            },
        })
    ).current;

    const hintOpacity = translateX.interpolate({
        inputRange: [0, SWIPE_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    return (
        <View style={styles.swipeWrap}>
            <Animated.View style={[styles.swipeReplyHint, { opacity: hintOpacity }]} pointerEvents="none">
                <Ionicons name="arrow-undo" size={18} color={colors.textMuted} />
            </Animated.View>
            <Animated.View
                style={{ transform: [{ translateX }] }}
                {...panResponder.panHandlers}
            >
                {children}
            </Animated.View>
        </View>
    );
}

/**
 * Map an outgoing message + initContext to the typing-indicator mode.
 * Keeps the rotating phrases in the placeholder relevant to what the bot
 * is actually doing — schedule generation gets schedule phrases, product
 * questions get catalog phrases, etc. Falls back to the generic deck.
 */
function pickTypingMode(
    msg: string,
    initContext?: string,
    chatIntent?: string,
): ChatTypingMode {
    const ic = (initContext || '').toLowerCase();
    const lower = (msg || '').toLowerCase();
    if (ic.startsWith('skinmax') || ic.startsWith('hairmax') || ic.startsWith('fitmax') ||
        ic.startsWith('heightmax') || ic.startsWith('bonemax') ||
        /\b(schedule|routine|plan)\b/.test(lower)) {
        return 'schedule';
    }
    if (ic.startsWith('task_help')) return 'protocol';
    if (chatIntent === 'product' || /\b(product|brand|recommend|buy|amazon|link)\b/.test(lower)) {
        return 'product';
    }
    if (/\b(scan|score|analysis|metric|harmony|symmetry)\b/.test(lower)) return 'analysis';
    if (/\b(how|what|why|protocol|dose|study)\b/.test(lower)) return 'protocol';
    if (/\b(feel|stuck|tired|down|frustrated|honest|opinion)\b/.test(lower)) return 'reflection';
    return 'default';
}

// ─── ChatGPT look & animations ────────────────────────────────────────────────
const CG_BG = '#FFFFFF';
const CG_INK = '#0D0D0D';
const CG_USER_BUBBLE = '#F4F4F4';
const CG_MUTE = '#8E8E93';
const CG_ICON = '#5D5D5D';
const HS = { top: 10, bottom: 10, left: 10, right: 10 };

// "Thinking" — ChatGPT's shimmering placeholder while the reply is generated.
function ThinkingShimmer() {
  const a = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.95, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.Text style={[cg.thinking, { opacity: a }]}>Thinking</Animated.Text>;
}

// Typewriter reveal with a blinking caret while streaming; swaps to the fully
// formatted (rich) text once complete. Mirrors ChatGPT's token streaming.
function StreamingText({
  text, animate, plainStyle, renderRich,
}: {
  text: string; animate: boolean; plainStyle: any; renderRich: (t: string) => React.ReactNode;
}) {
  const [n, setN] = useState(animate ? 0 : text.length);
  const blink = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const total = text.length;
    const per = Math.max(2, Math.round(total / 200));
    const id = setInterval(() => {
      i = Math.min(total, i + per);
      setN(i);
      if (i >= total) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [animate, text]);
  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, blink]);

  if (!animate || n >= text.length) return <>{renderRich(text)}</>;
  return (
    <Text style={plainStyle}>
      {text.slice(0, n)}
      <Animated.Text style={[plainStyle, cg.caret, { opacity: blink }]}>▍</Animated.Text>
    </Text>
  );
}

/** True when an error is just the user hitting Stop (axios cancel / AbortController). */
function isAbortError(e: any): boolean {
  return (
    e?.code === 'ERR_CANCELED' ||
    e?.name === 'CanceledError' ||
    e?.name === 'AbortError' ||
    e?.message === 'canceled'
  );
}

// The black circular action button — morphs mic → up-arrow → stop, with a pop.
// States: loading (generating, disabled stop) · send (has text) · listening
// (voice capture active, tap to stop) · mic (idle, tap to dictate).
function MorphSend({ loading, hasText, listening, onPress }: { loading: boolean; hasText: boolean; listening: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const state = loading ? 'stop' : hasText ? 'send' : listening ? 'listening' : 'mic';
  useEffect(() => {
    scale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }).start();
  }, [state, scale]);
  // Soft pulse while listening so the user sees the mic is hot.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!listening) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={loading ? 'Stop' : hasText ? 'Send' : listening ? 'Stop voice' : 'Voice'}>
      <Animated.View style={[cg.sendCircle, listening && cg.sendCircleLive, { transform: [{ scale }], opacity: listening ? pulse : 1 }]}>
        {loading ? <View style={cg.stopSquare} />
          : hasText ? <Ionicons name="arrow-up" size={20} color="#fff" />
          : listening ? <View style={cg.stopSquare} />
          : <Ionicons name="mic" size={18} color="#fff" />}
      </Animated.View>
    </TouchableOpacity>
  );
}

// Copy / thumbs row under each assistant reply (ChatGPT's message toolbar).
function AssistantActions({ text }: { text: string }) {
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const copy = () => { try { (globalThis as any).navigator?.clipboard?.writeText?.(text); } catch { /* native: no-op */ } };
  return (
    <View style={cg.actions}>
      <TouchableOpacity onPress={copy} hitSlop={HS} style={cg.actionBtn} accessibilityLabel="Copy">
        <Ionicons name="copy-outline" size={16} color={CG_ICON} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setVote((v) => (v === 1 ? 0 : 1))} hitSlop={HS} style={cg.actionBtn} accessibilityLabel="Good response">
        <Ionicons name={vote === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={CG_ICON} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setVote((v) => (v === -1 ? 0 : -1))} hitSlop={HS} style={cg.actionBtn} accessibilityLabel="Bad response">
        <Ionicons name={vote === -1 ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={CG_ICON} />
      </TouchableOpacity>
    </View>
  );
}

export default function MaxChatScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const chatHistoryQuery = useChatHistoryQuery(activeConversationId);
    const [messages, setMessages] = useState<Message[]>([]);
    /** Keys on the active conversation so switching threads forces a re-seed
     *  from the query data (prevents stale messages from the previous thread). */
    const [seededForConversation, setSeededForConversation] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    // Lets the Stop button cancel an in-flight reply. A fresh controller is
    // created per send; tapping Stop aborts it (axios throws a cancel error,
    // which the catch treats as a clean stop, not a failure).
    const abortRef = useRef<AbortController | null>(null);
    const [serverChoices, setServerChoices] = useState<string[]>([]);
    /** When true, the chip row renders multi-select w/ a Submit button. */
    const [multiChoice, setMultiChoice] = useState<boolean>(false);
    /** Active picks during a multi-select round. */
    const [multiPicked, setMultiPicked] = useState<Set<string>>(new Set());
    // Optional structured input widget (slider) returned by the backend for
    // numeric questions. Mutually-exclusive UI: when this is non-null we
    // render <ChatSliderInput /> in place of the quick-reply chip row.
    const [inputWidget, setInputWidget] = useState<SliderSpec | HabitPickerSpec | null>(null);
    const [applyingHabits, setApplyingHabits] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    /** When the user swipes right on a bubble, we show a quote bar above
     *  the input and send the next message with reply_to_message_id set. */
    const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
    const flatListRef = useRef<FlashListRef<Message>>(null);
    const inputRef = useRef<TextInput>(null);
    /** Voice dictation (Web Speech API on web; keyboard-dictation fallback on native). */
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const initScheduleHandled = useRef(false);
    const initQuestionHandled = useRef<string | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    /** Prevents auto "start schedule" running before history fetch finishes (otherwise setMessages(history) wipes the optimistic user line). */
    const [historyReady, setHistoryReady] = useState(false);

    useEffect(() => {
        if (!chatHistoryQuery.isSuccess) return;
        const data = chatHistoryQuery.data;
        // data shape was Message[] pre-multi-chat; now {messages, conversationId, pendingQuestion}.
        const msgs: Message[] = Array.isArray(data) ? data : data?.messages ?? [];
        const resolvedId: string | null =
            Array.isArray(data) ? null : data?.conversationId ?? null;
        const pendingQ = Array.isArray(data) ? null : (data?.pendingQuestion ?? null);

        // Seed once per conversation. Avoids wiping in-flight optimistic turns
        // when React Query refetches without a thread change.
        const keyFor = activeConversationId ?? resolvedId ?? '__default__';
        if (seededForConversation === keyFor) return;

        setMessages(msgs);
        setSeededForConversation(keyFor);
        setHistoryReady(true);
        if (!activeConversationId && resolvedId) {
            setActiveConversationId(resolvedId);
        }

        // Re-render the chip / slider widget for any in-flight onboarding
        // question. Without this, the question text stays in the transcript
        // but the answer-chooser disappears on reload, leaving the user no
        // way to tap an option without re-typing.
        if (pendingQ) {
            if (Array.isArray(pendingQ.choices) && pendingQ.choices.length > 0) {
                setServerChoices(pendingQ.choices);
            }
            if (pendingQ.input_widget && pendingQ.input_widget.type === 'slider') {
                setInputWidget(pendingQ.input_widget as SliderSpec);
            }
        }
    }, [chatHistoryQuery.isSuccess, chatHistoryQuery.data, activeConversationId, seededForConversation]);

    useEffect(() => {
        if (chatHistoryQuery.isError) {
            setHistoryReady(true);
        }
    }, [chatHistoryQuery.isError]);

    useEffect(() => {
        const initSchedule = route.params?.initSchedule;
        if (!initSchedule || !historyReady) return;
        if (initScheduleHandled.current === initSchedule) return;
        if (loading) return;
        // `setup` = arriving straight from onboarding for the forced "tailor
        // your #1 max" walkthrough. Same start_schedule intent, but the opener
        // asks Max to run the personalization questions the starter is missing.
        const setup = route.params?.setup === true;
        // Clear the route params so a back-navigate-and-return doesn't
        // re-fire (the in-mount ref doesn't survive remount, so the same param
        // triggers a duplicate user message + schedule-start request server-side).
        try {
            navigation.setParams({ initSchedule: undefined, setup: undefined });
        } catch { /* nav not ready */ }
        initScheduleHandled.current = initSchedule;
        const maxxLabel = initSchedule.charAt(0).toUpperCase() + initSchedule.slice(1).replace('max', 'Max');
        // NOTE: keep an action verb ("set up" / "start") + the max name in the
        // opener — services.onboarding_questioner.detect_max_start_intent gates
        // the personalization-question flow on exactly that.
        // forceNewConversation: a max's onboarding ALWAYS starts its own thread.
        // Without this, launching (say) heightmax while the screen still holds
        // the fitmax conversation id would route heightmax's intake into the
        // fitmax thread — the "max bleed" bug.
        sendMessageWithContext(
            setup
                ? `Let's set up my ${maxxLabel}. Ask me what you need to tailor it to me.`
                : `I want to start my ${maxxLabel} schedule.`,
            initSchedule,
            'start_schedule',
            true,
        );
    }, [route.params?.initSchedule, loading, historyReady]);

    useEffect(() => {
        const initQuestion = route.params?.initQuestion as string | undefined;
        if (!initQuestion || !historyReady) return;
        if (initQuestionHandled.current === initQuestion) return;
        if (loading) return;
        initQuestionHandled.current = initQuestion;
        sendMessageWithContext(initQuestion);
    }, [route.params?.initQuestion, loading, historyReady]);

    const sendMessageWithContext = async (msg: string, initContext?: string, chatIntent?: string, forceNewConversation?: boolean) => {
        if (!msg.trim() || loading) return;
        setLoading(true);
        setServerChoices([]);
        setInputWidget(null);
        // Starting a new max's onboarding opens a fresh thread: drop the active
        // conversation id (so the request carries none and the backend creates a
        // dedicated thread) and clear the visible transcript so the new max's
        // intake doesn't render under the previous max's messages.
        if (forceNewConversation) {
            setActiveConversationId(null);
            setSeededForConversation(null);
            setMessages([]);
        }
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: msg },
            { role: 'assistant', content: '', isTyping: true, typingMode: pickTypingMode(msg, initContext, chatIntent) },
        ]);
        // Capture-then-clear the reply target before the request fires so a
        // subsequent send while this is in flight starts fresh.
        const replyId = replyTarget?.id ?? undefined;
        if (replyTarget) setReplyTarget(null);
        // Persist the in-flight message BEFORE the request fires. Previously the
        // pending blob was only written in the catch on a network error, so a
        // force-kill / OS-suspend that happened WHILE the request was in flight
        // (no catch ever runs) lost the message entirely. Writing it up front
        // means the foreground retry below picks it up after any interruption.
        // It's cleared the instant a response arrives; the only downside is that
        // a kill in the tiny window after the server commits but before the
        // clear could re-send (a duplicate user turn — far better than a lost one).
        await AsyncStorage.setItem(
            PENDING_CHAT_KEY,
            JSON.stringify({ msg, initContext, chatIntent }),
        ).catch(() => undefined);
        try {
            abortRef.current = new AbortController();
            const { response, choices, multi_choice, input_widget, conversation_id } = await api.sendChatMessage(
                msg,
                undefined,
                undefined,
                initContext,
                chatIntent,
                forceNewConversation ? undefined : (activeConversationId ?? undefined),
                replyId,
                abortRef.current.signal,
            );
            // Committed server-side — drop the pending blob so it isn't re-sent.
            await AsyncStorage.removeItem(PENDING_CHAT_KEY).catch(() => undefined);
            // Adopt the server-assigned conversation on first message so the
            // mobile client stays aligned with backend routing (no second call).
            // CRITICAL: also bump seededForConversation in lockstep so the seed
            // effect doesn't re-run when the React Query key flips and clobber
            // the optimistic user turn we just appended. (Bonemax / Hairmax
            // start-schedule taps were losing their "i want to start X" line
            // because of this race.)
            if (conversation_id && conversation_id !== activeConversationId) {
                setActiveConversationId(conversation_id);
                setSeededForConversation(conversation_id);
            }
            // If a new habit_picker arrives while one is already visible, dismiss the old one first
            // to prevent two pickers from appearing in a row in the chat history.
            if (input_widget?.type === 'habit_picker' && inputWidget?.type === 'habit_picker') {
                setInputWidget(null);
            }
            setMessages(prev => [
                ...prev.filter((m) => !m.isTyping),
                { role: 'assistant', content: response, justArrived: true },
            ]);
            setServerChoices(Array.isArray(choices) ? choices : []);
            setMultiChoice(!!multi_choice);
            setMultiPicked(new Set());
            setInputWidget(isRenderableWidget(input_widget) ? (input_widget as SliderSpec | HabitPickerSpec) : null);
            // Invalidate the conversations list so the sidebar reorders + renames.
            queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
            // Schedule + maxes can change as a side effect of any chat turn
            // (start a maxx, complete onboarding, schedule regenerated, etc).
            // refetchType:'all' forces *inactive* observers to refetch too,
            // so when the user navigates to Master Schedule or Home next,
            // they see the updated state immediately instead of the stale
            // cached version. invalidate alone (active only) was the cause
            // of the "made a schedule but home/master didn't update" lag.
            queryClient.invalidateQueries({
                queryKey: queryKeys.schedulesActiveFull,
                refetchType: 'all',
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.activeSchedulesSummary,
                refetchType: 'all',
            });
            queryClient.invalidateQueries({
                queryKey: queryKeys.maxes,
                refetchType: 'all',
            });
        } catch (e: any) {
            if (isAbortError(e)) {
                // User tapped Stop: drop the typing bubble and clear the queued
                // message so the foreground retry doesn't resend it.
                setMessages(prev => prev.filter((m) => !m.isTyping));
                await AsyncStorage.removeItem(PENDING_CHAT_KEY).catch(() => undefined);
                return;
            }
            console.error('sendMessageWithContext error:', e?.response?.data || e?.message || e);
            const serverMsg = e?.response?.data?.response || e?.response?.data?.detail;
            // HTTP error => the server received and rejected this turn; clear the
            // pre-persisted pending blob so it doesn't auto-retry a request that
            // will just fail again (matches the prior "don't retry HTTP errors"
            // behaviour). Network error / no response => LEAVE it queued so the
            // foreground retry (trySendPending) resends when connectivity is back.
            if (e?.response) {
                await AsyncStorage.removeItem(PENDING_CHAT_KEY).catch(() => undefined);
            }
            setMessages(prev => [
                ...prev.filter((m) => !m.isTyping),
                { role: 'assistant', content: serverMsg || 'Something went wrong. Try sending that again in a sec.' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Always retry with the LATEST sendMessageWithContext (via a ref) so a
    // recovered message targets the current conversation, not the null id
    // captured at mount.
    const sendMessageRef = useRef(sendMessageWithContext);
    sendMessageRef.current = sendMessageWithContext;
    const retryingRef = useRef(false);

    // Retry any message that was queued while offline / interrupted mid-send.
    useEffect(() => {
        const trySendPending = async () => {
            if (retryingRef.current) return; // don't stack concurrent retries
            const raw = await AsyncStorage.getItem(PENDING_CHAT_KEY).catch(() => null);
            if (!raw) return;
            let queued: { msg: string; initContext?: string; chatIntent?: string } | null = null;
            try { queued = JSON.parse(raw); } catch { return; }
            if (!queued?.msg) return;
            // IMPORTANT: do NOT remove the blob here. sendMessageWithContext
            // re-persists it before its request and clears it only on success
            // (or HTTP rejection). If the send bails because another send is in
            // flight, or fails again, the message stays queued for the next
            // retry instead of being deleted-then-dropped (the old bug).
            retryingRef.current = true;
            try {
                await sendMessageRef.current(queued.msg, queued.initContext, queued.chatIntent);
            } finally {
                retryingRef.current = false;
            }
        };
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            const prev = appStateRef.current;
            appStateRef.current = next;
            if (prev.match(/inactive|background/) && next === 'active') {
                void trySendPending();
            }
        });
        // Also check on mount (cold start)
        void trySendPending();
        return () => sub.remove();
    }, []);

    const sendMessage = async (presetArg?: unknown) => {
        const fromPreset = typeof presetArg === 'string' ? presetArg.trim() : '';
        const fromInput = String(input ?? '').trim();
        const userContent = fromPreset || fromInput;
        if (!userContent || loading) return;
        setLoading(true);
        setServerChoices([]);
        setInputWidget(null);
        if (!fromPreset) setInput('');
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userContent },
            { role: 'assistant', content: '', isTyping: true, typingMode: 'default' },
        ]);
        const replyId = replyTarget?.id ?? undefined;
        if (replyTarget) setReplyTarget(null);
        try {
            abortRef.current = new AbortController();
            const { response, choices, multi_choice, input_widget, conversation_id } = await api.sendChatMessage(
                userContent,
                undefined,
                undefined,
                undefined,
                undefined,
                activeConversationId ?? undefined,
                replyId,
                abortRef.current.signal,
            );
            // Adopt server-assigned conversation in lockstep so a refetch
            // doesn't clobber the optimistic turns (same race that hit
            // sendMessageWithContext for the start-schedule path).
            if (conversation_id && conversation_id !== activeConversationId) {
                setActiveConversationId(conversation_id);
                setSeededForConversation(conversation_id);
            }
            setMessages(prev => [
                ...prev.filter((m) => !m.isTyping),
                { role: 'assistant', content: response, justArrived: true },
            ]);
            setServerChoices(Array.isArray(choices) ? choices : []);
            setMultiChoice(!!multi_choice);
            setMultiPicked(new Set());
            setInputWidget(isRenderableWidget(input_widget) ? (input_widget as SliderSpec | HabitPickerSpec) : null);
            // Update the cache for the ACTIVE conversation, not the legacy
            // single-thread key. Without this, tapping a chip wrote to
            // queryKeys.chatHistory while the screen was reading from
            // queryKeys.chatHistoryByConv(activeConversationId), so any
            // refetch dropped the chip-driven turn.
            const activeKey = (conversation_id ?? activeConversationId)
                ? queryKeys.chatHistoryByConv((conversation_id ?? activeConversationId) as string)
                : queryKeys.chatHistory;
            queryClient.setQueryData<{ messages: Message[]; conversationId: string | null }>(activeKey as any, (prev) => {
                const prevMsgs = prev?.messages ?? [];
                return {
                    messages: [
                        ...prevMsgs,
                        { role: 'user', content: userContent } as Message,
                        { role: 'assistant', content: response, justArrived: true } as Message,
                    ],
                    conversationId: (conversation_id ?? activeConversationId) ?? null,
                };
            });
            queryClient.invalidateQueries({
                predicate: (q) => {
                    const k = q.queryKey;
                    return k === queryKeys.schedulesActiveFull
                        || k === queryKeys.activeSchedulesSummary
                        || k === queryKeys.maxes;
                },
            });
        } catch (e: any) {
            if (isAbortError(e)) {
                setMessages(prev => prev.filter((m) => !m.isTyping));
                return;
            }
            console.error(e);
            const serverMsg = e?.response?.data?.response || e?.response?.data?.detail;
            if (!e?.response) {
                await AsyncStorage.setItem(PENDING_CHAT_KEY, JSON.stringify({ msg: userContent })).catch(() => undefined);
            }
            setMessages(prev => [
                ...prev.filter((m) => !m.isTyping),
                { role: 'assistant', content: serverMsg || 'Something went wrong. Try sending that again in a sec.' },
            ]);
        }
        finally { setLoading(false); }
    };

    const quickReplies = serverChoices
        .map((c) => (typeof c === 'string' ? c.trim() : String(c ?? '').trim()))
        .filter((c) => c.length > 0);

    const openUrl = useCallback((url: string) => {
        Linking.openURL(url).catch(() => undefined);
    }, []);

    const extractProductLinks = useCallback((text: string): { label: string; url: string }[] => {
        const links: { label: string; url: string }[] = [];
        const oldFormat = /^-\s*(.+?):\s*(https?:\/\/\S+)/gm;
        let m: RegExpExecArray | null;
        while ((m = oldFormat.exec(text)) !== null) {
            links.push({ label: m[1].trim(), url: m[2].trim() });
        }
        const mdFormat = /\[([^\]]+)\]\((https?:\/\/www\.amazon\.com\/s\?[^\s)]+)\)/g;
        while ((m = mdFormat.exec(text)) !== null) {
            if (!links.some(l => l.url === m![2])) {
                links.push({ label: m[1].trim(), url: m[2].trim() });
            }
        }
        return links;
    }, []);

    const stripProductLinkLines = useCallback((text: string): string => {
        return text.replace(/^-\s*.+?:\s*https?:\/\/\S+\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    }, []);

    const renderLinkedText = useCallback((text: string, baseStyle: any) => {
        // Delegate to the shared markdown renderer so **bold**, ### headings,
        // bullets, and links all get proper React Native styling instead of
        // showing raw asterisks / hashes in the bubble.
        return renderRichText(text, { baseStyle, onLinkPress: openUrl });
    }, [openUrl]);

    const newChat = () => {
        setActiveConversationId(null);
        setSeededForConversation(null);
        setMessages([]);
        setServerChoices([]);
        setInputWidget(null);
        setReplyTarget(null);
        queryClient.invalidateQueries({
            predicate: (q) => q.queryKey[0] === 'chat' && q.queryKey[1] === 'history',
        });
    };

    // ── Habit picker submit: persist want/avoid for this max + re-expand it ──
    const applyHabitPrefs = async (spec: HabitPickerSpec, wanted: string[], avoided: string[]) => {
        if (applyingHabits) return;
        // Nothing picked → just dismiss without a server round-trip.
        if (wanted.length === 0 && avoided.length === 0) {
            setInputWidget(null);
            return;
        }
        if (!spec.schedule_id) {
            setInputWidget(null);
            return;
        }
        setApplyingHabits(true);
        try {
            await api.updateHabitPrefs(spec.schedule_id, wanted, avoided);
            setInputWidget(null);
            const parts: string[] = [];
            if (wanted.length) parts.push(`added ${wanted.length}`);
            if (avoided.length) parts.push(`skipping ${avoided.length}`);
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: `Updated your plan — ${parts.join(', ')}. Check the Schedule tab to see it.` },
            ]);
            // The plan changed — refresh the schedule-driven views.
            queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: queryKeys.activeSchedulesSummary, refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
        } catch (e: any) {
            setInputWidget(null);
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: "Couldn't update those habits just now — you can tweak any task from the Schedule tab." },
            ]);
        } finally {
            setApplyingHabits(false);
        }
    };

    // ── "+" button: pick a photo and send it to Max ──────────────────────
    // Uploads to the chat-file endpoint, then sends a chat turn with the
    // attachment. Optimistic bubble renders the local image immediately.
    const sendImageMessage = async (uri: string, caption: string) => {
        if (loading) return;
        setLoading(true);
        setServerChoices([]);
        setInputWidget(null);
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: caption, localImageUri: uri, attachment_type: 'image' },
            { role: 'assistant', content: '', isTyping: true, typingMode: 'analysis' },
        ]);
        const replyId = replyTarget?.id ?? undefined;
        if (replyTarget) setReplyTarget(null);
        try {
            const formData = new FormData();
            if (Platform.OS === 'web') {
                const blob = await fetch(uri).then((r) => r.blob());
                formData.append('file', blob, 'upload.jpg');
            } else {
                const filename = uri.split('/').pop() || 'upload.jpg';
                const match = /\.(\w+)$/.exec(filename);
                formData.append('file', { uri, name: filename, type: match ? `image/${match[1]}` : 'image' } as any);
            }
            const uploadRes = await api.uploadChatFile(formData);
            abortRef.current = new AbortController();
            const { response, choices, multi_choice, input_widget, conversation_id } = await api.sendChatMessage(
                caption || 'What do you think of this?',
                uploadRes.url,
                'image',
                undefined,
                undefined,
                activeConversationId ?? undefined,
                replyId,
                abortRef.current.signal,
            );
            if (conversation_id && conversation_id !== activeConversationId) {
                setActiveConversationId(conversation_id);
                setSeededForConversation(conversation_id);
            }
            setMessages((prev) => [
                ...prev.filter((m) => !m.isTyping),
                { role: 'assistant', content: response, justArrived: true },
            ]);
            setServerChoices(Array.isArray(choices) ? choices : []);
            setMultiChoice(!!multi_choice);
            setMultiPicked(new Set());
            setInputWidget(isRenderableWidget(input_widget) ? (input_widget as SliderSpec | HabitPickerSpec) : null);
            queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
        } catch (e: any) {
            if (isAbortError(e)) {
                setMessages((prev) => prev.filter((m) => !m.isTyping));
                return;
            }
            console.error('sendImageMessage error:', e?.response?.data || e?.message || e);
            setMessages((prev) => [
                ...prev.filter((m) => !m.isTyping),
                { role: 'assistant', content: 'Could not send that image. Try again in a sec.' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const pickAndSendImage = async () => {
        if (loading) return;
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.[0]?.uri) return;
            const caption = input.trim();
            setInput('');
            await sendImageMessage(result.assets[0].uri, caption);
        } catch (e) {
            console.error('pickAndSendImage error:', e);
        }
    };

    // ── Mic button: voice dictation ──────────────────────────────────────
    // Web: Web Speech API streams transcript into the input. Native: no STT
    // module is bundled, so focus the field — the keyboard's own mic key is
    // then one tap away.
    const toggleVoice = () => {
        if (Platform.OS !== 'web') {
            inputRef.current?.focus();
            return;
        }
        const w = globalThis as any;
        const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!SR) {
            inputRef.current?.focus();
            return;
        }
        if (listening) {
            try { recognitionRef.current?.stop?.(); } catch { /* noop */ }
            setListening(false);
            return;
        }
        try {
            const rec = new SR();
            rec.lang = 'en-US';
            rec.interimResults = true;
            rec.continuous = false;
            rec.onresult = (e: any) => {
                let t = '';
                for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
                setInput(t);
            };
            rec.onend = () => setListening(false);
            rec.onerror = () => setListening(false);
            recognitionRef.current = rec;
            setListening(true);
            rec.start();
        } catch {
            setListening(false);
            inputRef.current?.focus();
        }
    };

    // The single circular-button action: STOP if a reply is generating, else
    // send if there's text, else dictate.
    const onActionPress = () => {
        if (loading) {
            // Cancel the in-flight reply. The send path's catch sees the abort,
            // drops the typing bubble, and the finally clears loading.
            abortRef.current?.abort();
            abortRef.current = null;
            return;
        }
        if (input.trim()) { void sendMessage(); return; }
        toggleVoice();
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        if (item.isTyping) {
            return (
                <View style={cg.assistantRow}>
                    <ThinkingShimmer />
                </View>
            );
        }
        const hasImage = item.attachment_type === 'image' && (item.localImageUri || item.attachment_url);
        if (!item.content?.trim() && !hasImage) return null;

        const isAssistant = item.role === 'assistant';
        const productLinks = isAssistant && item.content ? extractProductLinks(item.content) : [];
        const displayText = productLinks.length > 0 ? stripProductLinkLines(item.content!) : item.content;
        const canReply = !!item.id; // optimistic turns have no real id yet
        const isLast = index === messages.length - 1;

        const commitReply = () => {
            setReplyTarget({ id: item.id!, role: item.role, preview: (item.content || '').slice(0, 120) });
        };

        const replyQuote = item.reply_to ? (
            <View style={cg.replyQuote}>
                <Text style={cg.replyQuoteRole}>{item.reply_to.role === 'user' ? 'You' : 'Max'}</Text>
                <Text style={cg.replyQuoteText} numberOfLines={2}>{item.reply_to.preview}</Text>
            </View>
        ) : null;

        const image = hasImage ? (
            <CachedImage
                uri={item.localImageUri ?? api.resolveAttachmentUrl(item.attachment_url)}
                style={styles.attachmentImage}
                contentFit="contain"
            />
        ) : null;

        if (isAssistant) {
            // Assistant: plain, full-width text (no bubble) — the ChatGPT pattern.
            const animate = !!item.justArrived && isLast && !loading;
            const content = (
                <View style={cg.assistantRow}>
                    {replyQuote}
                    {displayText ? (
                        <StreamingText
                            text={displayText}
                            animate={animate}
                            plainStyle={cg.assistantText}
                            renderRich={(t) => renderLinkedText(t, [cg.assistantText])}
                        />
                    ) : null}
                    {productLinks.length > 0 && (
                        <View style={styles.productLinksContainer}>
                            {productLinks.map((link, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.productLinkButton}
                                    onPress={() => openUrl(link.url)}
                                    activeOpacity={0.7}
                                    accessibilityRole="link"
                                    accessibilityLabel={`Open ${link.label}`}
                                >
                                    <Ionicons name="cart-outline" size={14} color={colors.foreground} style={{ marginRight: 6 }} />
                                    <Text style={styles.productLinkText} numberOfLines={1}>{link.label}</Text>
                                    <Ionicons name="open-outline" size={12} color={colors.textMuted} style={{ marginLeft: 6 }} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    {image}
                    {!animate && displayText ? <AssistantActions text={displayText} /> : null}
                </View>
            );
            if (!canReply) return content;
            return <ReplySwipeableRow onCommit={commitReply}>{content}</ReplySwipeableRow>;
        }

        // User: light-gray rounded bubble, right-aligned.
        const userBlock = (
            <View style={cg.userRow}>
                <View style={cg.userBubble}>
                    {replyQuote}
                    {displayText ? <Text style={cg.userText}>{displayText}</Text> : null}
                    {image}
                </View>
            </View>
        );
        if (!canReply) return userBlock;
        return <ReplySwipeableRow onCommit={commitReply}>{userBlock}</ReplySwipeableRow>;
    };

    const ListEmpty = () => (
        <View style={cg.empty}>
            <Text style={cg.emptyTitle}>What can I help with?</Text>
            <View style={cg.emptyChips}>
                {EMPTY_STARTERS.map((s) => (
                    <TouchableOpacity
                        key={s}
                        style={cg.emptyChip}
                        activeOpacity={0.7}
                        onPress={() => void sendMessage(s)}
                        accessibilityRole="button"
                        accessibilityLabel={s}
                    >
                        <Text style={cg.emptyChipText}>{s}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* keyboardVerticalOffset = 0 because the screen IS the root
                view (custom header lives INSIDE the KAV, not a navigator
                header above it). The previous hardcoded 90 was an
                over-correction that left a weird ~90pt gap above the
                keyboard on tall iPhones. */}
            <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
                <View style={[cg.header, { paddingTop: Math.max(insets.top + 6, 44) }]}>
                    <TouchableOpacity
                        style={cg.headerBtn}
                        onPress={() => setDrawerOpen(true)}
                        accessibilityLabel="Open chat list"
                        hitSlop={HS}
                    >
                        <Ionicons name="menu" size={22} color={CG_INK} />
                    </TouchableOpacity>
                    <Text style={cg.headerTitle}>Max</Text>
                    <TouchableOpacity
                        style={cg.headerBtn}
                        onPress={newChat}
                        accessibilityLabel="New chat"
                        hitSlop={HS}
                    >
                        <Ionicons name="create-outline" size={22} color={CG_INK} />
                    </TouchableOpacity>
                </View>

                <ChatConversationsDrawer
                    visible={drawerOpen}
                    activeConversationId={activeConversationId}
                    onClose={() => setDrawerOpen(false)}
                    onSelect={(id) => {
                        // Empty id means the active conversation was deleted — clear
                        // state and let useChatHistoryQuery route to the newest thread
                        // (or show empty state on first-ever use).
                        setActiveConversationId(id || null);
                        setSeededForConversation(null);
                        setMessages([]);
                        setServerChoices([]);
                        setInputWidget(null);
                        queryClient.invalidateQueries({
                            predicate: (q) =>
                                q.queryKey[0] === 'chat' && q.queryKey[1] === 'history',
                        });
                    }}
                    onCreated={(id) => {
                        setActiveConversationId(id);
                        setSeededForConversation(null);
                        setMessages([]);
                        setServerChoices([]);
                        setInputWidget(null);
                    }}
                />

                {!historyReady && chatHistoryQuery.isPending ? (
                    <View style={styles.historyLoading}>
                        <ActivityIndicator size="large" color={colors.foreground} />
                    </View>
                ) : (
                    <FlashList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(item, i) =>
                            item.isTyping ? `typing-${item.typingMode ?? 'default'}` : i.toString()
                        }
                        contentContainerStyle={[styles.messageList, messages.length === 0 && styles.messageListEmpty]}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={ListEmpty}
                    />
                )}

                <View style={[styles.outerInputContainer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
                    {/* Numeric question → slider widget. Mutually exclusive with
                        the quick-reply chip row below: when the backend asks
                        for a number it sends `input_widget`, not `choices`. */}
                    {!loading && inputWidget && inputWidget.type === 'slider' && (
                        <View style={styles.quickReplyStack}>
                            <ChatSliderInput
                                spec={inputWidget}
                                onSubmit={(v) => sendMessage(String(v))}
                            />
                        </View>
                    )}
                    {/* Per-max habit picker → shown right after a schedule is built. */}
                    {!loading && inputWidget && inputWidget.type === 'habit_picker' && (
                        <View style={styles.quickReplyStack}>
                            <ChatHabitPicker
                                spec={inputWidget}
                                disabled={applyingHabits}
                                onSubmit={(wanted, avoided) => applyHabitPrefs(inputWidget, wanted, avoided)}
                                onSkip={() => setInputWidget(null)}
                            />
                        </View>
                    )}
                    {!loading && !inputWidget && quickReplies.length > 0 && !multiChoice && (
                        <View style={styles.quickReplyStack}>
                            {quickReplies.map((choice) => (
                                <TouchableOpacity
                                    key={choice}
                                    style={styles.quickReplyButton}
                                    onPress={() => sendMessage(choice)}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={styles.quickReplyText}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {choice}
                                    </Text>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={14}
                                        color={colors.textMuted}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    {!loading && !inputWidget && quickReplies.length > 0 && multiChoice && (
                        <View style={styles.quickReplyStack}>
                            {quickReplies.map((choice) => {
                                const on = multiPicked.has(choice);
                                return (
                                    <TouchableOpacity
                                        key={choice}
                                        style={[styles.quickReplyButton, on && styles.quickReplyButtonOn]}
                                        onPress={() => {
                                            // Toggle the pick. The Submit button below
                                            // sends the joined comma-list so the backend
                                            // sees one user message containing all picks.
                                            setMultiPicked((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(choice)) next.delete(choice);
                                                else next.add(choice);
                                                return next;
                                            });
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons
                                            name={on ? 'checkmark-circle' : 'ellipse-outline'}
                                            size={16}
                                            color={on ? colors.foreground : colors.textMuted}
                                            style={{ marginRight: 4 }}
                                        />
                                        <Text
                                            style={[styles.quickReplyText, on && styles.quickReplyTextOn]}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                        >
                                            {choice}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                            <TouchableOpacity
                                style={[
                                    styles.multiSubmitBtn,
                                    multiPicked.size === 0 && styles.multiSubmitBtnDisabled,
                                ]}
                                onPress={() => {
                                    if (multiPicked.size === 0) return;
                                    const picks = quickReplies.filter((c) => multiPicked.has(c));
                                    sendMessage(picks.join(', '));
                                }}
                                disabled={multiPicked.size === 0}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.multiSubmitText}>
                                    {multiPicked.size === 0
                                        ? 'pick any that apply'
                                        : `submit ${multiPicked.size} ${multiPicked.size === 1 ? 'pick' : 'picks'}`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {replyTarget ? (
                        <View style={styles.replyPreviewBar}>
                            <View style={styles.replyPreviewAccent} />
                            <View style={styles.replyPreviewBody}>
                                <Text style={styles.replyPreviewRole}>
                                    Replying to {replyTarget.role === 'user' ? 'yourself' : 'Max'}
                                </Text>
                                <Text style={styles.replyPreviewText} numberOfLines={1}>
                                    {replyTarget.preview}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setReplyTarget(null)}
                                style={styles.replyPreviewClose}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="close" size={16} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    ) : null}
                    <View style={cg.inputPill}>
                        <TouchableOpacity style={cg.plusBtn} hitSlop={HS} accessibilityLabel="Attach photo" onPress={() => void pickAndSendImage()} disabled={loading}>
                            <Ionicons name="add" size={24} color={CG_ICON} />
                        </TouchableOpacity>
                        <TextInput
                            ref={inputRef}
                            style={cg.input}
                            placeholder={replyTarget ? 'Reply…' : 'Ask Max anything'}
                            placeholderTextColor={CG_MUTE}
                            value={input}
                            onChangeText={setInput}
                            multiline
                            textAlignVertical="center"
                            // Stay editable while a reply is generating so the user can
                            // compose their next message; sendMessage() still guards on
                            // `loading` so the second turn won't fire until this one lands.
                            editable
                            onSubmitEditing={() => void sendMessage()}
                        />
                        <MorphSend loading={loading} hasText={!!input.trim()} listening={listening} onPress={onActionPress} />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: CG_BG },
    keyboardView: { flex: 1 },
    historyLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xxl },
    header: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
        backgroundColor: colors.card,
        position: 'relative',
    },
    headerMenuButton: {
        // Anchor to the bottom of the header so the button sits next to the
        // subtitle row — well below the notch and within thumb reach on
        // iPhone. Previous `top: 10` placed it up near the safe-area inset
        // where it was unreachable one-handed.
        position: 'absolute',
        bottom: spacing.lg,
        right: spacing.md,
        zIndex: 2,
        padding: 8,
    },
    headerEyebrow: {
        ...typography.label,
        fontSize: 10,
        color: colors.textMuted,
        marginBottom: 4,
        letterSpacing: 1,
    },
    title: { fontFamily: fonts.serif, fontSize: 28, fontWeight: '400', color: colors.foreground, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
    messageList: { padding: spacing.lg, paddingBottom: spacing.xl },
    messageListEmpty: { flexGrow: 1 },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: spacing.md,
        paddingHorizontal: 4,
        gap: 6,
    },
    userMessageRow: { justifyContent: 'flex-end' },
    bubbleReplyButton: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.45,
        marginBottom: 6,
    },
    bubble: {
        maxWidth: '82%',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    userBubble: {
        backgroundColor: colors.foreground,
        borderBottomRightRadius: borderRadius.sm,
        borderColor: colors.foreground,
    },
    assistantBubble: {
        backgroundColor: colors.card,
        borderBottomLeftRadius: borderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    messageText: { fontSize: 15, lineHeight: 23, color: colors.foreground, letterSpacing: 0.05 },
    userMessageText: { color: colors.buttonText },
    linkText: { color: '#60A5FA', textDecorationLine: 'underline' },
    productLinksContainer: { marginTop: 10, gap: 6 },
    productLinkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        borderRadius: borderRadius.md,
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    productLinkText: {
        flex: 1,
        fontSize: 13.5,
        fontWeight: '600',
        color: colors.foreground,
        letterSpacing: 0.05,
    },
    typingBubble: { paddingVertical: 10, paddingHorizontal: 16 },
    typingText: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },
    attachmentImage: { width: 220, height: 160, borderRadius: 12, marginTop: spacing.sm },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
    // Decorative backdrop layer (behind the text). Centered rings + a wash.
    emptyDecor: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    emptyRingOuter: {
        position: 'absolute',
        width: 340,
        height: 340,
        borderRadius: 170,
        borderWidth: 1,
        borderColor: 'rgba(28,26,23,0.05)',
    },
    emptyRingInner: {
        position: 'absolute',
        width: 228,
        height: 228,
        borderRadius: 114,
        borderWidth: 1,
        borderColor: 'rgba(28,26,23,0.07)',
    },
    emptyTitle: {
        fontFamily: fonts.serif,
        fontSize: 32,
        fontWeight: '400',
        letterSpacing: -0.8,
        color: colors.foreground,
        marginBottom: 10,
    },
    emptySubtitle: {
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        letterSpacing: 0.1,
    },
    // Tappable starter prompts — an editorial hairline-ruled list, not pills.
    starterGroup: { marginTop: 40, width: '100%', maxWidth: 340, alignSelf: 'center' },
    starterEyebrow: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10.5,
        letterSpacing: 1.8,
        color: colors.textMuted,
        textAlign: 'center',
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    starterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 4,
        gap: 12,
    },
    starterRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
    starterText: { flex: 1, fontFamily: fonts.serif, fontSize: 17, color: colors.foreground, letterSpacing: -0.2 },
    outerInputContainer: {
        paddingHorizontal: 12,
        paddingTop: 6,
        backgroundColor: CG_BG,
    },
    quickReplyStack: {
        // Vertical stack — each option on its own row. Reads cleaner than
        // wrapped pills, especially for longer answer text. Modern iOS
        // settings-list aesthetic: hairline-bordered card, chevron on
        // the right, generous tap target.
        flexDirection: 'column',
        gap: 8,
        marginBottom: 10,
        paddingHorizontal: 2,
    },
    quickReplyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        borderRadius: borderRadius.lg,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#0A0A0B', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }
            : null),
    },
    quickReplyText: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '500',
        letterSpacing: 0.05,
    },
    /* Multi-select active state — slight foreground tint, ink text. */
    quickReplyButtonOn: {
        backgroundColor: colors.surfaceLight ?? colors.surface,
        borderColor: colors.foreground,
    },
    quickReplyTextOn: {
        color: colors.foreground,
        fontWeight: '600',
    },
    /* Submit button below multi-select chips. */
    multiSubmitBtn: {
        marginTop: 4,
        paddingVertical: 11,
        borderRadius: borderRadius.full,
        backgroundColor: colors.foreground,
        alignItems: 'center',
        justifyContent: 'center',
    },
    multiSubmitBtnDisabled: {
        backgroundColor: colors.border,
    },
    multiSubmitText: {
        color: colors.buttonText,
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    // --- swipe-to-reply UI ---
    swipeWrap: {
        // Wrap the bubble + the absolute reply hint that fades in
        // underneath as the user drags right.
        position: 'relative',
    },
    swipeReplyHint: {
        position: 'absolute',
        left: 12,
        top: 0,
        bottom: 0,
        width: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    replyQuote: {
        borderLeftWidth: 2,
        borderLeftColor: colors.border,
        paddingLeft: 8,
        paddingVertical: 2,
        marginBottom: 6,
    },
    replyQuoteRole: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textMuted,
        marginBottom: 2,
    },
    replyQuoteText: {
        fontSize: 13,
        color: colors.textSecondary,
        opacity: 0.85,
    },
    replyPreviewBar: {
        // Visually obvious "you're replying to X" bar above the input.
        // Subtle accent tint + 4px left stripe so the bar reads as a
        // contextual quote, not a stray pill. iMessage / WhatsApp use
        // a similar treatment.
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceLight ?? colors.surface,
        borderRadius: borderRadius.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 8,
        borderLeftWidth: 4,
        borderLeftColor: colors.foreground,
    },
    replyPreviewAccent: {
        width: 0,
    },
    replyPreviewBody: {
        flex: 1,
        marginRight: 8,
    },
    replyPreviewRole: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.foreground,
        marginBottom: 2,
    },
    replyPreviewText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    replyPreviewClose: {
        padding: 4,
    },
    input: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 10, paddingHorizontal: 4, maxHeight: 100 },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        backgroundColor: colors.foreground,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
        borderWidth: 1,
        borderColor: colors.foreground,
    },
    disabledButton: { opacity: 0.35 },
});

// ─── ChatGPT-style visual layer ───────────────────────────────────────────────
const cg = StyleSheet.create({
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingBottom: 8, backgroundColor: CG_BG,
    },
    headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: CG_INK, letterSpacing: -0.2 },

    assistantRow: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8, marginBottom: 2 },
    assistantText: { fontSize: 16, lineHeight: 25, color: CG_INK, letterSpacing: 0 },
    caret: { color: CG_INK },

    userRow: { alignItems: 'flex-end', marginBottom: 10, paddingHorizontal: 4 },
    userBubble: { maxWidth: '84%', backgroundColor: CG_USER_BUBBLE, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11 },
    userText: { fontSize: 16, lineHeight: 23, color: CG_INK },

    thinking: { fontSize: 16, lineHeight: 25, color: CG_MUTE, fontWeight: '500' },

    actions: { flexDirection: 'row', gap: 4, marginTop: 10 },
    actionBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

    replyQuote: { borderLeftWidth: 2, borderLeftColor: '#D0D0D0', paddingLeft: 8, paddingVertical: 2, marginBottom: 6 },
    replyQuoteRole: { fontSize: 11, fontWeight: '700', color: CG_MUTE, marginBottom: 1 },
    replyQuoteText: { fontSize: 13, color: CG_MUTE },

    inputPill: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 26,
        paddingLeft: 6, paddingRight: 6, paddingVertical: 5, borderWidth: 1, borderColor: '#E5E5E5', minHeight: 50,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }
            : { elevation: 1 }),
    },
    plusBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    // The pill (alignItems:'center') vertically centers this field; a single
    // line of text/placeholder must therefore sit centered WITHIN the field.
    // lineHeight + symmetric padding + textAlignVertical:'center' keeps the
    // "Ask Max anything" placeholder on the pill's centerline across web,
    // iOS (multiline UITextView inset) and Android (includeFontPadding).
    input: {
        flex: 1,
        color: CG_INK,
        fontSize: 16,
        lineHeight: 20,
        paddingTop: Platform.OS === 'ios' ? 8 : 4,
        paddingBottom: Platform.OS === 'ios' ? 8 : 4,
        paddingHorizontal: 6,
        maxHeight: 120,
        textAlignVertical: 'center',
        ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    },
    sendCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: CG_INK, alignItems: 'center', justifyContent: 'center' },
    sendCircleLive: { backgroundColor: '#C0452C' },
    stopSquare: { width: 13, height: 13, borderRadius: 3, backgroundColor: '#fff' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: CG_BG },
    emptyTitle: { fontFamily: fonts.sansSemiBold, fontSize: 24, color: CG_INK, letterSpacing: -0.4, textAlign: 'center', marginBottom: 26 },
    emptyChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
    emptyChip: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#FFFFFF' },
    emptyChipText: { fontFamily: fonts.sansMedium, fontSize: 14, color: '#3D3D3D' },
});

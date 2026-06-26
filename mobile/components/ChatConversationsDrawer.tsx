/**
 * Chat sidebar — refined black aesthetic.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │ Max            ✕ │   ← Playfair serif title
 *   ├──────────────────────┤
 *   │ + New chat           │
 *   │ ─ Recent ─           │
 *   │ chat 1               │   ← scrolls (fills available space)
 *   │ chat 2               │
 *   │ ...                  │
 *   ├──────────────────────┤
 *   │ Coach                │   ← stacked at bottom, fixed
 *   │ (Goggins)(Clav)(Dad) │   ← floating 3D persona avatars
 *   │ Length               │
 *   │ • Concise            │
 *   │ • Medium             │
 *   │ • Detailed           │
 *   └──────────────────────┘
 *
 * Color palette is pure-black with quietly-tuned greys + 1 accent of off-
 * white for active chips. No saturated color anywhere. Hairline borders,
 * minimal padding, generous letter-spacing on labels.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { BlurView } from 'expo-blur';
import { Alert, InAppAlertHost } from './InAppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { queryKeys } from '../lib/queryClient';
import { useChatConversationsQuery } from '../hooks/useAppQueries';
import { useAuth } from '../context/AuthContext';
import { fonts, spacing } from '../theme/dark';

/* ── Refined black palette (drawer-local) ───────────────────────────── */
const C = {
    bg:          '#0A0A0B',
    // LIGHT frosted glass — subtle surfaces over a very translucent light
    // BlurView, with near-black ink text. Kept airy/see-through ("glassy").
    bgRaised:    'rgba(255,255,255,0.40)',
    bgActive:    'rgba(255,255,255,0.58)',
    border:      'rgba(0,0,0,0.08)',
    borderStrong:'rgba(0,0,0,0.13)',
    glassTint:   'rgba(255,255,255,0.22)',  // light wash, low so it stays glassy
    glassEdge:   'rgba(255,255,255,0.75)',
    ink:         '#17171A',         // primary text, near-black
    inkMuted:    'rgba(23,23,26,0.56)',
    inkDim:      'rgba(23,23,26,0.34)',
    accent:      '#17171A',         // active dot
    accentInk:   '#FFFFFF',
    danger:      '#C0452C',
};

type Conversation = {
    id: string;
    title: string;
    channel: string;
    is_archived: boolean;
    last_message_at: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type ChatConversationsDrawerProps = {
    visible: boolean;
    activeConversationId: string | null;
    onClose: () => void;
    onSelect: (conversationId: string) => void;
    onCreated: (conversationId: string) => void;
};

/* ── Coach personas ─────────────────────────────────────────────────────
   The three named coaches replace the old softcore/mediumcore/hardcore tone
   pills. Each rides on an existing backend `coaching_tone` slug so no schema
   change is needed; the persona voices themselves are filled in backend-side.
     Goggins    → hardcore   (hard motivation)
     Clavicular → influencer (looksmaxxing-coded)
     Big Daddy  → gentle     (supportive) */
type PersonaId = 'goggins' | 'clavicular' | 'bigdaddy';
type ToneBackend = 'gentle' | 'default' | 'hardcore' | 'influencer';

const PERSONA_OPTIONS: { id: PersonaId; backend: ToneBackend; label: string; img: any; glow: string }[] = [
    { id: 'goggins',    backend: 'hardcore',   label: 'Goggins',    img: require('../assets/personas/goggins.png'),    glow: '#EC7E5C' },
    { id: 'clavicular', backend: 'influencer', label: 'Clavicular', img: require('../assets/personas/clavicular.png'), glow: '#5B8DEF' },
    { id: 'bigdaddy',   backend: 'gentle',     label: 'Big Daddy',  img: require('../assets/personas/bigdaddy.png'),   glow: '#E0A15B' },
];
const PERSONA_BY_BACKEND: Record<string, PersonaId> = {
    hardcore: 'goggins',
    influencer: 'clavicular',
    gentle: 'bigdaddy',
    default: 'clavicular',   // legacy 'default' users land on the on-brand middle coach
};

/* A persona avatar that gently floats in place (Explore-style motion). The
   selected coach renders full-strength; the others sit dimmed. */
function FloatingAvatar({ img, active, delay }: { img: any; active: boolean; delay: number }) {
    const y = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(y, { toValue: -5, duration: 1500, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(y, { toValue: 0,  duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [y, delay]);
    return (
        <Animated.Image
            source={img}
            resizeMode="contain"
            style={[s.personaImg, { transform: [{ translateY: y }] }, !active && s.personaImgDim]}
        />
    );
}

type LengthId = 'concise' | 'medium' | 'detailed';
const LENGTH_OPTIONS: { id: LengthId; label: string; hint: string }[] = [
    { id: 'concise',  label: 'Concise',  hint: 'one short sentence' },
    { id: 'medium',   label: 'Medium',   hint: 'two or three sentences' },
    { id: 'detailed', label: 'Detailed', hint: 'long, specific, numbered' },
];

/* ── Helpers ────────────────────────────────────────────────────────── */
function formatWhen(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    if (sameDay) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ── Component ──────────────────────────────────────────────────────── */
export default function ChatConversationsDrawer({
    visible,
    activeConversationId,
    onClose,
    onSelect,
    onCreated,
}: ChatConversationsDrawerProps) {
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const convQuery = useChatConversationsQuery();
    const { user, refreshUser } = useAuth();

    /* Slide in from the LEFT (the menu button lives top-left, so the panel
       enters from the same edge). Keep the Modal mounted through the exit
       animation, then unmount. */
    const tx = useRef(new Animated.Value(OFFSCREEN_X)).current;
    const fade = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            Animated.parallel([
                Animated.timing(tx, { toValue: 0, duration: 240, useNativeDriver: true }),
                Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(tx, { toValue: OFFSCREEN_X, duration: 200, useNativeDriver: true }),
                Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start(({ finished }) => {
                if (finished) setMounted(false);
            });
        }
    }, [visible, tx, fade]);

    const [creating, setCreating] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    /* Preferences */
    const initialPersona: PersonaId =
        PERSONA_BY_BACKEND[user?.coaching_tone || 'default'] || 'clavicular';
    const initialLength: LengthId =
        (user?.onboarding?.response_length as LengthId) || 'medium';

    const [persona, setPersona] = useState<PersonaId>(initialPersona);
    const [length, setLength] = useState<LengthId>(initialLength);
    const [savingPersona, setSavingPersona] = useState<PersonaId | null>(null);
    const [savingLength, setSavingLength] = useState<LengthId | null>(null);

    React.useEffect(() => {
        if (!user) return;
        setPersona(PERSONA_BY_BACKEND[user.coaching_tone || 'default'] || 'clavicular');
        setLength((user?.onboarding?.response_length as LengthId) || 'medium');
    }, [user]);

    const conversations: Conversation[] = useMemo(
        () => (convQuery.data ?? []) as Conversation[],
        [convQuery.data]
    );

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
    }, [queryClient]);

    const handleNewChat = useCallback(async () => {
        if (creating) return;
        setCreating(true);
        try {
            const { conversation } = await api.createChatConversation();
            invalidate();
            onCreated(conversation.id);
            onClose();
        } catch (e: any) {
            Alert.alert('Could not start a new chat', e?.message || 'Please try again.');
        } finally {
            setCreating(false);
        }
    }, [creating, invalidate, onClose, onCreated]);

    const handleSelect = useCallback(
        (id: string) => { onSelect(id); onClose(); },
        [onClose, onSelect]
    );

    const startRename = useCallback((conv: Conversation) => {
        setRenamingId(conv.id);
        setRenameValue(conv.title);
    }, []);

    const commitRename = useCallback(async () => {
        if (!renamingId) return;
        const title = renameValue.trim();
        if (!title) { setRenamingId(null); return; }
        try {
            await api.renameChatConversation(renamingId, title);
            invalidate();
        } catch (e: any) {
            Alert.alert('Rename failed', e?.message || 'Please try again.');
        } finally {
            setRenamingId(null);
            setRenameValue('');
        }
    }, [invalidate, renameValue, renamingId]);

    const confirmDelete = useCallback(
        (conv: Conversation) => {
            Alert.alert(
                'Delete chat?',
                `"${conv.title}" will be permanently removed.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                            // Optimistically drop the row so it disappears from the
                            // open drawer IMMEDIATELY (invalidate alone is a network
                            // round-trip and left the open list stale). Roll back on
                            // failure.
                            const prev = (queryClient.getQueryData(queryKeys.chatConversations) as Conversation[] | undefined);
                            queryClient.setQueryData(
                                queryKeys.chatConversations,
                                (old: Conversation[] | undefined) =>
                                    (old ?? []).filter((c) => c.id !== conv.id),
                            );
                            if (conv.id === activeConversationId) onSelect('');
                            try {
                                await api.deleteChatConversation(conv.id);
                                invalidate();
                            } catch (e: any) {
                                if (prev) queryClient.setQueryData(queryKeys.chatConversations, prev);
                                Alert.alert('Delete failed', e?.message || 'Please try again.');
                            }
                        },
                    },
                ]
            );
        },
        [activeConversationId, invalidate, onSelect, queryClient]
    );

    const applyPersona = useCallback(
        async (next: PersonaId) => {
            if (next === persona || savingPersona) return;
            const target = PERSONA_OPTIONS.find((p) => p.id === next);
            if (!target) return;
            const previous = persona;
            setPersona(next);
            setSavingPersona(next);
            try {
                await api.patchCoachingTone(target.backend);
                await refreshUser().catch(() => undefined);
            } catch (e: any) {
                setPersona(previous);
                Alert.alert('Could not update coach', e?.message || 'Please try again.');
            } finally {
                setSavingPersona(null);
            }
        },
        [persona, refreshUser, savingPersona]
    );

    const applyLength = useCallback(
        async (next: LengthId) => {
            if (next === length || savingLength) return;
            const previous = length;
            setLength(next);
            setSavingLength(next);
            try {
                await api.patchResponseLength(next);
                await refreshUser().catch(() => undefined);
            } catch (e: any) {
                setLength(previous);
                Alert.alert('Could not update response length', e?.message || 'Please try again.');
            } finally {
                setSavingLength(null);
            }
        },
        [length, refreshUser, savingLength]
    );

    /* ── Render ──────────────────────────────────────────────────────── */
    return (
        <Modal animationType="none" transparent visible={mounted} onRequestClose={onClose}>
            <Animated.View style={[s.backdrop, { opacity: fade }]} pointerEvents="none" />
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
            <Animated.View
                style={[
                    s.drawerShadow,
                    {
                        top: insets.top + 10,
                        bottom: insets.bottom + 10,
                        transform: [{ translateX: tx }],
                    },
                ]}
            >
              <View style={s.drawerClip}>
                <BlurView intensity={42} tint="light" style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, s.glassFill]} pointerEvents="none" />
                <View style={[StyleSheet.absoluteFill, s.glassSheen]} pointerEvents="none" />
                <View
                    style={[
                        s.drawerContent,
                        {
                            paddingTop: spacing.lg,
                            paddingBottom: Math.max(insets.bottom + spacing.xs, spacing.md),
                        },
                    ]}
                >
                {/* ── Header ─────────────────────────────────────────── */}
                <View style={s.header}>
                    <Text style={s.title}>Max</Text>
                    <TouchableOpacity
                        onPress={onClose}
                        style={s.closeBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        // Distinct from the backdrop's "Close" so the X button is
                        // unambiguously targetable (both dismiss the drawer).
                        accessibilityLabel="Close chat list"
                        testID="drawer-close"
                    >
                        <Ionicons name="close" size={18} color={C.inkMuted} />
                    </TouchableOpacity>
                </View>

                {/* ── New chat ──────────────────────────────────────── */}
                <TouchableOpacity
                    style={s.newChatBtn}
                    onPress={handleNewChat}
                    activeOpacity={0.85}
                    disabled={creating}
                    testID="drawer-new-chat"
                    accessibilityLabel="Create new chat"
                >
                    {creating ? (
                        <ActivityIndicator size="small" color={C.ink} />
                    ) : (
                        <>
                            <Ionicons name="add" size={15} color={C.ink} style={{ marginRight: 6 }} />
                            <Text style={s.newChatText}>New chat</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* ── Recent chats — fills available vertical space ── */}
                <View style={s.chatsWrap}>
                    <Text style={s.label}>Recent</Text>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 12 }}
                    >
                        {convQuery.isPending && conversations.length === 0 && (
                            <ActivityIndicator size="small" color={C.inkDim} style={{ marginTop: 12 }} />
                        )}
                        {!convQuery.isPending && conversations.length === 0 && (
                            <Text style={s.empty}>no chats yet</Text>
                        )}
                        {conversations.map((conv) => {
                            const isActive = conv.id === activeConversationId;
                            const isRenaming = renamingId === conv.id;
                            return (
                                <View key={conv.id} style={[s.row, isActive && s.rowActive]}>
                                    {isRenaming ? (
                                        <TextInput
                                            style={s.renameInput}
                                            value={renameValue}
                                            onChangeText={setRenameValue}
                                            autoFocus
                                            onBlur={commitRename}
                                            onSubmitEditing={commitRename}
                                            returnKeyType="done"
                                            placeholder="title"
                                            placeholderTextColor={C.inkDim}
                                            maxLength={60}
                                        />
                                    ) : (
                                        <TouchableOpacity
                                            style={s.rowMain}
                                            onPress={() => handleSelect(conv.id)}
                                            onLongPress={() => startRename(conv)}
                                            activeOpacity={0.6}
                                        >
                                            <Text style={s.rowTitle} numberOfLines={1}>
                                                {conv.title || 'new chat'}
                                            </Text>
                                            <Text style={s.rowMeta}>
                                                {formatWhen(conv.last_message_at || conv.created_at)}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={s.rowDel}
                                        onPress={() => confirmDelete(conv)}
                                        // Per-row label so test tooling can target a SPECIFIC
                                        // row's trash icon (all rows share the generic action).
                                        accessibilityLabel={`Delete chat: ${conv.title || 'new chat'}`}
                                        testID={`delete-conv-${conv.id}`}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                        <Ionicons name="trash-outline" size={14} color={C.inkDim} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* ── Settings (stacked at bottom) ──────────────────── */}
                <View style={s.settings}>
                    <View style={s.divider} />

                    <Text style={s.label}>Coach</Text>
                    <View style={s.personaRow}>
                        {PERSONA_OPTIONS.map((opt, i) => {
                            const active = opt.id === persona;
                            const busy = savingPersona === opt.id;
                            return (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={s.personaCol}
                                    onPress={() => applyPersona(opt.id)}
                                    activeOpacity={0.8}
                                    disabled={!!savingPersona}
                                    accessibilityLabel={`Coach: ${opt.label}`}
                                >
                                    <View
                                        style={[
                                            s.personaAvatar,
                                            active && { borderColor: opt.glow, backgroundColor: 'rgba(255,255,255,0.04)' },
                                        ]}
                                    >
                                        {active ? <View style={[s.personaGlow, { backgroundColor: opt.glow }]} /> : null}
                                        <FloatingAvatar img={opt.img} active={active} delay={i * 240} />
                                        {busy ? (
                                            <View style={s.personaBusy}>
                                                <ActivityIndicator size="small" color={opt.glow} />
                                            </View>
                                        ) : null}
                                    </View>
                                    <Text style={[s.personaName, active && s.personaNameActive]} numberOfLines={1}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={[s.label, { marginTop: 14 }]}>Length</Text>
                    <View style={{ gap: 4 }}>
                        {LENGTH_OPTIONS.map((opt) => {
                            const active = opt.id === length;
                            const busy = savingLength === opt.id;
                            return (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={s.lenRow}
                                    onPress={() => applyLength(opt.id)}
                                    activeOpacity={0.7}
                                    disabled={!!savingLength}
                                >
                                    <View style={[s.lenDot, active && s.lenDotActive]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.lenLabel, active && s.lenLabelActive]}>
                                            {opt.label}
                                        </Text>
                                        <Text style={s.lenHint}>{opt.hint}</Text>
                                    </View>
                                    {busy && <ActivityIndicator size="small" color={C.inkMuted} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
                </View>
              </View>
            </Animated.View>
            {/* Host an alert layer INSIDE the drawer modal so delete-confirm /
                tone+length error alerts fired from here render ABOVE the drawer
                (a root-level host's modal would present behind it, invisible). */}
            <InAppAlertHost />
        </Modal>
    );
}

/* ── Styles ─────────────────────────────────────────────────────────── */
const DRAWER_WIDTH = Platform.select({ default: 312, web: 360 }) ?? 312;
// Slide fully clear of the screen (panel width + its left margin + shadow).
const OFFSCREEN_X = -(DRAWER_WIDTH + 28);

const s = StyleSheet.create({
    backdrop: {
        // Fully transparent — opening the drawer must NOT dim or blur the rest
        // of the screen. Only the panel itself is glass. (Tap-to-close is the
        // separate Pressable layer.)
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    /* Floating frosted-glass panel. Outer view carries the transform + soft
       shadow (un-clipped); the inner clip rounds the corners and hosts the
       BlurView. Slides in from the LEFT, same side as the menu button. */
    drawerShadow: {
        position: 'absolute',
        left: 10,
        width: DRAWER_WIDTH,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 26, shadowOffset: { width: 4, height: 10 } }
            : { elevation: 12 }),
    },
    drawerClip: {
        flex: 1,
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.glassEdge,
        // Android blur is weak; fall back to a light translucent panel there.
        backgroundColor: Platform.OS === 'android' ? 'rgba(248,248,250,0.9)' : 'transparent',
    },
    // Dark wash over the blur so text stays legible against bright content.
    glassFill: {
        backgroundColor: C.glassTint,
    },
    // Faint top-down sheen for the glassy highlight.
    glassSheen: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.5)',
        backgroundColor: 'transparent',
    },
    drawerContent: {
        flex: 1,
        paddingHorizontal: spacing.md,
    },
    /* header */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: 26,
        fontWeight: '400',
        letterSpacing: -0.4,
        color: C.ink,
    },
    closeBtn: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
        backgroundColor: C.bgRaised,
    },
    /* new chat */
    newChatBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 38,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: C.borderStrong,
        backgroundColor: C.bgRaised,
        marginBottom: 14,
    },
    newChatText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        color: C.ink,
        letterSpacing: 0.1,
    },
    /* labels */
    label: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: C.inkMuted,
        marginBottom: 8,
    },
    empty: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: C.inkDim,
        marginTop: 8,
        letterSpacing: 0.2,
    },
    /* chats area */
    chatsWrap: {
        flex: 1,
        minHeight: 0,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 2,
    },
    rowActive: {
        backgroundColor: C.bgActive,
    },
    rowMain: { flex: 1 },
    rowTitle: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: C.ink,
        letterSpacing: 0.1,
    },
    rowMeta: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: C.inkDim,
        marginTop: 1,
    },
    rowDel: {
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    renameInput: {
        flex: 1,
        fontFamily: fonts.sans,
        fontSize: 13,
        color: C.ink,
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderStrong,
        backgroundColor: C.bgRaised,
    },
    /* settings (stacked bottom) */
    settings: {
        paddingTop: 4,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.border,
        marginBottom: 14,
    },
    /* persona (coach) picker */
    personaRow: {
        flexDirection: 'row',
        gap: 8,
    },
    personaCol: {
        flex: 1,
        alignItems: 'center',
    },
    personaAvatar: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.bgRaised,
        overflow: 'hidden',
    },
    // Soft signature-color halo behind the selected coach.
    personaGlow: {
        position: 'absolute',
        bottom: -28,
        width: '150%',
        height: '110%',
        borderRadius: 999,
        opacity: 0.22,
    },
    personaImg: {
        width: '94%',
        height: '94%',
    },
    personaImgDim: {
        opacity: 0.38,
    },
    personaBusy: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.45)',
    },
    personaName: {
        fontFamily: fonts.sansMedium,
        fontSize: 11.5,
        color: C.inkMuted,
        letterSpacing: 0.1,
        marginTop: 7,
    },
    personaNameActive: {
        color: C.ink,
        fontFamily: fonts.sansSemiBold,
    },
    /* length rows */
    lenRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: 'transparent',
    },
    lenDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: C.borderStrong,
        marginRight: 12,
    },
    lenDotActive: {
        backgroundColor: C.accent,
        borderColor: C.accent,
    },
    lenLabel: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: C.inkMuted,
        letterSpacing: 0.1,
    },
    lenLabelActive: {
        color: C.ink,
    },
    lenHint: {
        fontFamily: fonts.sans,
        fontSize: 10.5,
        color: C.inkDim,
        marginTop: 1,
        letterSpacing: 0.1,
    },
});

/**
 * CreatorOnboardingScreen — post-approval studio wizard.
 * Aesthetic matches CreatorApplyScreen / OnboardingV2: Stoic cream canvas,
 * centered Matter headlines, Fraunces italic accents, liquid glass cards,
 * staggered page transitions, white pill back button.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
    ActivityIndicator, Platform, KeyboardAvoidingView, Modal, Pressable,
} from 'react-native';
import Animated, {
    Easing, Extrapolation, interpolate, useAnimatedStyle,
    useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { LiquidGlass } from '../../components/glass/LiquidGlass';
import api, { type CreatorHabitTemplate, type CreatorOnboardingState } from '../../services/api';

const INK = '#000000';
const ON_INK = '#FFFFFF';
const BG = '#F1F1EF';
const CARD = '#FFFFFF';
const SUB = '#6B6B6B';
const MUTE = '#9A9A9A';
const TRACK = '#E2E1DE';
const BACK_BG = '#FFFFFF';
const DISABLED = '#DAD9D6';
const DISABLED_TXT = '#A4A29D';
const HAIR = 'rgba(0,0,0,0.08)';
const DANGER = '#B23A3A';
const SERIF_I = 'Fraunces-Italic';

const SOFT = {
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

const STEP_KEYS = ['knowledge', 'reveal', 'voice_intro', 'voice_teach', 'habits', 'test_drive', 'pricing', 'media', 'launch'] as const;
const HABIT_TAGS = ['All', 'Mewing', 'Chewing', 'Posture', 'Skin', 'Recovery', 'Protocol'];

function normalizeDocUrl(raw: string): string {
    let url = raw.trim();
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return url;
}

function apiDetail(err: unknown): string {
    const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof d === 'string' ? d : 'Request failed';
}

function ProgressBar({ index, total }: { index: number; total: number }) {
    const p = useSharedValue((index + 1) / total);
    useEffect(() => {
        p.value = withTiming((index + 1) / total, { duration: 380, easing: Easing.out(Easing.cubic) });
    }, [index, total, p]);
    const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
    return (
        <View style={s.progressTrack}>
            <Animated.View style={[s.progressFill, style]} />
        </View>
    );
}

function PrimaryButton({ label, onPress, loading, disabled }: {
    label: string; onPress?: () => void; loading?: boolean; disabled?: boolean;
}) {
    const dim = disabled && !loading;
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            disabled={disabled || loading}
            style={[s.cta, dim && s.ctaDisabled]}
            accessibilityRole="button"
        >
            {loading ? <ActivityIndicator color={ON_INK} /> : (
                <Text style={[s.ctaText, dim && s.ctaTextDisabled]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

function Field({ value, onChangeText, placeholder, multiline, autoCapitalize }: {
    value: string; onChangeText: (t: string) => void; placeholder: string;
    multiline?: boolean; autoCapitalize?: 'none' | 'sentences';
}) {
    return (
        <View style={s.fieldLine}>
            <TextInput
                style={[s.input, multiline && s.inputMulti]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={MUTE}
                multiline={multiline}
                autoCapitalize={autoCapitalize ?? 'sentences'}
            />
        </View>
    );
}

function MeterRow({ label, pct }: { label: string; pct: number }) {
    return (
        <View style={s.meterRow}>
            <View style={s.meterHead}>
                <Text style={s.meterLabel}>{label}</Text>
                <Text style={s.meterPct}>{pct > 0 ? `${pct}%` : 'not started'}</Text>
            </View>
            <View style={s.meterTrack}>
                <View style={[s.meterFill, { width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }]} />
            </View>
        </View>
    );
}

function GlassMeter({ protocols, voice }: { protocols: number; voice: number }) {
    return (
        <LiquidGlass radius={22} intensity={68} style={{ width: '100%' }} contentStyle={s.glassPad}>
            <MeterRow label="Your protocols" pct={protocols} />
            <View style={s.meterHair} />
            <MeterRow label="Your voice" pct={voice} />
            <Text style={s.revealCopy}>
                Right now it answers like a textbook. You're going to teach it by talking — a few minutes now, sharper every week after.
            </Text>
        </LiquidGlass>
    );
}

export default function CreatorOnboardingScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const reduced = useReducedMotion();
    const [state, setState] = useState<CreatorOnboardingState | null>(null);
    const [step, setStep] = useState(0);
    const [dir, setDir] = useState(1);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [voiceAnswer, setVoiceAnswer] = useState('');
    const [correction, setCorrection] = useState('');
    const [driveUrl, setDriveUrl] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [welcomeMsg, setWelcomeMsg] = useState('');
    const [introUrl, setIntroUrl] = useState('');
    const [habitFilter, setHabitFilter] = useState('All');
    const [editingHabit, setEditingHabit] = useState<CreatorHabitTemplate | null>(null);
    const [docErr, setDocErr] = useState<string | null>(null);

    const appendKnowledgeDoc = useCallback((doc: { filename: string; url: string; source?: string }) => {
        setState((prev) => prev ? {
            ...prev,
            knowledge_docs: [...(prev.knowledge_docs || []), doc],
        } : prev);
    }, []);

    const load = useCallback(async () => {
        try {
            const data = await api.getCreatorOnboarding();
            setState(data);
            if (!data.complete) setStep(Math.min(data.step, STEP_KEYS.length - 1));
            setWelcomeMsg(data.welcome_message || '');
            setIntroUrl(data.intro_video_url || '');
        } catch {
            setError('Could not load onboarding.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const maxName = state?.max_name?.replace(/max$/i, '') || 'Your max';
    const maxLabel = maxName.charAt(0).toUpperCase() + maxName.slice(1);
    const habits = state?.habit_library || [];
    const filteredHabits = habits.filter((h) => {
        if (habitFilter === 'All') return true;
        const q = habitFilter.toLowerCase();
        return (h.tags || []).some((t) => t.toLowerCase().includes(q)) || h.title.toLowerCase().includes(q);
    });

    const persistStep = async (next: number) => {
        try { await api.setCreatorOnboardingStep(next); } catch { /* best-effort */ }
    };

    const goNext = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setError(null);
        const key = STEP_KEYS[step];
        setBusy(true);
        try {
            if (key === 'knowledge') {
                const data = await api.analyzeCreatorKnowledge();
                setState(data);
                setDir(1); setStep(1);
                await persistStep(1);
            } else if (key === 'voice_intro') {
                setDir(1); setStep(3);
                await persistStep(3);
            } else if (key === 'habits') {
                await api.updateCreatorHabitLibrary(habits);
                await api.syncCreatorOnboardingHabits();
                setDir(1); setStep(5);
                await persistStep(5);
            } else if (key === 'pricing') {
                setDir(1); setStep(7);
                await persistStep(7);
            } else if (key === 'media') {
                const data = await api.setCreatorOnboardingMedia(introUrl.trim() || undefined, welcomeMsg.trim());
                setState(data);
                setDir(1); setStep(8);
                await persistStep(8);
            } else if (key === 'launch') {
                const data = await api.launchCreatorMax();
                setState(data);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                navigation.replace('CreatorStudio');
                return;
            } else if (step < STEP_KEYS.length - 1) {
                setDir(1); setStep(step + 1);
                await persistStep(step + 1);
            }
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const goBack = () => {
        if (step === 0) { navigation.goBack(); return; }
        Haptics.selectionAsync().catch(() => {});
        setDir(-1); setStep(step - 1); setError(null);
    };

    const pickDoc = async () => {
        setBusy(true); setDocErr(null);
        try {
            if (Platform.OS === 'web') {
                await new Promise<void>((resolve) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,image/*';
                    input.onchange = async () => {
                        try {
                            const file = input.files?.[0];
                            if (!file) return;
                            const data = await api.uploadCreatorOnboardingDoc(file);
                            appendKnowledgeDoc(data);
                        } catch (e) {
                            setDocErr(apiDetail(e) || 'Upload failed.');
                        } finally {
                            resolve();
                        }
                    };
                    input.addEventListener('cancel', () => resolve(), { once: true });
                    input.click();
                });
                return;
            }
            const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
            if (!picked.canceled && picked.assets?.[0]) {
                const a = picked.assets[0];
                const data = await api.uploadCreatorOnboardingDoc({
                    uri: a.uri, name: a.name || 'doc', type: a.mimeType || undefined,
                });
                appendKnowledgeDoc(data);
            }
        } catch (e) {
            setDocErr(apiDetail(e) || 'Upload failed.');
        } finally {
            setBusy(false);
        }
    };

    const addDrive = async () => {
        const url = normalizeDocUrl(driveUrl);
        if (!url) return;
        setBusy(true); setDocErr(null);
        try {
            const data = await api.linkCreatorOnboardingDoc(url);
            appendKnowledgeDoc(data);
            setDriveUrl('');
        } catch (e) {
            setDocErr(apiDetail(e) || 'Could not add that link.');
        } finally {
            setBusy(false);
        }
    };

    const submitVoice = async () => {
        const sample = state?.current_voice_sample;
        if (!sample || !voiceAnswer.trim()) return;
        setBusy(true);
        try {
            const data = await api.submitCreatorVoiceAnswer(sample.id, voiceAnswer.trim());
            setState(data);
            setVoiceAnswer('');
        } catch { setError('Could not save answer.'); }
        finally { setBusy(false); }
    };

    const voiceFeedback = async (approved: boolean) => {
        const sample = state?.current_voice_sample;
        if (!sample) return;
        setBusy(true);
        try {
            const data = await api.submitCreatorVoiceFeedback(
                sample.id, approved, approved ? undefined : correction.trim(),
            );
            setState(data);
            setCorrection('');
        } catch { setError('Could not save feedback.'); }
        finally { setBusy(false); }
    };

    const sendChat = async () => {
        if (!chatInput.trim()) return;
        setBusy(true);
        try {
            const data = await api.creatorOnboardingTestChat(chatInput.trim());
            setState(data);
            setChatInput('');
        } catch { setError('Chat failed.'); }
        finally { setBusy(false); }
    };

    const t = useSharedValue(1);
    useEffect(() => {
        if (reduced) { t.value = 1; return; }
        t.value = 0;
        t.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
    }, [step, reduced, t]);

    const headStyle = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateX: interpolate(t.value, [0, 1], [dir * 34, 0], Extrapolation.CLAMP) }],
    }));
    const bodyStyle = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0.18, 0.9], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(t.value, [0.18, 1], [16, 0], Extrapolation.CLAMP) }],
    }));

    const steps = useMemo(() => {
        const phase = state?.voice_phase || 1;
        const sample = state?.current_voice_sample;
        return [
            {
                key: 'knowledge',
                title: (
                    <Text style={s.title}>
                        What does{'\n'}<Text style={s.titleItalic}>{maxLabel}</Text> need to know?
                    </Text>
                ),
                sub: 'Drop in your guides, scripts, protocols.',
                canNext: (state?.knowledge_docs?.length || 0) > 0,
                body: (
                    <View style={{ gap: 12 }}>
                        {(state?.knowledge_docs || []).map((d, i) => (
                            <View key={`${d.url}-${i}`} style={s.docRow}>
                                <View style={s.docIcon}><Ionicons name="document-text-outline" size={18} color={INK} /></View>
                                <Text style={s.docName} numberOfLines={1}>{d.filename}</Text>
                            </View>
                        ))}
                        <TouchableOpacity style={s.docBtn} onPress={pickDoc} disabled={busy} activeOpacity={0.85}>
                            <Ionicons name="folder-open-outline" size={18} color={INK} />
                            <Text style={s.docBtnText}>Add from device</Text>
                        </TouchableOpacity>
                        <View style={s.driveRow}>
                            <TextInput
                                style={s.driveInput}
                                value={driveUrl}
                                onChangeText={setDriveUrl}
                                placeholder="Paste Google Drive link"
                                placeholderTextColor={MUTE}
                                autoCapitalize="none"
                                keyboardType="url"
                                onSubmitEditing={() => void addDrive()}
                            />
                            <TouchableOpacity
                                style={[s.linkBtn, (!driveUrl.trim() || busy) && s.linkBtnOff]}
                                onPress={addDrive}
                                disabled={busy || !driveUrl.trim()}
                            >
                                <Text style={s.linkBtnText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                        {docErr ? <Text style={s.docErr}>{docErr}</Text> : null}
                    </View>
                ),
            },
            {
                key: 'reveal',
                title: (
                    <Text style={s.title}>
                        {maxLabel} knows{'\n'}<Text style={s.titleItalic}>your stuff</Text>.
                    </Text>
                ),
                sub: '',
                canNext: true,
                body: <GlassMeter protocols={state?.protocols_pct || 0} voice={state?.voice_pct || 0} />,
            },
            {
                key: 'voice_intro',
                title: (
                    <Text style={s.title}>
                        Teach your{'\n'}<Text style={s.titleItalic}>voice</Text>
                    </Text>
                ),
                sub: 'Three phases — most of it happens over time, not in one sitting.',
                canNext: true,
                body: (
                    <View style={{ gap: 12 }}>
                        {[
                            ['Phase 1', 'You write. Max just listens.', 'First ~8 answers — no draft. Max learns your patterns silently.'],
                            ['Phase 2', 'Max tries, you correct.', 'Once it has enough samples, it drafts — you fix what\'s off.'],
                            ['Phase 3', 'Max drafts, you approve.', 'Eventually it handles it and you spot-check.'],
                        ].map(([phase, title, desc]) => (
                            <LiquidGlass key={phase} radius={18} intensity={58} style={{ width: '100%' }} contentStyle={s.phaseCard}>
                                <Text style={s.phaseKicker}>{phase}</Text>
                                <Text style={s.phaseTitle}>{title}</Text>
                                <Text style={s.phaseDesc}>{desc}</Text>
                            </LiquidGlass>
                        ))}
                    </View>
                ),
            },
            {
                key: 'voice_teach',
                title: phase >= 2 ? (
                    <Text style={s.title}>
                        Fix what's{'\n'}<Text style={s.titleItalic}>off</Text>
                    </Text>
                ) : (
                    <Text style={s.title}>
                        Your{'\n'}<Text style={s.titleItalic}>answer</Text>
                    </Text>
                ),
                sub: sample ? '' : 'Loading questions…',
                canNext: (state?.voice_samples_answered || 0) >= 3,
                body: sample ? (
                    <View style={{ gap: 14 }}>
                        <LiquidGlass radius={16} intensity={55} contentStyle={s.quoteCard}>
                            <Text style={s.quoteLabel}>A subscriber asks</Text>
                            <Text style={s.quoteText}>"{sample.question}"</Text>
                        </LiquidGlass>
                        {phase >= 2 && sample.draft_answer ? (
                            <>
                                <Text style={s.draftLabel}>{maxLabel} drafted</Text>
                                <LiquidGlass radius={16} intensity={62} contentStyle={s.draftCard}>
                                    <Text style={s.draftText}>{sample.draft_answer}</Text>
                                </LiquidGlass>
                                <View style={s.feedbackRow}>
                                    <TouchableOpacity style={s.approveBtn} onPress={() => void voiceFeedback(true)} disabled={busy} activeOpacity={0.85}>
                                        <Ionicons name="checkmark" size={16} color={ON_INK} />
                                        <Text style={s.approveBtnText}>That's me</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.editBtn} activeOpacity={0.85}>
                                        <Ionicons name="pencil-outline" size={16} color={INK} />
                                        <Text style={s.editBtnText}>Not quite</Text>
                                    </TouchableOpacity>
                                </View>
                                <Field value={correction} onChangeText={setCorrection} placeholder="Type your correction…" multiline />
                                {correction.trim() ? (
                                    <TouchableOpacity style={s.secondaryPill} onPress={() => void voiceFeedback(false)} activeOpacity={0.85}>
                                        <Text style={s.secondaryPillText}>Save correction</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </>
                        ) : (
                            <>
                                <Field value={voiceAnswer} onChangeText={setVoiceAnswer} placeholder="Type your answer from scratch…" multiline />
                                {voiceAnswer.trim() ? (
                                    <TouchableOpacity style={s.secondaryPill} onPress={submitVoice} disabled={busy} activeOpacity={0.85}>
                                        <Text style={s.secondaryPillText}>Submit answer</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </>
                        )}
                        <LiquidGlass radius={14} intensity={50} noShadow contentStyle={s.voiceMeterCard}>
                            <Text style={s.voiceMeterLabel}>Voice training</Text>
                            <View style={s.meterTrack}><View style={[s.meterFill, { width: `${state?.voice_pct || 0}%` }]} /></View>
                            <Text style={s.voiceMeterSub}>{state?.voice_pct || 0}% — {phase === 1 ? 'still learning' : 'getting sharper'}</Text>
                        </LiquidGlass>
                    </View>
                ) : null,
            },
            {
                key: 'habits',
                title: (
                    <Text style={s.title}>
                        {maxLabel}'s habit{'\n'}<Text style={s.titleItalic}>library</Text>
                    </Text>
                ),
                sub: `${habits.length} habits Max personalizes from`,
                canNext: habits.filter((h) => h.enabled !== false).length >= 2,
                body: (
                    <View style={{ gap: 12 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tagRow}>
                            {HABIT_TAGS.map((tag) => (
                                <TouchableOpacity
                                    key={tag}
                                    style={[s.tagChip, habitFilter === tag && s.tagChipOn]}
                                    onPress={() => setHabitFilter(tag)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[s.tagChipText, habitFilter === tag && s.tagChipTextOn]}>{tag}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        {filteredHabits.slice(0, 12).map((h) => (
                            <TouchableOpacity key={h.id} onPress={() => setEditingHabit(h)} activeOpacity={0.85}>
                                <LiquidGlass radius={16} intensity={56} style={{ width: '100%' }} contentStyle={s.habitCard}>
                                    <Ionicons name="menu-outline" size={16} color={MUTE} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.habitTitle}>{h.title}</Text>
                                        <Text style={s.habitMeta} numberOfLines={1}>
                                            shown to {h.shown_to_count ?? 'some'} profiles · {(h.conditions || [])[0] || 'all beginners'}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={14} color={MUTE} />
                                </LiquidGlass>
                            </TouchableOpacity>
                        ))}
                        {habits.length > 12 ? <Text style={s.moreText}>… {habits.length - 12} more</Text> : null}
                    </View>
                ),
            },
            {
                key: 'test_drive',
                title: (
                    <Text style={s.title}>
                        Try your{'\n'}<Text style={s.titleItalic}>own Max</Text>
                    </Text>
                ),
                sub: 'Chat as a subscriber — reset anytime.',
                canNext: true,
                body: (
                    <View style={{ gap: 12 }}>
                        <View style={s.testActions}>
                            <LiquidGlass radius={16} intensity={55} style={{ flex: 1 }} contentStyle={s.testActionInner}>
                                <Ionicons name="chatbubble-outline" size={18} color={INK} />
                                <Text style={s.testActionText}>Chat as subscriber</Text>
                            </LiquidGlass>
                            <TouchableOpacity onPress={() => api.resetCreatorOnboardingTest().then(load)} activeOpacity={0.85}>
                                <LiquidGlass radius={16} intensity={55} contentStyle={s.testActionInner}>
                                    <Ionicons name="refresh-outline" size={18} color={INK} />
                                    <Text style={s.testActionText}>Reset</Text>
                                </LiquidGlass>
                            </TouchableOpacity>
                        </View>
                        <LiquidGlass radius={20} intensity={62} style={{ width: '100%' }} contentStyle={s.chatBox}>
                            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {(state?.test_chat || []).length === 0 ? (
                                    <Text style={s.chatEmpty}>Ask something a subscriber would…</Text>
                                ) : (state?.test_chat || []).map((m, i) => (
                                    <View key={i} style={[s.chatBubble, m.role === 'user' ? s.chatUser : s.chatMax]}>
                                        <Text style={m.role === 'user' ? s.chatTextUser : s.chatText}>{m.text}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </LiquidGlass>
                        <View style={s.driveRow}>
                            <TextInput
                                style={[s.driveInput, { flex: 1 }]}
                                value={chatInput}
                                onChangeText={setChatInput}
                                placeholder="Ask as a subscriber…"
                                placeholderTextColor={MUTE}
                            />
                            <TouchableOpacity style={[s.linkBtn, busy && s.linkBtnOff]} onPress={sendChat} disabled={busy}>
                                <Text style={s.linkBtnText}>Send</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ),
            },
            {
                key: 'pricing',
                title: (
                    <Text style={s.title}>
                        Set your{'\n'}<Text style={s.titleItalic}>price</Text>
                    </Text>
                ),
                sub: 'Monthly subscription — pick a tier.',
                canNext: !!state?.price_tier,
                body: (
                    <View style={{ gap: 10 }}>
                        {Object.entries(state?.price_tiers || { t1: 499, t2: 999, t3: 1999, t4: 2999 })
                            .filter(([k]) => k !== 'free')
                            .map(([tier, cents]) => {
                                const selected = state?.price_tier === tier;
                                return (
                                    <TouchableOpacity
                                        key={tier}
                                        onPress={() => api.setCreatorOnboardingPricing(tier).then(setState)}
                                        activeOpacity={0.85}
                                    >
                                        <LiquidGlass
                                            radius={18}
                                            intensity={selected ? 70 : 52}
                                            style={{ width: '100%' }}
                                            contentStyle={[s.priceCard, selected && s.priceCardOn]}
                                        >
                                            <Text style={s.priceLabel}>${(cents / 100).toFixed(2)}<Text style={s.pricePer}>/mo</Text></Text>
                                            {selected ? <Ionicons name="checkmark-circle" size={22} color={INK} /> : null}
                                        </LiquidGlass>
                                    </TouchableOpacity>
                                );
                            })}
                    </View>
                ),
            },
            {
                key: 'media',
                title: (
                    <Text style={s.title}>
                        Course{'\n'}<Text style={s.titleItalic}>intro</Text>
                    </Text>
                ),
                sub: 'Video link + welcome message for new subscribers.',
                canNext: welcomeMsg.trim().length > 0,
                body: (
                    <View style={{ gap: 16 }}>
                        <Field value={introUrl} onChangeText={setIntroUrl} placeholder="Intro video URL (YouTube, Drive…)" autoCapitalize="none" />
                        <Field value={welcomeMsg} onChangeText={setWelcomeMsg} placeholder="Message when someone joins your course…" multiline />
                    </View>
                ),
            },
            {
                key: 'launch',
                title: (
                    <Text style={s.title}>
                        Launch &{'\n'}<Text style={s.titleItalic}>go live</Text>
                    </Text>
                ),
                sub: 'Your max goes on the marketplace.',
                canNext: true,
                body: (
                    <LiquidGlass radius={22} intensity={68} style={{ width: '100%' }} contentStyle={s.glassPad}>
                        {[
                            `${habits.filter((h) => h.enabled !== false).length} habits ready`,
                            `Voice ${state?.voice_pct || 0}% trained`,
                            `$${((state?.price_cents || 0) / 100).toFixed(2)}/mo`,
                            'Welcome message set',
                        ].map((line) => (
                            <View key={line} style={s.launchRow}>
                                <Ionicons name="checkmark-circle" size={18} color={INK} />
                                <Text style={s.launchLine}>{line}</Text>
                            </View>
                        ))}
                    </LiquidGlass>
                ),
            },
        ];
    }, [state, maxLabel, habits, habitFilter, filteredHabits, voiceAnswer, correction, driveUrl, chatInput, welcomeMsg, introUrl, busy, docErr]);

    const current = steps[Math.min(step, steps.length - 1)];
    const isLast = step === steps.length - 1;

    if (loading) {
        return <View style={[s.root, s.center]}><ActivityIndicator color={INK} /></View>;
    }
    if (state?.complete) {
        navigation.replace('CreatorStudio');
        return null;
    }

    const ctaLabel = step === 2 ? 'Start teaching my voice →' : isLast ? 'Launch & go live' : 'Continue';

    return (
        <View style={s.root}>
            <View style={[s.frame, { paddingTop: insets.top + 14 }]}>
                <Text style={s.kicker}>STUDIO SETUP · {step + 1}/{steps.length}</Text>
                <View style={s.topRow}>
                    <TouchableOpacity onPress={goBack} style={s.backBtn} hitSlop={12} accessibilityLabel="Back">
                        <Ionicons name="chevron-back" size={22} color={INK} />
                    </TouchableOpacity>
                    <ProgressBar index={step} total={steps.length} />
                </View>

                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8} style={{ flex: 1 }}>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={s.scrollBody}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View style={[s.headBlock, headStyle]}>
                            {current.title}
                            {current.sub ? <Text style={s.sub}>{current.sub}</Text> : null}
                        </Animated.View>
                        <Animated.View style={[s.bodyBlock, bodyStyle]}>
                            {current.body}
                            {error ? <Text style={s.error}>{error}</Text> : null}
                        </Animated.View>
                    </ScrollView>

                    <View style={{ paddingBottom: insets.bottom + 16 }}>
                        <PrimaryButton label={ctaLabel} onPress={goNext} loading={busy} disabled={!current.canNext} />
                    </View>
                </KeyboardAvoidingView>
            </View>

            <Modal visible={editingHabit != null} transparent animationType="slide" onRequestClose={() => setEditingHabit(null)}>
                <Pressable style={s.modalBackdrop} onPress={() => setEditingHabit(null)}>
                    <Pressable style={s.modalSheet} onPress={() => {}}>
                        {editingHabit ? (
                            <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
                                <View style={s.modalHandle} />
                                <Text style={s.modalTitle}>{editingHabit.title}</Text>
                                <Text style={s.modalLabel}>Shown to a user when</Text>
                                {(editingHabit.conditions || ['all beginners']).map((c, i) => (
                                    <View key={i} style={s.bulletRow}>
                                        <Text style={s.bullet}>•</Text>
                                        <Text style={s.conditionLine}>{c}</Text>
                                    </View>
                                ))}
                                <Text style={s.modalLabel}>Questions subscribers ask</Text>
                                {(editingHabit.sample_questions || []).map((q, i) => (
                                    <View key={i} style={s.bulletRow}>
                                        <Text style={s.bullet}>•</Text>
                                        <Text style={s.conditionLine}>{q}</Text>
                                    </View>
                                ))}
                                <Text style={s.modalLabel}>The habit</Text>
                                <Text style={s.conditionLine}>
                                    {editingHabit.description} · {editingHabit.duration_minutes || 10} min
                                </Text>
                                <PrimaryButton label="Done" onPress={() => setEditingHabit(null)} />
                            </ScrollView>
                        ) : null}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    frame: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24 },
    center: { alignItems: 'center', justifyContent: 'center' },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.2, color: MUTE, marginBottom: 10, textAlign: 'center' },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BACK_BG, alignItems: 'center', justifyContent: 'center', ...SOFT },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: TRACK, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: INK },
    scrollBody: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 },
    headBlock: { width: '100%', alignItems: 'center' },
    bodyBlock: { width: '100%', marginTop: 26 },
    title: { fontFamily: 'Matter-Bold', fontSize: 30, color: INK, letterSpacing: -0.6, lineHeight: 36, textAlign: 'center' },
    titleItalic: { fontFamily: SERIF_I, fontStyle: 'italic' },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, marginTop: 12, lineHeight: 21, textAlign: 'center', maxWidth: 300, alignSelf: 'center' },
    error: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: DANGER, marginTop: 18, lineHeight: 19, textAlign: 'center' },

    cta: { height: 54, borderRadius: 27, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
    ctaDisabled: { backgroundColor: DISABLED },
    ctaText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: ON_INK, letterSpacing: 0.2 },
    ctaTextDisabled: { color: DISABLED_TXT },

    fieldLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIR, paddingBottom: 10 },
    input: { fontFamily: 'Matter-Medium', fontSize: 18, color: INK, padding: 0, lineHeight: 26 },
    inputMulti: { minHeight: 96, textAlignVertical: 'top', fontFamily: 'Matter-Regular', fontSize: 16, lineHeight: 24 },

    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 14, padding: 12, ...SOFT },
    docIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
    docName: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 14, color: INK },
    docBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CARD, borderRadius: 14, paddingVertical: 14, ...SOFT },
    docBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK },
    driveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    driveInput: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 14, color: INK, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, ...SOFT },
    linkBtn: { paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR },
    linkBtnOff: { opacity: 0.45 },
    linkBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, color: INK },
    docErr: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: DANGER, marginTop: 4 },

    glassPad: { padding: 20, gap: 14 },
    meterRow: { gap: 8 },
    meterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    meterLabel: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK },
    meterPct: { fontFamily: 'Matter-Medium', fontSize: 13, color: SUB },
    meterTrack: { height: 6, borderRadius: 3, backgroundColor: TRACK, overflow: 'hidden' },
    meterFill: { height: '100%', borderRadius: 3, backgroundColor: INK },
    meterHair: { height: StyleSheet.hairlineWidth, backgroundColor: HAIR },
    revealCopy: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: SUB, lineHeight: 21, marginTop: 4 },

    phaseCard: { padding: 16, gap: 4 },
    phaseKicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, color: MUTE, letterSpacing: 0.8, textTransform: 'uppercase' },
    phaseTitle: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: INK },
    phaseDesc: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB, lineHeight: 19 },

    quoteCard: { padding: 16, gap: 6 },
    quoteLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 0.8, color: MUTE, textTransform: 'uppercase' },
    quoteText: { fontFamily: 'Matter-Regular', fontSize: 16, color: INK, lineHeight: 23, fontStyle: 'italic' },
    draftLabel: { fontFamily: 'Matter-SemiBold', fontSize: 12, letterSpacing: 0.6, color: MUTE, textTransform: 'uppercase' },
    draftCard: { padding: 16 },
    draftText: { fontFamily: 'Matter-Regular', fontSize: 15, color: INK, lineHeight: 22 },
    feedbackRow: { flexDirection: 'row', gap: 10 },
    approveBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: INK, borderRadius: 22, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
    approveBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: ON_INK },
    editBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: CARD, borderRadius: 22, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', ...SOFT },
    editBtnText: { fontFamily: 'Matter-Medium', fontSize: 14, color: INK },
    secondaryPill: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 20, backgroundColor: CARD, ...SOFT },
    secondaryPillText: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK },
    voiceMeterCard: { padding: 14, gap: 8 },
    voiceMeterLabel: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: MUTE, letterSpacing: 0.6, textTransform: 'uppercase' },
    voiceMeterSub: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: SUB },

    tagRow: { gap: 8, paddingBottom: 4 },
    tagChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD, ...SOFT },
    tagChipOn: { backgroundColor: INK },
    tagChipText: { fontFamily: 'Matter-Medium', fontSize: 13, color: SUB },
    tagChipTextOn: { color: ON_INK },
    habitCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    habitTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    habitMeta: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 2 },
    moreText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, textAlign: 'center' },

    testActions: { flexDirection: 'row', gap: 10 },
    testActionInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
    testActionText: { fontFamily: 'Matter-Medium', fontSize: 13, color: INK },
    chatBox: { padding: 14, minHeight: 180 },
    chatEmpty: { fontFamily: 'Matter-Regular', fontSize: 14, color: MUTE, textAlign: 'center', paddingVertical: 40 },
    chatBubble: { padding: 11, borderRadius: 14, marginBottom: 8, maxWidth: '88%' },
    chatUser: { alignSelf: 'flex-end', backgroundColor: INK },
    chatMax: { alignSelf: 'flex-start', backgroundColor: CARD, ...SOFT },
    chatText: { fontFamily: 'Matter-Regular', fontSize: 14, color: INK, lineHeight: 20 },
    chatTextUser: { fontFamily: 'Matter-Regular', fontSize: 14, color: ON_INK, lineHeight: 20 },

    priceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
    priceCardOn: { borderWidth: 1.5, borderColor: INK },
    priceLabel: { fontFamily: 'Matter-Bold', fontSize: 22, color: INK, letterSpacing: -0.4 },
    pricePer: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB },

    launchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    launchLine: { fontFamily: 'Matter-Regular', fontSize: 15, color: INK },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '78%' },
    modalBody: { padding: 24, paddingBottom: 40, gap: 10 },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: TRACK, alignSelf: 'center', marginBottom: 8 },
    modalTitle: { fontFamily: 'Matter-Bold', fontSize: 22, color: INK, letterSpacing: -0.4 },
    modalLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 0.8, color: MUTE, textTransform: 'uppercase', marginTop: 12 },
    bulletRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
    bullet: { fontFamily: 'Matter-Regular', fontSize: 14, color: SUB },
    conditionLine: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 14, color: INK, lineHeight: 21 },
});

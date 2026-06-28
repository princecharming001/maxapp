/**
 * CreatorApplySheet — "host your own max" application for creators.
 *
 * Editorial cream/ink register (matches the Explore screen): a left-aligned
 * serif headline, hairline-underline fields (no boxy inputs), a ruled
 * first-come-first-served banner, and an ink submit pill. On success it flips
 * in place to a confirmation state ("we'll get back to you in 1–2 weeks") whose
 * Done button closes back to the Creator tab.
 *
 * Sheet drag-to-dismiss uses the shared useSwipeDownDismiss hook; the gesture
 * lives inside a GestureHandlerRootView mounted INSIDE the Modal (RN Modal is a
 * separate native root, so gestures get no touches otherwise).
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TextInput,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSwipeDownDismiss } from '../../hooks/useSwipeDownDismiss';
import { api } from '../../services/api';

const INK = '#000000';
const ON_INK = '#FFFFFF';
const MUTE = '#9A9A9A';
const SUB = '#6B6B6B';
const CREAM = '#F1F1EF';
const CARD = '#FFFFFF';
const BORDER = 'rgba(0,0,0,0.10)';
const DANGER = '#B23A3A';
const SERIF = 'Fraunces';
const SERIF_I = 'Fraunces-Italic';

function Field({
    label, value, onChangeText, placeholder, multiline, autoCapitalize, prefix, maxLength,
}: {
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder: string;
    multiline?: boolean;
    autoCapitalize?: 'none' | 'sentences' | 'words';
    prefix?: string;
    maxLength?: number;
}) {
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.fieldLine}>
                {prefix ? <Text style={styles.fieldPrefix}>{prefix}</Text> : null}
                <TextInput
                    style={[styles.input, multiline && styles.inputMulti]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={MUTE}
                    multiline={multiline}
                    autoCapitalize={autoCapitalize ?? 'sentences'}
                    autoCorrect={!prefix}
                    maxLength={maxLength}
                />
            </View>
        </View>
    );
}

export default function CreatorApplySheet({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    const insets = useSafeAreaInsets();
    const { gesture, animatedStyle } = useSwipeDownDismiss(onClose);

    const [name, setName] = useState('');
    const [maxName, setMaxName] = useState('');
    const [desc, setDesc] = useState('');
    const [ig, setIg] = useState('');
    const [tt, setTt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const reset = () => {
        setName(''); setMaxName(''); setDesc(''); setIg(''); setTt('');
        setSubmitting(false); setError(null); setDone(false);
    };

    const close = () => { reset(); onClose(); };

    const canSubmit =
        name.trim().length > 0 &&
        maxName.trim().length > 0 &&
        desc.trim().length > 0 &&
        (ig.trim().length > 0 || tt.trim().length > 0) &&
        !submitting;

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        try {
            await api.submitCreatorApplication({
                applicant_name: name.trim(),
                max_name: maxName.trim(),
                max_description: desc.trim(),
                instagram: ig.trim() || undefined,
                tiktok: tt.trim() || undefined,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setDone(true);
        } catch (e: any) {
            const status = e?.response?.status;
            const detail = e?.response?.data?.detail;
            setError(
                status === 409
                    ? (detail || "Someone's already in line for this max. Try a different niche.")
                    : status === 422
                        ? (detail || 'Please check your answers and try again.')
                        : 'Could not submit right now. Please try again in a moment.',
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
            <GestureHandlerRootView style={styles.ghRoot}>
                <View style={styles.backdrop}>
                    <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, animatedStyle]}>
                        {/* Drag zone: grabber + close. */}
                        <GestureDetector gesture={gesture}>
                            <View style={styles.dragZone}>
                                <View style={styles.grabber} />
                                {!done ? (
                                    <TouchableOpacity onPress={close} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
                                        <Ionicons name="close" size={22} color={SUB} />
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </GestureDetector>

                        {done ? (
                            <Confirmation onDone={close} />
                        ) : (
                            <KeyboardAvoidingView
                                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                                keyboardVerticalOffset={8}
                                style={{ flexShrink: 1 }}
                            >
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    keyboardShouldPersistTaps="handled"
                                    contentContainerStyle={styles.body}
                                >
                                    <Text style={styles.kicker}>FOR CREATORS</Text>
                                    <Text style={styles.h1}>
                                        Own your <Text style={styles.h1i}>max</Text>
                                    </Text>
                                    <Text style={styles.lede}>
                                        Known for something — or is it your niche? Claim it as a max and
                                        bring your audience a routine only you could build.
                                    </Text>

                                    {/* Urgency — ruled banner, not a cliché red alert. */}
                                    <View style={styles.urgency}>
                                        <View style={styles.urgencyRule} />
                                        <Text style={styles.urgencyText}>
                                            First come, first served. We only take{' '}
                                            <Text style={styles.urgencyStrong}>one creator per max</Text> — once
                                            a niche is claimed, it's gone.
                                        </Text>
                                    </View>

                                    <Field
                                        label="YOUR NAME"
                                        value={name}
                                        onChangeText={setName}
                                        placeholder="How you're known"
                                        autoCapitalize="words"
                                        maxLength={120}
                                    />
                                    <Field
                                        label="THE MAX YOU'D OWN"
                                        value={maxName}
                                        onChangeText={(t) => { setMaxName(t); if (error) setError(null); }}
                                        placeholder="e.g. Chessmax, Voicemax, Stylemax"
                                        autoCapitalize="words"
                                        maxLength={80}
                                    />
                                    <Field
                                        label="WHAT IT IS & WHY YOU"
                                        value={desc}
                                        onChangeText={setDesc}
                                        placeholder="What the max teaches, and why you're the one to lead it."
                                        multiline
                                        maxLength={1500}
                                    />

                                    <Text style={styles.socialHint}>Link at least one so we can verify you.</Text>
                                    <Field
                                        label="INSTAGRAM"
                                        value={ig}
                                        onChangeText={setIg}
                                        placeholder="username"
                                        prefix="@"
                                        autoCapitalize="none"
                                        maxLength={120}
                                    />
                                    <Field
                                        label="TIKTOK"
                                        value={tt}
                                        onChangeText={setTt}
                                        placeholder="username"
                                        prefix="@"
                                        autoCapitalize="none"
                                        maxLength={120}
                                    />

                                    {error ? <Text style={styles.error}>{error}</Text> : null}

                                    <TouchableOpacity
                                        style={[styles.submit, !canSubmit && styles.submitOff]}
                                        onPress={submit}
                                        disabled={!canSubmit}
                                        activeOpacity={0.85}
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color={ON_INK} />
                                        ) : (
                                            <Text style={styles.submitText}>Submit application</Text>
                                        )}
                                    </TouchableOpacity>
                                    <Text style={styles.fineprint}>
                                        We review every application by hand. You'll hear back in 1–2 weeks.
                                    </Text>
                                </ScrollView>
                            </KeyboardAvoidingView>
                        )}
                    </Animated.View>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

function Confirmation({ onDone }: { onDone: () => void }) {
    return (
        <View style={styles.confirm}>
            <View style={styles.confirmCheck}>
                <Ionicons name="checkmark" size={34} color={INK} />
            </View>
            <Text style={styles.confirmTitle}>You're in the queue</Text>
            <Text style={styles.confirmBody}>
                Application received. We'll review your work and your socials, and get
                back to you in <Text style={styles.confirmStrong}>1–2 weeks</Text>.
            </Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={onDone} activeOpacity={0.85}>
                <Text style={styles.confirmBtnText}>Done</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    ghRoot: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: CREAM,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        maxHeight: '92%',
        paddingHorizontal: 24,
    },
    dragZone: { paddingTop: 10, paddingBottom: 4 },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)' },
    closeBtn: { position: 'absolute', right: 0, top: 6, padding: 6 },

    body: { paddingTop: 14, paddingBottom: 8 },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11.5, letterSpacing: 1.6, color: MUTE },
    h1: { fontFamily: SERIF, fontSize: 38, color: INK, letterSpacing: -1, lineHeight: 42, marginTop: 8 },
    h1i: { fontFamily: SERIF_I, color: INK },
    lede: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 22, marginTop: 12 },

    urgency: { marginTop: 20, marginBottom: 6, flexDirection: 'row', gap: 12 },
    urgencyRule: { width: 2, borderRadius: 1, backgroundColor: INK },
    urgencyText: { flex: 1, fontFamily: 'Matter-Regular', fontSize: 13.5, color: INK, lineHeight: 20 },
    urgencyStrong: { fontFamily: 'Matter-SemiBold' },

    field: { marginTop: 20 },
    fieldLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.2, color: MUTE, marginBottom: 8 },
    fieldLine: {
        flexDirection: 'row', alignItems: 'flex-start',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingBottom: 8,
    },
    fieldPrefix: { fontFamily: SERIF, fontSize: 18, color: SUB, marginRight: 2, lineHeight: 24 },
    input: { flex: 1, fontFamily: SERIF, fontSize: 18, color: INK, padding: 0, lineHeight: 24 },
    inputMulti: { minHeight: 66, textAlignVertical: 'top' },

    socialHint: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 26, marginBottom: -4 },

    error: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: DANGER, marginTop: 18, lineHeight: 19 },

    submit: {
        marginTop: 26, height: 54, borderRadius: 27, backgroundColor: INK,
        alignItems: 'center', justifyContent: 'center',
    },
    submitOff: { backgroundColor: 'rgba(0,0,0,0.28)' },
    submitText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: ON_INK, letterSpacing: 0.2 },
    fineprint: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, textAlign: 'center', marginTop: 14, lineHeight: 18 },

    // Confirmation
    confirm: { alignItems: 'center', paddingTop: 26, paddingBottom: 30, paddingHorizontal: 8 },
    confirmCheck: {
        width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
        backgroundColor: CARD, borderWidth: 1.5, borderColor: INK, marginBottom: 22,
    },
    confirmTitle: { fontFamily: SERIF, fontSize: 30, color: INK, letterSpacing: -0.6 },
    confirmBody: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, lineHeight: 23, textAlign: 'center', marginTop: 12, maxWidth: 300 },
    confirmStrong: { fontFamily: 'Matter-SemiBold', color: INK },
    confirmBtn: {
        marginTop: 28, height: 54, borderRadius: 27, backgroundColor: INK,
        alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
    },
    confirmBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: ON_INK, letterSpacing: 0.2 },
});

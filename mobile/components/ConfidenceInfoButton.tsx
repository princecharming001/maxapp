/**
 * ConfidenceInfoButton — a small "i" affordance shown next to an assistant
 * message when it carries per-method confidence. Tapping opens a bottom-anchored
 * popover listing each method with a confidence meter, a one-line rationale, and
 * any grounded sources. Additive + self-contained: renders nothing without
 * method metadata, so the chat baseline is untouched.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme/dark';
import type { MethodConfidence } from '../services/api';

const INK = colors.foreground;
const SUB = colors.textSecondary;
const MUTE = colors.textMuted;

function confColor(c: number): string {
    if (c >= 70) return '#2F9E60';   // green — well-supported
    if (c >= 40) return '#C29A4E';   // gold — mixed evidence
    return '#B4693B';                 // clay — speculative
}
function confLabel(c: number): string {
    if (c >= 70) return 'High';
    if (c >= 40) return 'Moderate';
    return 'Low';
}

export default function ConfidenceInfoButton({ methods }: { methods?: MethodConfidence[] | null }) {
    const [open, setOpen] = useState(false);
    if (!methods || methods.length === 0) return null;

    return (
        <>
            <TouchableOpacity
                onPress={() => setOpen(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Show confidence for these methods"
            >
                <Ionicons name="information-circle-outline" size={16} color={MUTE} />
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
                        <View style={s.grabber} />
                        <Text style={s.title}>How confident is this?</Text>
                        <Text style={s.sub}>Confidence reflects how strong the evidence is for each method.</Text>
                        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                            {methods.map((m, i) => {
                                const c = Math.max(0, Math.min(100, m.confidence ?? 0));
                                const col = confColor(c);
                                return (
                                    <View key={i} style={s.method}>
                                        <View style={s.methodTop}>
                                            <Text style={s.methodName}>{m.title}</Text>
                                            <Text style={[s.methodPct, { color: col }]}>{c}% · {confLabel(c)}</Text>
                                        </View>
                                        <View style={s.track}>
                                            <View style={[s.fill, { width: `${c}%`, backgroundColor: col }]} />
                                        </View>
                                        {m.rationale ? <Text style={s.rationale}>{m.rationale}</Text> : null}
                                        {m.sources && m.sources.length ? (
                                            <Text style={s.sources}>Sources: {m.sources.join(', ')}</Text>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <TouchableOpacity style={s.closeBtn} onPress={() => setOpen(false)} activeOpacity={0.85}>
                            <Text style={s.closeText}>Got it</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: '#F1F1EF', borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34,
    },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)', marginBottom: 14 },
    title: { fontFamily: fonts.serif, fontSize: 21, color: INK },
    sub: { fontFamily: fonts.sans, fontSize: 13, color: SUB, marginTop: 5, marginBottom: 14, lineHeight: 18 },
    method: { marginBottom: 16 },
    methodTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    methodName: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: INK },
    methodPct: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, marginLeft: 8 },
    track: { height: 7, borderRadius: 4, backgroundColor: '#E4E3E0', overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    rationale: { fontFamily: fonts.sans, fontSize: 12.5, color: SUB, marginTop: 6, lineHeight: 17 },
    sources: { fontFamily: fonts.sans, fontSize: 11, color: MUTE, marginTop: 4 },
    closeBtn: { marginTop: 6, height: 48, borderRadius: 24, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#FFFFFF' },
});

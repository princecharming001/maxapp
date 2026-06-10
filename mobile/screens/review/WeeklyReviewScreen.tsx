/**
 * Weekly review - "This week with Max" (spec 3.7). Completion hero framed by
 * what got DONE (never a miss ratio), the 7-day ring row, confirm-first
 * WHAT I LEARNED cards ([Yep] / [Not quite] - the ONLY way inference changes
 * the plan), and the standing promise in the footer.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassButton } from '../../components/glass/GlassButton';
import api from '../../services/api';

const INK = '#111113';
const GOLD = '#D4A017';
const MUTE = '#8A8A92';

export default function WeeklyReviewScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [answered, setAnswered] = useState<Record<string, boolean>>({});

    const reviewQ = useQuery({
        queryKey: ['weeklyReview'],
        queryFn: () => api.getWeeklyReview(),
    });

    const confirmMutation = useMutation({
        mutationFn: (c: { id: string; accepted: boolean; value?: string }) =>
            api.confirmWeeklyFacts([c]),
        onMutate: (c) => setAnswered((a) => ({ ...a, [c.id]: true })),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['weeklyReview'] }),
    });

    const data = reviewQ.data;
    const heroLine = data
        ? data.closed_count > 0
            ? `${data.closed_count} of ${Math.max(data.active_days, data.closed_count)} days closed`
            : 'A fresh week ahead'
        : '';
    const windowLine =
        data?.strongest_window === 'morning'
            ? 'Strongest in the morning. That is your slot.'
            : data?.strongest_window === 'midday'
              ? 'Strongest midday. That is your slot.'
              : data?.strongest_window === 'evening'
                ? 'Strongest right after dinner. That is your slot.'
                : 'Close a few days and Max finds your slot.';

    const openFacts = (data?.facts ?? []).filter((f) => !answered[f.id]);

    return (
        <ScreenBackdrop>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingTop: insets.top + 16,
                    paddingHorizontal: 22,
                    paddingBottom: insets.bottom + 32,
                }}
                showsVerticalScrollIndicator={false}
            >
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    style={{ alignSelf: 'flex-start' }}
                >
                    <Ionicons name="arrow-back" size={22} color={INK} />
                </TouchableOpacity>

                <Text style={styles.kicker}>THIS WEEK WITH MAX</Text>
                <Text style={styles.title}>You showed up</Text>

                <GlassCard radius={24} intensity={40} style={{ marginTop: 14 }}>
                    <View style={{ padding: 18 }}>
                        <Text style={styles.weekBig}>{heroLine}</Text>
                        <Text style={styles.sub}>{windowLine}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                            {(data?.days ?? []).map((d) => (
                                <View
                                    key={d.date}
                                    style={[styles.dayRing, d.closed && { borderColor: GOLD }]}
                                    accessibilityLabel={`${d.weekday}${d.closed ? ', closed' : ''}`}
                                >
                                    <Text style={[styles.dayRingText, d.closed && { color: GOLD }]}>
                                        {d.weekday[0]}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </GlassCard>

                {openFacts.length > 0 ? (
                    <>
                        <Text style={styles.label}>WHAT I LEARNED ABOUT YOU</Text>
                        <View style={{ gap: 10, marginTop: 8 }}>
                            {openFacts.map((f) => (
                                <GlassCard key={f.id} radius={18} intensity={32}>
                                    <View style={{ padding: 14 }}>
                                        <Text style={styles.factText}>{f.text}</Text>
                                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                                            <View style={{ flex: 1 }}>
                                                <GlassButton
                                                    variant="primary"
                                                    label="Yep"
                                                    onPress={() =>
                                                        confirmMutation.mutate({
                                                            id: f.id,
                                                            accepted: true,
                                                            value: f.value,
                                                        })
                                                    }
                                                />
                                            </View>
                                            <GlassButton
                                                variant="glass"
                                                label="Not quite"
                                                style={{ width: 130 }}
                                                onPress={() =>
                                                    confirmMutation.mutate({
                                                        id: f.id,
                                                        accepted: false,
                                                        value: f.value,
                                                    })
                                                }
                                            />
                                        </View>
                                    </View>
                                </GlassCard>
                            ))}
                        </View>
                    </>
                ) : null}

                <Text style={styles.fineNote}>
                    I never change your plan without asking.
                </Text>
            </ScrollView>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: GOLD, marginTop: 18 },
    title: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 32, color: INK, letterSpacing: -0.5, marginTop: 6 },
    weekBig: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 26, color: INK },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14, color: MUTE, marginTop: 6, lineHeight: 21 },
    label: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.4, color: MUTE, marginTop: 22 },
    factText: { fontFamily: 'Matter-Medium', fontSize: 15, color: INK, lineHeight: 21 },
    fineNote: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 18, lineHeight: 18, textAlign: 'center' },
    dayRing: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2.5,
        borderColor: 'rgba(17,17,19,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayRingText: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: INK },
});

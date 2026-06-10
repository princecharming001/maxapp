/**
 * Day setup - calendar busy blocks + places (the Life Model's stated inputs).
 *
 * Calendar v1 semantics (spec 4.8): the DEVICE is the calendar source.
 * On iOS this screen will read EventKit on-device and push busy projections
 * to /planner/signals; on web (and until the native rebuild) the user adds
 * busy blocks by hand - same endpoint, same projection, honest copy.
 * Places are address-first typed entries; geofences join in the location
 * phase. Nothing here leaves the user's account.
 */
import React, { useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
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

const PLACE_KINDS = [
    { kind: 'home', label: 'Home', icon: 'home-outline' },
    { kind: 'work', label: 'Work', icon: 'briefcase-outline' },
    { kind: 'gym', label: 'Gym', icon: 'barbell-outline' },
    { kind: 'grocery', label: 'Grocery', icon: 'cart-outline' },
] as const;

function fmt12(hhmm?: string): string {
    if (!hhmm || !hhmm.includes(':')) return '';
    const [hs, ms] = hhmm.split(':');
    let h = parseInt(hs, 10);
    const suffix = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}:${ms}${suffix}`;
}

function StepTime({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) {
    const hh = String(Math.floor(value / 60)).padStart(2, '0');
    const mm = String(value % 60).padStart(2, '0');
    return (
        <View style={styles.stepRow}>
            <Text style={styles.stepLabel}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => onChange((value - 30 + 1440) % 1440)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 30 minutes earlier`}
                >
                    <Ionicons name="remove" size={16} color={INK} />
                </TouchableOpacity>
                <Text style={styles.stepValue}>{fmt12(`${hh}:${mm}`)}</Text>
                <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => onChange((value + 30) % 1440)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 30 minutes later`}
                >
                    <Ionicons name="add" size={16} color={INK} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function DaySetupScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const [blockTitle, setBlockTitle] = useState('');
    const [startMin, setStartMin] = useState(13 * 60);
    const [endMin, setEndMin] = useState(14 * 60);
    const [placeName, setPlaceName] = useState('');
    const [placeKind, setPlaceKind] = useState<string>('gym');
    const [note, setNote] = useState<string | null>(null);

    const todayQ = useQuery({ queryKey: ['plannerToday'], queryFn: () => api.getPlannerToday() });
    const placesQ = useQuery({ queryKey: ['plannerPlaces'], queryFn: () => api.getPlaces() });

    const calendarRows = (todayQ.data?.structure ?? []).filter((s) => s.source === 'calendar');

    const addBlock = useMutation({
        mutationFn: () => {
            const today = new Date().toISOString().slice(0, 10);
            const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
            return api.pushPlannerSignals({
                calendar: {
                    provider: 'manual',
                    events: [
                        {
                            starts_at: `${today}T${hh(startMin)}`,
                            ends_at: `${today}T${hh(endMin >= startMin ? endMin : startMin + 30)}`,
                            title: blockTitle.trim() || 'Busy',
                        },
                    ],
                },
            });
        },
        onSuccess: () => {
            setBlockTitle('');
            setNote('Added. Max plans around it.');
            setTimeout(() => setNote(null), 2500);
            queryClient.invalidateQueries({ queryKey: ['plannerToday'] });
        },
    });

    const addPlaceMutation = useMutation({
        mutationFn: () => api.addPlace(placeName.trim(), placeKind),
        onSuccess: () => {
            setPlaceName('');
            queryClient.invalidateQueries({ queryKey: ['plannerPlaces'] });
        },
    });
    const removePlaceMutation = useMutation({
        mutationFn: (id: string) => api.removePlace(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plannerPlaces'] }),
    });

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

                <Text style={styles.title}>Your real day</Text>
                <Text style={styles.sub}>
                    Max stops scheduling over your life when it knows what your day
                    actually holds.
                </Text>

                {/* calendar */}
                <Text style={styles.label}>TODAY'S BUSY BLOCKS</Text>
                <GlassCard radius={20} style={{ marginTop: 8 }}>
                    <View style={{ padding: 16 }}>
                        {Platform.OS === 'ios' ? (
                            <View style={styles.deviceNote}>
                                <Ionicons name="logo-apple" size={14} color={MUTE} />
                                <Text style={styles.deviceNoteText}>
                                    Apple Calendar sync arrives with the next app update.
                                    Reads stay on your phone.
                                </Text>
                            </View>
                        ) : null}
                        {calendarRows.length ? (
                            calendarRows.map((r, i) => (
                                <View key={i} style={styles.blockRow}>
                                    <Ionicons name="time-outline" size={15} color={MUTE} />
                                    <Text style={styles.blockText}>
                                        {r.label}  ·  {fmt12(r.time)}
                                        {r.end ? ` to ${fmt12(r.end)}` : ''}
                                    </Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.emptyText}>Nothing blocked yet today.</Text>
                        )}

                        <View style={styles.hairline} />
                        <TextInput
                            placeholder="What's the block? (meeting, class, dinner)"
                            placeholderTextColor="#9A9AA2"
                            value={blockTitle}
                            onChangeText={setBlockTitle}
                            style={styles.input}
                            accessibilityLabel="Busy block name"
                        />
                        <StepTime label="From" value={startMin} onChange={setStartMin} />
                        <StepTime label="To" value={endMin} onChange={setEndMin} />
                        <View style={{ marginTop: 10 }}>
                            <GlassButton
                                variant="primary"
                                label="Add busy block"
                                loading={addBlock.isPending}
                                onPress={() => addBlock.mutate()}
                            />
                        </View>
                        {note ? <Text style={styles.note}>{note}</Text> : null}
                    </View>
                </GlassCard>

                {/* places */}
                <Text style={styles.label}>YOUR PLACES</Text>
                <Text style={styles.subSmall}>
                    So Max can time things to where you are. Addresses only, nothing tracked.
                </Text>
                <GlassCard radius={20} style={{ marginTop: 8 }}>
                    <View style={{ padding: 16 }}>
                        {(placesQ.data?.places ?? []).map((p) => (
                            <View key={p.id} style={styles.blockRow}>
                                <Ionicons
                                    name={(PLACE_KINDS.find((k) => k.kind === p.kind)?.icon as any) || 'location-outline'}
                                    size={15}
                                    color={GOLD}
                                />
                                <Text style={[styles.blockText, { flex: 1 }]}>
                                    {p.name}
                                    <Text style={{ color: MUTE }}>  ·  {p.kind}</Text>
                                </Text>
                                <TouchableOpacity
                                    onPress={() => removePlaceMutation.mutate(p.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${p.name}`}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="close" size={16} color={MUTE} />
                                </TouchableOpacity>
                            </View>
                        ))}
                        {!placesQ.data?.places?.length ? (
                            <Text style={styles.emptyText}>No places yet.</Text>
                        ) : null}

                        <View style={styles.hairline} />
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            {PLACE_KINDS.map((k) => (
                                <TouchableOpacity
                                    key={k.kind}
                                    style={[styles.kindChip, placeKind === k.kind && styles.kindChipActive]}
                                    onPress={() => setPlaceKind(k.kind)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: placeKind === k.kind }}
                                    accessibilityLabel={k.label}
                                >
                                    <Ionicons name={k.icon as any} size={13} color={placeKind === k.kind ? '#8a6a10' : MUTE} />
                                    <Text style={[styles.kindChipText, placeKind === k.kind && { color: '#8a6a10' }]}>
                                        {k.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TextInput
                            placeholder="Name or address (e.g. Equinox Bay St)"
                            placeholderTextColor="#9A9AA2"
                            value={placeName}
                            onChangeText={setPlaceName}
                            style={styles.input}
                            accessibilityLabel="Place name"
                        />
                        <View style={{ marginTop: 10 }}>
                            <GlassButton
                                variant="glass"
                                label="Add place"
                                disabled={!placeName.trim()}
                                loading={addPlaceMutation.isPending}
                                onPress={() => addPlaceMutation.mutate()}
                            />
                        </View>
                    </View>
                </GlassCard>

                <Text style={styles.fineNote}>
                    Location reminders ("you're at the gym") arrive with the next app
                    update and ask for permission only when you turn them on.
                </Text>
            </ScrollView>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    title: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 32, color: INK, letterSpacing: -0.5, marginTop: 16 },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, marginTop: 8, lineHeight: 21 },
    subSmall: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 4 },
    label: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.4, color: MUTE, marginTop: 24 },
    deviceNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    deviceNoteText: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, flex: 1 },
    blockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, minHeight: 32 },
    blockText: { fontFamily: 'Matter-Medium', fontSize: 14, color: INK },
    emptyText: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, paddingVertical: 4 },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(17,17,19,0.1)', marginVertical: 12 },
    input: {
        height: 46,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderWidth: 1,
        borderColor: 'rgba(17,17,19,0.08)',
        paddingHorizontal: 14,
        fontFamily: 'Matter-Regular',
        fontSize: 14,
        color: INK,
        marginTop: 10,
    },
    stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    stepLabel: { fontFamily: 'Matter-Medium', fontSize: 14, color: INK },
    stepBtn: {
        width: 30, height: 30, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.85)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(17,17,19,0.08)',
    },
    stepValue: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: INK, width: 72, textAlign: 'center' },
    kindChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', minHeight: 32,
    },
    kindChipActive: { borderColor: GOLD, backgroundColor: 'rgba(212,160,23,0.12)' },
    kindChipText: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: '#3A3A3F' },
    note: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: '#3D8B4F', marginTop: 8, textAlign: 'center' },
    fineNote: { fontFamily: 'Matter-Regular', fontSize: 12, color: MUTE, marginTop: 16, lineHeight: 18, textAlign: 'center' },
});

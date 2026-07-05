/**
 * RanksScreen — "The Ascension". The full rank ladder (Mortal → Olympian), each
 * with its ivory-marble 3D icon and level threshold. The user's current rank is
 * highlighted with a gold ring + progress; future ranks sit dimmed until earned.
 * Reached from tapping the rank icon on the Profile XP card.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { fonts } from '../../theme/dark';
import { useGamificationQuery } from '../../hooks/useAppQueries';

const INK = '#111113';
const SUB = '#6B6B6B';
const MUTE = '#9A9A9A';
const BG = '#F1F1EF';
const CARD = '#FFFFFF';
const GOLD = '#C29A4E';
const TRACK = '#E4E3E0';

// Mirrors backend RANKS + xp_for_level (services/gamification.py).
const LADDER = [
    { name: 'Mortal', minLevel: 1, icon: require('../../assets/ranks/mortal.webp'), line: 'Everyone starts here.' },
    { name: 'Aspirant', minLevel: 10, icon: require('../../assets/ranks/aspirant.webp'), line: 'The fire is lit.' },
    { name: 'Champion', minLevel: 25, icon: require('../../assets/ranks/champion.webp'), line: 'Proven in the arena.' },
    { name: 'Hero', minLevel: 40, icon: require('../../assets/ranks/hero.webp'), line: 'Songs get written.' },
    { name: 'Demigod', minLevel: 60, icon: require('../../assets/ranks/demigod.webp'), line: 'Half of you is legend.' },
    { name: 'Titan', minLevel: 80, icon: require('../../assets/ranks/titan.webp'), line: 'You hold up worlds.' },
    { name: 'Olympian', minLevel: 100, icon: require('../../assets/ranks/olympian.webp'), line: 'The summit.' },
];

export default function RanksScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const gamif = useGamificationQuery().data;
    const level = gamif?.current_level ?? 1;
    const currentIdx = (() => {
        let idx = 0;
        LADDER.forEach((r, i) => { if (level >= r.minLevel) idx = i; });
        return idx;
    })();

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle}>The Ascension</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
                <Text style={s.sub}>Earn XP by showing up — every rank is climbed, never given.</Text>

                {LADDER.map((r, i) => {
                    const isCurrent = i === currentIdx;
                    const isPassed = i < currentIdx;
                    const isLocked = i > currentIdx;
                    const next = LADDER[i + 1];
                    const levelRange = next ? `Level ${r.minLevel}–${next.minLevel - 1}` : `Level ${r.minLevel}`;
                    return (
                        <View key={r.name} style={[s.row, isCurrent && s.rowCurrent, isLocked && s.rowLocked]}>
                            <View style={[s.iconWrap, isCurrent && s.iconWrapCurrent]}>
                                <Image source={r.icon} style={[s.icon, isLocked && { opacity: 0.35 }]} contentFit="contain" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={s.nameRow}>
                                    <Text style={[s.name, isLocked && { color: MUTE }]}>{r.name}</Text>
                                    {isPassed ? <Ionicons name="checkmark-circle" size={15} color={GOLD} /> : null}
                                    {isCurrent ? (
                                        <View style={s.youPill}><Text style={s.youText}>YOU</Text></View>
                                    ) : null}
                                </View>
                                <Text style={[s.range, isLocked && { color: '#B9B6B0' }]}>{levelRange}</Text>
                                <Text style={[s.line, isLocked && { color: '#B9B6B0' }]}>{r.line}</Text>
                                {isCurrent && gamif && !gamif.is_max_level ? (
                                    <View style={s.progressWrap}>
                                        <View style={s.barTrack}>
                                            <View style={[s.barFill, {
                                                width: `${Math.max(0, Math.min(1, gamif.xp_for_next_level > 0 ? gamif.xp_into_level / gamif.xp_for_next_level : 0)) * 100}%`,
                                            }]} />
                                        </View>
                                        <Text style={s.progressText}>
                                            Level {gamif.current_level} · {gamif.xp_into_level.toLocaleString()} / {gamif.xp_for_next_level.toLocaleString()} XP
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.serif, fontSize: 20, color: INK },
    sub: { fontFamily: fonts.sans, fontSize: 13.5, color: SUB, textAlign: 'center', marginTop: 8, marginBottom: 18, lineHeight: 19 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: CARD, borderRadius: 18, borderCurve: 'continuous',
        padding: 14, marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)',
    },
    rowCurrent: { borderWidth: 1.5, borderColor: GOLD },
    rowLocked: { backgroundColor: 'rgba(255,255,255,0.55)' },
    iconWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    iconWrapCurrent: { transform: [{ scale: 1.08 }] },
    icon: { width: 60, height: 60 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    name: { fontFamily: fonts.serif, fontSize: 20, color: INK, letterSpacing: -0.2 },
    youPill: { backgroundColor: 'rgba(194,154,78,0.16)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5 },
    youText: { fontFamily: fonts.sansSemiBold, fontSize: 9.5, color: '#8A6D2E', letterSpacing: 1 },
    range: { fontFamily: fonts.sansMedium, fontSize: 12, color: SUB, marginTop: 2 },
    line: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2 },
    progressWrap: { marginTop: 9 },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: TRACK, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: GOLD },
    progressText: { fontFamily: fonts.sans, fontSize: 11.5, color: MUTE, marginTop: 6 },
});

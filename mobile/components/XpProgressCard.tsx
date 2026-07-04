/**
 * XpProgressCard — the primary XP + rank surface (Profile). Shows the earned
 * RANK, current level, a progress bar toward the next level, and today's XP.
 * Craft palette: cream card, ink text, muted-gold progress fill. Renders nothing
 * until the gamification block loads (cold-start invisible), matching the app's
 * quiet-reward taste (no confetti, no fawning).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/dark';
import type { Gamification } from '../services/api';

const INK = '#111113';
const SUB = '#6B6B6B';
const MUTE = '#9A9A9A';
const CARD = '#F1F1EF';
const TRACK = '#E4E3E0';
const GOLD = '#C29A4E'; // muted editorial gold

export default function XpProgressCard({ data }: { data: Gamification | null | undefined }) {
    if (!data) return null;

    const { current_level, rank, xp_into_level, xp_for_next_level, xp_earned_today, is_max_level } = data;
    const pct = is_max_level
        ? 1
        : Math.max(0, Math.min(1, xp_for_next_level > 0 ? xp_into_level / xp_for_next_level : 0));

    return (
        <View style={s.card}>
            <View style={s.topRow}>
                <View style={{ flex: 1 }}>
                    <Text style={s.rank}>{rank}</Text>
                    <Text style={s.level}>Level {current_level}</Text>
                </View>
                {xp_earned_today > 0 ? (
                    <View style={s.todayPill}>
                        <Text style={s.todayPillText}>+{xp_earned_today.toLocaleString()} XP today</Text>
                    </View>
                ) : null}
            </View>

            <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${pct * 100}%` }]} />
            </View>

            <Text style={s.progressText}>
                {is_max_level
                    ? 'Max rank reached'
                    : `${xp_into_level.toLocaleString()} / ${xp_for_next_level.toLocaleString()} XP to level ${current_level + 1}`}
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: CARD,
        borderRadius: 18,
        borderCurve: 'continuous',
        paddingHorizontal: 18,
        paddingVertical: 18,
        marginBottom: 14,
    },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
    rank: { fontFamily: fonts.serif, fontSize: 24, color: INK, letterSpacing: -0.3 },
    level: { fontFamily: fonts.sansMedium, fontSize: 13, color: SUB, marginTop: 3, letterSpacing: 0.2 },
    todayPill: {
        backgroundColor: 'rgba(194,154,78,0.14)',
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 5,
    },
    todayPillText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: '#8A6D2E' },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: TRACK, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4, backgroundColor: GOLD },
    progressText: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 9 },
});

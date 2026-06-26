/**
 * StreakMilestoneCallout — a quiet, one-line micro-celebration that appears
 * exactly once when a user's streak first reaches 3 / 7 / 30 / 100 days.
 *
 * Taste bar: accountability with warmth, never fawning. It names the specific
 * streak the way a coach who's been watching would — no modal, no confetti,
 * no hollow "Great job!". Persona-flavored via toneCopy. Shows once per
 * threshold (persisted), and renders nothing on non-milestone days or when the
 * personalizedUI flag is off — so it's cold-start invisible.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useFlag } from '../constants/featureFlags';
import { usePersonalization } from '../hooks/usePersonalization';
import { streakMilestone, streakMilestoneCopy } from '../lib/personalization';
import { colors, fonts } from '../theme/dark';

const SEEN_KEY = 'streak_milestone_seen_v1';

async function loadSeen(): Promise<number[]> {
    try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
    } catch {
        return [];
    }
}

async function markSeen(threshold: number): Promise<void> {
    try {
        const seen = await loadSeen();
        if (!seen.includes(threshold)) {
            await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, threshold]));
        }
    } catch {
        /* non-fatal — worst case the callout shows again next time */
    }
}

export function StreakMilestoneCallout() {
    const enabled = useFlag('personalizedUI');
    const { streakDays, personaId } = usePersonalization();
    const milestone = streakMilestone(streakDays);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!enabled || milestone == null) {
            setVisible(false);
            return;
        }
        let active = true;
        void (async () => {
            const seen = await loadSeen();
            if (seen.includes(milestone)) {
                if (active) setVisible(false);
                return;
            }
            await markSeen(milestone);
            if (active) setVisible(true);
        })();
        return () => {
            active = false;
        };
    }, [enabled, milestone]);

    if (!enabled || milestone == null || !visible) return null;

    return (
        <View style={styles.row} accessibilityRole="text">
            <View style={styles.tick} />
            <Text style={styles.text}>{streakMilestoneCopy(personaId, milestone)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
    },
    tick: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.foreground,
    },
    text: {
        flex: 1,
        fontSize: 13.5,
        fontFamily: fonts.serif,
        color: colors.foreground,
        letterSpacing: -0.2,
        lineHeight: 18,
    },
});

export default StreakMilestoneCallout;

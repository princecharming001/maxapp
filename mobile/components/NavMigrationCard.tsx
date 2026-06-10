/**
 * One-time migration card (spec 3.1) shown on Today after the 4-tab update.
 * Dismissible, never a forced tour. Renders nothing unless the newNav flag is
 * on and the user hasn't dismissed it. Pulls the real streak number into copy.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { GlassCard } from './glass/GlassCard';
import { useFlag } from '../constants/featureFlags';
import api from '../services/api';

const DISMISS_KEY = 'max.navMigrationCard.dismissed';

export default function NavMigrationCard() {
    const newNav = useFlag('newNav');
    const [dismissed, setDismissed] = useState<boolean | null>(null);

    useEffect(() => {
        AsyncStorage.getItem(DISMISS_KEY)
            .then((v) => setDismissed(v === '1'))
            .catch(() => setDismissed(false));
    }, []);

    const { data: schedData } = useQuery({
        queryKey: ['activeSchedulesFull'],
        queryFn: () => api.getActiveSchedulesFull(),
        staleTime: 60_000,
        enabled: newNav && dismissed === false,
    });

    if (!newNav || dismissed !== false) return null;

    const streak = schedData?.schedule_streak?.current ?? 0;
    const streakLine =
        streak > 0
            ? `Your plan, your ${streak}-day streak, and your scans are safe.`
            : 'Your plan, streak, and scans are safe.';

    const dismiss = () => {
        setDismissed(true);
        AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => {});
    };

    return (
        <View style={styles.wrap}>
            <GlassCard radius={20}>
            <View style={styles.inner}>
                <View style={styles.textWrap}>
                    <Text style={styles.title}>New layout, same plan</Text>
                    <Text style={styles.body}>
                        {streakLine} Schedule is now Today. The week editor lives in You.
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={dismiss}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.close}
                >
                    <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
            </View>
            </GlassCard>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginHorizontal: 16, marginBottom: 12 },
    inner: { flexDirection: 'row', padding: 16, alignItems: 'flex-start' },
    textWrap: { flex: 1 },
    title: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 15,
        color: '#111113',
    },
    body: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        lineHeight: 19,
        color: '#6B7280',
        marginTop: 3,
    },
    close: { marginLeft: 10, padding: 2 },
});

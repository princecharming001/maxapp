import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fonts } from '../../theme/dark';

/**
 * "reminders are off" — Home's quiet inline card for a user whose OS
 * notification permission is DENIED. iOS never re-shows its prompt after a
 * denial, so the only way back is iOS Settings; without this the app never
 * told anyone their reminders weren't coming. Dismissible (snoozed 7 days by
 * hooks/useNotificationNudges).
 */

type Props = {
    onOpenSettings: () => void;
    onDismiss: () => void;
};

export default function RemindersOffCard({ onOpenSettings, onDismiss }: Props) {
    return (
        <View style={s.card} testID="reminders-off-card">
            <View style={s.head}>
                <Ionicons name="notifications-off-outline" size={18} color={colors.foreground} style={s.icon} />
                <View style={s.copy}>
                    <Text style={s.title}>reminders are off</Text>
                    <Text style={s.body}>max can{'’'}t ping you at your task times.</Text>
                </View>
                <TouchableOpacity
                    onPress={onDismiss}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                    testID="reminders-off-dismiss"
                >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            </View>
            <TouchableOpacity
                style={s.button}
                onPress={onOpenSettings}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Turn on in Settings"
                testID="reminders-off-open-settings"
            >
                <Text style={s.buttonText}>turn on in settings</Text>
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        marginHorizontal: 24,
        marginTop: 22,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 14,
        borderRadius: borderRadius.lg,
        borderCurve: 'continuous',
        backgroundColor: colors.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    icon: { marginTop: 1 },
    copy: { flex: 1, minWidth: 0 },
    title: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground, letterSpacing: -0.2 },
    body: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
    button: {
        alignSelf: 'flex-start',
        marginTop: 12,
        marginLeft: 30,
        backgroundColor: colors.foreground,
        borderRadius: borderRadius.full,
        paddingHorizontal: 16,
        paddingVertical: 9,
    },
    buttonText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.buttonText },
});

/**
 * GlassButton - the CTA primitive for the glassy iOS-native aesthetic.
 *
 * Variants:
 *   primary - solid ink fill, white label (the main action)
 *   glass   - frosted translucent fill with hairline border (secondary)
 *   ghost   - no surface, muted underlined label (tertiary / text link)
 *
 * Built on TouchableOpacity so async handlers, disabled, and loading
 * (ActivityIndicator) behave exactly like the rest of the app.
 */
import React from 'react';
import {
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    Text,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { View } from 'tamagui';

type Variant = 'primary' | 'glass' | 'ghost';

export function GlassButton({
    label,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    style,
}: {
    label: string;
    onPress?: () => void;
    variant?: Variant;
    loading?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const radius = 16;
    const isGhost = variant === 'ghost';
    const textColor = variant === 'primary' ? '#FFFFFF' : isGhost ? '#6B7280' : '#111113';

    const content = (
        <View
            height={isGhost ? 44 : 54}
            alignItems="center"
            justifyContent="center"
            paddingHorizontal={20}
            borderRadius={radius}
            style={{ borderCurve: 'continuous' }}
        >
            {loading ? (
                <ActivityIndicator color={textColor} />
            ) : (
                <Text style={[styles.label, { color: textColor }, isGhost && styles.ghostLabel]}>
                    {label}
                </Text>
            )}
        </View>
    );

    if (variant === 'glass') {
        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={onPress}
                disabled={disabled || loading}
                style={[styles.shadow, style]}
            >
                <View
                    borderRadius={radius}
                    overflow="hidden"
                    borderWidth={1}
                    borderColor="$glassBorder"
                    style={{ borderCurve: 'continuous' }}
                >
                    <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
                    <View backgroundColor="$glassStrong">{content}</View>
                </View>
            </TouchableOpacity>
        );
    }

    if (isGhost) {
        return (
            <TouchableOpacity
                activeOpacity={0.6}
                onPress={onPress}
                disabled={disabled || loading}
                style={style}
            >
                {content}
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            disabled={disabled || loading}
            style={[styles.shadow, style]}
        >
            <View backgroundColor="$ink" borderRadius={radius} style={{ borderCurve: 'continuous' }}>
                {content}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    label: { fontFamily: 'Matter-SemiBold', fontSize: 15, letterSpacing: 0.3 },
    ghostLabel: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        letterSpacing: 0.2,
        textDecorationLine: 'underline',
    },
    shadow: {
        shadowColor: '#0B1220',
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
    },
});

export default GlassButton;

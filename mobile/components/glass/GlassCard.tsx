/**
 * GlassCard - frosted translucent surface for the glassy iOS-native aesthetic.
 *
 * Two-layer construction: an outer view carries the soft drop shadow (needs
 * overflow visible), an inner view clips the blur to the rounded shape
 * (overflow hidden). borderCurve 'continuous' gives the iOS squircle corner.
 * Pair with a gradient/orb backdrop so the frost has depth to refract.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { View } from 'tamagui';

type GlassCardProps = React.ComponentProps<typeof View> & {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    radius?: number;
};

export function GlassCard({
    children,
    intensity = 38,
    tint = 'light',
    radius = 26,
    ...rest
}: GlassCardProps) {
    return (
        <View
            borderRadius={radius}
            shadowColor="#0B1220"
            shadowOpacity={0.12}
            shadowRadius={24}
            shadowOffset={{ width: 0, height: 16 }}
            style={{ borderCurve: 'continuous' }}
            {...rest}
        >
            <View
                borderRadius={radius}
                overflow="hidden"
                borderWidth={1}
                borderColor="$glassBorder"
                style={{ borderCurve: 'continuous' }}
            >
                <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
                <View backgroundColor="$glass">{children}</View>
            </View>
        </View>
    );
}

export default GlassCard;

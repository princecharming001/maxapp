/**
 * GlassCard - a flat paper surface (Craft aesthetic). Despite the legacy name
 * there is no glass: a white card on a warm hairline border with a whisper-soft
 * shadow. The `intensity`/`tint` props are kept as no-ops for API compat so no
 * caller has to change.
 *
 * Two layers: the outer view carries the shadow (needs overflow visible); the
 * inner view clips content to the rounded shape. borderCurve 'continuous'
 * gives the iOS squircle corner.
 */
import React from 'react';
import { View } from 'tamagui';

type GlassCardProps = React.ComponentProps<typeof View> & {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    radius?: number;
};

export function GlassCard({
    children,
    intensity: _intensity,
    tint: _tint,
    radius = 18,
    ...rest
}: GlassCardProps) {
    return (
        <View
            borderRadius={radius}
            shadowColor="#2E2A20"
            shadowOpacity={0.07}
            shadowRadius={18}
            shadowOffset={{ width: 0, height: 8 }}
            style={{ borderCurve: 'continuous' }}
            {...rest}
        >
            <View
                backgroundColor="$glass"
                borderRadius={radius}
                overflow="hidden"
                borderWidth={1}
                borderColor="$glassBorder"
                style={{ borderCurve: 'continuous' }}
            >
                {children}
            </View>
        </View>
    );
}

export default GlassCard;

/**
 * A11yBlurView - legacy name; in the Craft aesthetic there is no blur. This is
 * now a flat paper fill (light) or flat ink fill (dark) used as a soft layer
 * behind content for legibility. Drop-in for the old BlurView usage.
 */
import React from 'react';
import { View } from 'react-native';
import { type BlurViewProps } from 'expo-blur';

const LIGHT_FILL = 'rgba(250,249,246,0.86)';  // warm paper wash
const DARK_FILL = 'rgba(28,26,23,0.90)';      // warm ink

export function A11yBlurView({ tint = 'light', style, children, ...rest }: BlurViewProps) {
    const backgroundColor = tint === 'dark' ? DARK_FILL : LIGHT_FILL;
    return (
        <View style={[style, { backgroundColor }]} {...(rest as object)}>
            {children}
        </View>
    );
}

export default A11yBlurView;

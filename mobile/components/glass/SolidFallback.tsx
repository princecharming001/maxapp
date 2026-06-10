/**
 * A11yBlurView - drop-in replacement for expo-blur's BlurView that honors the
 * OS reduce-transparency setting: blur normally, a >=90% opaque solid fill
 * when the user asks for reduced transparency. Use this (never raw BlurView)
 * on any screen-level glass surface.
 */
import React from 'react';
import { View } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { useReduceTransparency } from '../../hooks/useA11y';

const LIGHT_FILL = 'rgba(255,255,255,0.94)';
const DARK_FILL = 'rgba(17,17,19,0.94)';

export function A11yBlurView({ tint = 'light', style, children, ...rest }: BlurViewProps) {
    const reduceTransparency = useReduceTransparency();
    if (reduceTransparency) {
        const backgroundColor = tint === 'dark' ? DARK_FILL : LIGHT_FILL;
        return (
            <View style={[style, { backgroundColor }]} {...(rest as object)}>
                {children}
            </View>
        );
    }
    return (
        <BlurView tint={tint} style={style} {...rest}>
            {children}
        </BlurView>
    );
}

export default A11yBlurView;

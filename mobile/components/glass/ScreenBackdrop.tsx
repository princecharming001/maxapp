/**
 * ScreenBackdrop - the shared backdrop for every screen.
 *
 * Craft aesthetic: flat warm paper. No gradient, no glow orbs, no blur veil -
 * just a calm cream canvas that lets the flat surfaces and generous whitespace
 * do the work. Render screen content as children.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

export const CRAFT_CANVAS = '#F7F0EA';

export function ScreenBackdrop({
    children,
    style,
}: {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    return <View style={[styles.root, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: CRAFT_CANVAS },
});

export default ScreenBackdrop;

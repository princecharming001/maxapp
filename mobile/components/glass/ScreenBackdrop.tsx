import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

export const CRAFT_CANVAS = '#F5F5F5';

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

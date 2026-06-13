/**
 * GlassInput - flat paper text field (Craft aesthetic). White fill, warm
 * hairline border, squircle corners. No blur.
 */
import React from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { View } from 'tamagui';

export function GlassInput({ style, ...props }: TextInputProps) {
    return (
        <View
            backgroundColor="$glassStrong"
            borderRadius={14}
            overflow="hidden"
            borderWidth={1}
            borderColor="$glassBorder"
            style={{ borderCurve: 'continuous' }}
        >
            <TextInput placeholderTextColor="#97928A" style={[styles.input, style]} {...props} />
        </View>
    );
}

const styles = StyleSheet.create({
    input: {
        height: 52,
        paddingHorizontal: 16,
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: '#1C1A17',
    },
});

export default GlassInput;

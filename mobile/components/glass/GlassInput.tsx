/**
 * GlassInput - frosted text field for the glassy iOS-native aesthetic.
 * Translucent fill + hairline border + squircle corners over a blur layer.
 */
import React from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { View } from 'tamagui';

export function GlassInput({ style, ...props }: TextInputProps) {
    return (
        <View
            borderRadius={16}
            overflow="hidden"
            borderWidth={1}
            borderColor="$glassBorder"
            style={{ borderCurve: 'continuous' }}
        >
            <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
            <View backgroundColor="$glassStrong">
                <TextInput placeholderTextColor="#9A9AA2" style={[styles.input, style]} {...props} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    input: {
        height: 54,
        paddingHorizontal: 16,
        fontFamily: 'Matter-Regular',
        fontSize: 15,
        color: '#111113',
    },
});

export default GlassInput;

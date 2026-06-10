/**
 * ScreenBackdrop - the shared glassy backdrop for every redesigned screen.
 *
 * Soft vertical gradient + a warm gold glow and a cool blue glow, veiled by a
 * light blur so the orbs read as ambient light rather than hard circles. This
 * is what gives the frosted glass surfaces above something to refract. Render
 * screen content as children; it sits above the veil and stays crisp.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export function ScreenBackdrop({
    children,
    style,
}: {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    return (
        <View style={[styles.root, style]}>
            <LinearGradient
                colors={['#F7F8FC', '#E9ECF2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={[styles.orb, styles.orbGold]} />
            <View pointerEvents="none" style={[styles.orb, styles.orbBlue]} />
            <BlurView pointerEvents="none" intensity={50} tint="light" style={StyleSheet.absoluteFill} />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F7F8FC' },
    orb: { position: 'absolute', width: 380, height: 380, borderRadius: 190 },
    orbGold: { backgroundColor: 'rgba(212,160,23,0.42)', top: -90, right: -70 },
    orbBlue: { backgroundColor: 'rgba(120,150,205,0.40)', bottom: 20, left: -100 },
});

export default ScreenBackdrop;

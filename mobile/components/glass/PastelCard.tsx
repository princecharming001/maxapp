/**
 * PastelCard — Craft-style soft pastel feature card. A rounded, gently-shadowed
 * tile washed in a calm pastel gradient (lavender / blue / green / peach), the
 * way Craft.do frames its feature and "how people use it" sections. Use it on
 * marketing / hero surfaces (Landing, reveal, section intros) — NOT on the dense
 * daily screens, which stay calm white-on-cream.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type PastelTone = 'lavender' | 'blue' | 'green' | 'peach';

const TONES: Record<PastelTone, [string, string]> = {
    lavender: ['#ECE9FB', '#D8D2F3'],
    blue: ['#E3EFFB', '#C8DFF6'],
    green: ['#E1F1E4', '#CAE6D0'],
    peach: ['#FBEEE0', '#F6DDC6'],
};

export function PastelCard({
    tone = 'lavender',
    radius = 24,
    children,
    style,
}: {
    tone?: PastelTone;
    radius?: number;
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const [a, b] = TONES[tone];
    return (
        <View style={[styles.shadow, { borderRadius: radius }, style]}>
            <View style={[styles.clip, { borderRadius: radius }]}>
                <LinearGradient
                    colors={[a, b]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                />
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    shadow: {
        shadowColor: '#2E2A20',
        shadowOpacity: 0.08,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
        ...(typeof document !== 'undefined' ? { boxShadow: '0 10px 28px rgba(46,42,32,0.10)' } as any : null),
    },
    clip: { overflow: 'hidden', borderCurve: 'continuous' as any },
});

export default PastelCard;

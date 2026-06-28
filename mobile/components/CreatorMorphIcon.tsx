/**
 * CreatorMorphIcon — the "content creators" symbol for the marketplace Creator
 * tab. Two glossy 3D "jelly" social glyphs (Explore icon language, see c.md) that
 * infinitely morph into each other with a fast digital glitch jitter + skew.
 *
 * The glitch is pure UI-thread Reanimated: at the swap point (around 50%), both
 * glyphs jitter left/right with a skew, creating a digital "scan-line" feel.
 * One fades out while the other fades in during the jitter window.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

const GLYPH_A = require('../assets/creatorTikTok.png');
const GLYPH_B = require('../assets/creatorInsta.png');

export function CreatorMorphIcon({ size = 40 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    // Ping-pong 0↔1 forever (A→B→A…). The glitch window is ~[0.35, 0.65].
    t.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.linear }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);

  // Outgoing glyph A: stable until jitter window, then jitter + skew, then fade out.
  const layerA = useAnimatedStyle(() => {
    const p = t.value;
    // Jitter: rapid left/right micro-movements during [0.38, 0.62]
    const jitterMag = interpolate(p, [0.38, 0.45, 0.55, 0.62], [0, 1, 1, 0], Extrapolation.CLAMP);
    // Jitter pattern: left → right → left
    const jitterX = jitterMag * (Math.sin(p * 40) * size * 0.08);
    // Skew increases during jitter
    const skew = jitterMag * 12;
    return {
      opacity: interpolate(p, [0.38, 0.62], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: jitterX },
        { skewX: `${skew}deg` },
      ],
    };
  });

  // Incoming glyph B: fade in during jitter window, jitter + skew, then stable.
  const layerB = useAnimatedStyle(() => {
    const p = t.value;
    const jitterMag = interpolate(p, [0.38, 0.45, 0.55, 0.62], [0, 1, 1, 0], Extrapolation.CLAMP);
    const jitterX = jitterMag * (Math.sin(p * 40 + Math.PI) * size * 0.08);
    const skew = jitterMag * 12;
    return {
      opacity: interpolate(p, [0.38, 0.62], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: jitterX },
        { skewX: `${skew}deg` },
      ],
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Image source={GLYPH_A} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: size, height: size }, layerA]} />
      <Animated.Image source={GLYPH_B} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: size, height: size }, layerB]} />
      {/* a11y */}
      <View style={StyleSheet.absoluteFill} accessibilityRole="image" accessibilityLabel="Content creators" pointerEvents="none" />
    </View>
  );
}

export default CreatorMorphIcon;

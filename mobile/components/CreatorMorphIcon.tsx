/**
 * CreatorMorphIcon — the "content creators" symbol for the marketplace Creator
 * tab. Two glossy 3D "jelly" social glyphs (Explore icon language, see c.md) that
 * infinitely morph into each other like a malleable liquid drop: both layers
 * squash into a wide blob at the midpoint while they cross-fade, so it reads as
 * one gooey shape reshaping from one glyph into the other rather than a hard cut.
 *
 * Pure Reanimated (UI thread) — no Skia/Lottie native modules.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

const GLYPH_A = require('../assets/creatorTikTok.png');
const GLYPH_B = require('../assets/creatorInsta.png');

export function CreatorMorphIcon({ size = 34 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    // Ping-pong 0↔1 forever: A→B→A… A full at 0, B full at 1.
    t.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);

  const layerA = useAnimatedStyle(() => {
    const sx = interpolate(t.value, [0, 0.5, 1], [1, 1.18, 1]);
    const sy = interpolate(t.value, [0, 0.5, 1], [1, 0.72, 1]);
    const rot = interpolate(t.value, [0, 0.5, 1], [0, 7, 0]);
    return {
      opacity: interpolate(t.value, [0, 0.4, 0.6, 1], [1, 0.7, 0, 0]),
      transform: [{ scaleX: sx }, { scaleY: sy }, { rotate: `${rot}deg` }],
    };
  });

  const layerB = useAnimatedStyle(() => {
    const sx = interpolate(t.value, [0, 0.5, 1], [1, 1.18, 1]);
    const sy = interpolate(t.value, [0, 0.5, 1], [1, 0.72, 1]);
    const rot = interpolate(t.value, [0, 0.5, 1], [0, 7, 0]);
    return {
      opacity: interpolate(t.value, [0, 0.4, 0.6, 1], [0, 0, 0.7, 1]),
      transform: [{ scaleX: sx }, { scaleY: sy }, { rotate: `${rot}deg` }],
    };
  });

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="Content creators">
      <Animated.Image
        source={GLYPH_A}
        resizeMode="contain"
        style={[StyleSheet.absoluteFill, { width: size, height: size }, layerA]}
      />
      <Animated.Image
        source={GLYPH_B}
        resizeMode="contain"
        style={[StyleSheet.absoluteFill, { width: size, height: size }, layerB]}
      />
    </View>
  );
}

export default CreatorMorphIcon;

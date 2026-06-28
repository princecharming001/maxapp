/**
 * LaughCryIcon — a glossy 3D "jelly" laughing face (Explore icon language, see
 * c.md) that laugh-cries on an infinite seamless loop:
 *   • the face giggle-jiggles (quick bob + squash + head wobble), and
 *   • tears of joy stream from both eyes, falling + fading, two per eye on
 *     offset phases so there's always a tear running.
 * Each tear fades to 0 at the start and end of its cycle, so the loop has no
 * visible seam (first frame == last frame). Pure Reanimated, no Skia/Lottie.
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
  type SharedValue,
} from 'react-native-reanimated';

const FACE = require('../assets/laughCryFace.png');
const C = Extrapolation.CLAMP;

function Tear({ tear, size, eyeX, dir, offset }: { tear: SharedValue<number>; size: number; eyeX: number; dir: number; offset: number }) {
  const w = size * 0.13;
  const startY = size * 0.46;
  const fall = size * 0.46;

  const style = useAnimatedStyle(() => {
    const p = (tear.value + offset) % 1;
    const y = startY + fall * p;
    const x = eyeX + dir * size * 0.05 * p;
    const sc = interpolate(p, [0, 0.15, 0.8, 1], [0.3, 1, 1, 0.5], C);
    return {
      opacity: interpolate(p, [0, 0.12, 0.78, 1], [0, 1, 1, 0], C),
      transform: [{ translateX: x - w / 2 }, { translateY: y }, { scaleY: 1.3 }, { scale: sc }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: w,
          height: w,
          borderRadius: w / 2,
          backgroundColor: '#5BA0F2',
          shadowColor: '#3B82F6',
          shadowOpacity: 0.6,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      <View style={{ position: 'absolute', top: w * 0.18, left: w * 0.2, width: w * 0.3, height: w * 0.3, borderRadius: w * 0.15, backgroundColor: 'rgba(255,255,255,0.85)' }} />
    </Animated.View>
  );
}

export function LaughCryIcon({ size = 44 }: { size?: number }) {
  const laugh = useSharedValue(0);
  const tear = useSharedValue(0);

  useEffect(() => {
    // Fast bob ping-pong = giggle. Sawtooth tear cycle loops seamlessly.
    laugh.value = withRepeat(withTiming(1, { duration: 240, easing: Easing.inOut(Easing.quad) }), -1, true);
    tear.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(laugh);
      cancelAnimation(tear);
    };
  }, [laugh, tear]);

  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(laugh.value, [0, 1], [0, -size * 0.045], C) },
      { scaleX: interpolate(laugh.value, [0, 1], [1, 1.05], C) },
      { scaleY: interpolate(laugh.value, [0, 1], [1, 0.95], C) },
      { rotate: `${interpolate(laugh.value, [0, 1], [-2.5, 2.5], C)}deg` },
    ],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.Image source={FACE} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: size, height: size }, faceStyle]} />
      <Tear tear={tear} size={size} eyeX={size * 0.33} dir={-1} offset={0} />
      <Tear tear={tear} size={size} eyeX={size * 0.33} dir={-1} offset={0.5} />
      <Tear tear={tear} size={size} eyeX={size * 0.67} dir={1} offset={0.25} />
      <Tear tear={tear} size={size} eyeX={size * 0.67} dir={1} offset={0.75} />
      <View style={StyleSheet.absoluteFill} accessibilityRole="image" accessibilityLabel="Laughing with tears of joy" pointerEvents="none" />
    </View>
  );
}

export default LaughCryIcon;

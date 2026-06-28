/**
 * CreatorMorphIcon — the "content creators" symbol for the marketplace Creator
 * tab. Two glossy 3D "jelly" social glyphs (Explore icon language, see c.md) that
 * infinitely morph into each other like a malleable liquid drop.
 *
 * The morph is choreographed entirely on the UI thread with Reanimated (no
 * Skia/Lottie, and no animated expo-blur — its intensity prop doesn't reliably
 * animate on iOS New Arch). Layers, back → front:
 *   1. Bloom      — a soft warm→cool radial glow that swells at the swap.
 *   2. Glyph A/B  — droplet physics: the leaving glyph is pulled tall then
 *                   collapses into a wide puddle and fades; the arriving glyph
 *                   rises out of that puddle and overshoots before settling.
 *                   They cross-fade while flattened, so it reads as one gooey
 *                   shape reshaping rather than a hard cut.
 *   3. Splash     — little jelly droplets fling outward and snap back at the
 *                   swap (the metaball-splash beat).
 *   4. Sweep      — a glossy specular highlight travels across during the morph.
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
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const GLYPH_A = require('../assets/creatorTikTok.png');
const GLYPH_B = require('../assets/creatorInsta.png');

// Jelly splash droplets (c.md palette) — warm pair + cool pair flung diagonally.
const DROPS = [
  { angle: -52, color: '#F5703A' },
  { angle: 44, color: '#F59E0B' },
  { angle: 132, color: '#5BA0F2' },
  { angle: 226, color: '#8B5CF6' },
];

function SplashDrop({ t, angle, color, size }: { t: SharedValue<number>; angle: number; color: string; size: number }) {
  const rad = (angle * Math.PI) / 180;
  const reach = size * 0.44;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const dot = Math.max(4, size * 0.15);

  const style = useAnimatedStyle(() => {
    const k = interpolate(t.value, [0.32, 0.5, 0.7], [0, 1, 0], Extrapolation.CLAMP);
    return {
      opacity: interpolate(t.value, [0.34, 0.5, 0.68], [0, 0.92, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: dx * reach * k },
        { translateY: dy * reach * k },
        { scale: 0.45 + k * 0.75 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.7,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

export function CreatorMorphIcon({ size = 40 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    // Ping-pong 0↔1 forever (A→B→A…), eased so it dwells on each glyph.
    t.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);

  // Outgoing glyph: settled → stretched tall → collapsed wide puddle → gone.
  const layerA = useAnimatedStyle(() => {
    const p = t.value;
    const sx = interpolate(p, [0, 0.3, 0.5], [1, 0.8, 1.36], Extrapolation.CLAMP);
    const sy = interpolate(p, [0, 0.3, 0.5], [1, 1.24, 0.56], Extrapolation.CLAMP);
    const rot = interpolate(p, [0, 0.5], [0, -7], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0, 0.36, 0.5], [1, 0.82, 0], Extrapolation.CLAMP),
      transform: [{ scaleX: sx }, { scaleY: sy }, { rotate: `${rot}deg` }],
    };
  });

  // Incoming glyph: rises out of the wide puddle → overshoots tall → settles.
  const layerB = useAnimatedStyle(() => {
    const p = t.value;
    const sx = interpolate(p, [0.5, 0.7, 1], [1.36, 0.85, 1], Extrapolation.CLAMP);
    const sy = interpolate(p, [0.5, 0.7, 1], [0.56, 1.18, 1], Extrapolation.CLAMP);
    const rot = interpolate(p, [0.5, 1], [7, 0], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0.5, 0.64, 1], [0, 0.82, 1], Extrapolation.CLAMP),
      transform: [{ scaleX: sx }, { scaleY: sy }, { rotate: `${rot}deg` }],
    };
  });

  // Soft warm→cool glow that swells at the swap.
  const bloom = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: interpolate(p, [0.18, 0.5, 0.82], [0, 0.55, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0.18, 0.5, 0.82], [0.5, 1.3, 0.5], Extrapolation.CLAMP) }],
    };
  });

  // Glossy specular highlight sweeping across during the morph.
  const sweep = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: interpolate(p, [0.16, 0.4, 0.6, 0.84], [0, 0.6, 0.6, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, [0.16, 0.84], [-size * 0.95, size * 0.95], Extrapolation.CLAMP) },
        { rotate: '18deg' },
      ],
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* 1. Bloom */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bloom]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="cmGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FBC9A0" stopOpacity={0.95} />
              <Stop offset="45%" stopColor="#F59E0B" stopOpacity={0.35} />
              <Stop offset="100%" stopColor="#5BA0F2" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill="url(#cmGlow)" />
        </Svg>
      </Animated.View>

      {/* 2. Morphing glyphs */}
      <Animated.Image source={GLYPH_A} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: size, height: size }, layerA]} />
      <Animated.Image source={GLYPH_B} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: size, height: size }, layerB]} />

      {/* 3. Splash droplets */}
      {DROPS.map((d) => (
        <SplashDrop key={d.angle} t={t} angle={d.angle} color={d.color} size={size} />
      ))}

      {/* 4. Specular sweep (clipped to the icon) */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', width: size, height: size, overflow: 'hidden', borderRadius: size * 0.3 }}
      >
        <Animated.View style={[{ position: 'absolute', top: -size * 0.2, height: size * 1.4, width: size * 0.34 }, sweep]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>

      {/* a11y */}
      <View style={StyleSheet.absoluteFill} accessibilityRole="image" accessibilityLabel="Content creators" pointerEvents="none" />
    </View>
  );
}

export default CreatorMorphIcon;

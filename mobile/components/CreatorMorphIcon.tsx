/**
 * CreatorMorphIcon — the "content creators" symbol for the marketplace Creator
 * tab. Two glossy 3D "jelly" social glyphs (Explore icon language, see c.md) that
 * infinitely glitch-swap into each other.
 *
 * The glitch is a proper datamosh, all on the UI thread (Reanimated, no Skia):
 *   • Slice tearing  — the icon is cut into horizontal bands that shear left/right
 *                      by different stepped amounts during the swap window, so it
 *                      looks like a torn/displaced signal. Outside the window the
 *                      bands line up into the clean icon.
 *   • RGB aberration — red + cyan silhouette ghosts split apart (chromatic
 *                      aberration) and flash during the swap.
 *   • Flicker + blocks — a brightness blip and a couple of digital blocks pop in.
 * The actual A→B content cross-fade happens mid-window, hidden inside the chaos.
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

const GLYPH_A = require('../assets/creatorTikTok.png');
const GLYPH_B = require('../assets/creatorInsta.png');

const N_SLICES = 6;
// Per-slice tear direction/magnitude (-1..1) — irregular so it reads as torn.
const SEEDS = [-1, 0.7, -0.55, 0.95, -0.85, 0.5];

const C = Extrapolation.CLAMP;

// One torn horizontal band of the icon (shows its slice of both glyphs).
function Slice({ t, i, size }: { t: SharedValue<number>; i: number; size: number }) {
  const sliceH = size / N_SLICES;
  const seed = SEEDS[i % SEEDS.length];

  const band = useAnimatedStyle(() => {
    const p = t.value;
    const env = interpolate(p, [0.3, 0.4, 0.6, 0.7], [0, 1, 1, 0], C);
    // Stepped jitter (discrete jumps, not a smooth slide) — the glitch signature.
    const step = Math.round(Math.sin(p * 47 + i * 2.3) * 2) / 2;
    return { transform: [{ translateX: env * step * seed * size * 0.2 }] };
  });
  const aOp = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.42, 0.55], [1, 0], C) }));
  const bOp = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.45, 0.58], [0, 1], C) }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: i * sliceH, left: 0, width: size, height: sliceH + 1, overflow: 'hidden' },
        band,
      ]}
    >
      <Animated.Image source={GLYPH_A} resizeMode="contain" style={[{ position: 'absolute', top: -i * sliceH, width: size, height: size }, aOp]} />
      <Animated.Image source={GLYPH_B} resizeMode="contain" style={[{ position: 'absolute', top: -i * sliceH, width: size, height: size }, bOp]} />
    </Animated.View>
  );
}

// Chromatic-aberration ghost: a solid-color silhouette that splits + flashes.
function Ghost({ t, size, color, dir, win }: { t: SharedValue<number>; size: number; color: string; dir: number; win: [number, number, number] }) {
  const ghostA = useAnimatedStyle(() => {
    const p = t.value;
    const flash = interpolate(p, win, [0, 1, 0], C);
    const jy = Math.round(Math.sin(p * 53) * 2) / 2;
    return {
      opacity: flash * 0.5,
      transform: [{ translateX: dir * (3 + flash * size * 0.13) }, { translateY: jy * size * 0.025 }],
    };
  });
  // Before the swap the ghost is glyph A; after, glyph B.
  const src = win[0] < 0.5 ? GLYPH_A : GLYPH_B;
  return (
    <Animated.Image
      source={src}
      resizeMode="contain"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { width: size, height: size, tintColor: color }, ghostA]}
    />
  );
}

export function CreatorMorphIcon({ size = 40 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    // Ping-pong 0↔1 forever (A→B→A…). Glitch window is ~[0.3, 0.7].
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, true);
    return () => cancelAnimation(t);
  }, [t]);

  // White brightness blip during the tear.
  const flicker = useAnimatedStyle(() => {
    const p = t.value;
    const env = interpolate(p, [0.34, 0.5, 0.66], [0, 1, 0], C);
    const blip = Math.round(Math.sin(p * 90) * 0.5 + 0.5);
    return { opacity: env * blip * 0.14 };
  });

  // Two digital blocks that snap in at offset positions during the glitch.
  const block1 = useAnimatedStyle(() => {
    const p = t.value;
    const on = interpolate(p, [0.4, 0.43, 0.5, 0.53], [0, 1, 1, 0], C);
    const step = Math.round(Math.sin(p * 61) * 2) / 2;
    return { opacity: on * 0.85, transform: [{ translateX: step * size * 0.12 }] };
  });
  const block2 = useAnimatedStyle(() => {
    const p = t.value;
    const on = interpolate(p, [0.52, 0.55, 0.62, 0.65], [0, 1, 1, 0], C);
    const step = Math.round(Math.cos(p * 67) * 2) / 2;
    return { opacity: on * 0.85, transform: [{ translateX: step * size * 0.12 }] };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Chromatic aberration ghosts (behind the crisp slices) */}
      <Ghost t={t} size={size} color="#FF2A6D" dir={1} win={[0.3, 0.42, 0.52]} />
      <Ghost t={t} size={size} color="#05D9E8" dir={-1} win={[0.32, 0.44, 0.54]} />
      <Ghost t={t} size={size} color="#FF2A6D" dir={1} win={[0.5, 0.6, 0.7]} />
      <Ghost t={t} size={size} color="#05D9E8" dir={-1} win={[0.48, 0.58, 0.68]} />

      {/* Torn slices = the actual icon */}
      {Array.from({ length: N_SLICES }, (_, i) => (
        <Slice key={i} t={t} i={i} size={size} />
      ))}

      {/* Digital blocks */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: size * 0.26, left: size * 0.12, width: size * 0.3, height: size * 0.09, backgroundColor: '#05D9E8', borderRadius: 1 }, block1]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: size * 0.62, right: size * 0.1, width: size * 0.26, height: size * 0.08, backgroundColor: '#FF2A6D', borderRadius: 1 }, block2]} />

      {/* Brightness blip */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', borderRadius: size * 0.28 }, flicker]} />

      {/* a11y */}
      <View style={StyleSheet.absoluteFill} accessibilityRole="image" accessibilityLabel="Content creators" pointerEvents="none" />
    </View>
  );
}

export default CreatorMorphIcon;

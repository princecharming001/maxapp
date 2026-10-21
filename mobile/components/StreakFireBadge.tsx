/**
 * Streak badge: a flat ink flame (vector, matches the black-and-white Home) with
 * the day-count in white, centred in the flame's belly so it reads up to 3 digits.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = {
  streakDays: number;
  variant?: 'header' | 'hero';
};

// Flame on a 40×40 grid: a round belly (where the number sits) rising to a
// tip that leans right, with a small lick on the left shoulder.
const FLAME_PATH =
  'M21.2 2.5C22.6 8.6 30.8 12.6 32 22.4C33 31.4 27.4 38 20 38C12.6 38 7.4 32.3 8 25.2' +
  'C8.4 20.2 11.2 16.6 13.6 13.6C14.2 16.4 15.4 18.4 17.6 19.4C16.8 13 18 7.2 21.2 2.5Z';
const INK = '#111113';

const VARIANT_DIM = {
  header: { box: 32, flameSize: 31, numSize: 10, numLineHeight: 12 },
  hero: { box: 38, flameSize: 37, numSize: 11.5, numLineHeight: 14 },
} as const;

export function StreakFireBadge({ streakDays, variant = 'header' }: Props) {
  const dim = VARIANT_DIM[variant];
  const display = streakDays > 999 ? '999+' : String(Math.max(0, streakDays));
  const inactive = streakDays <= 0;
  const narrow = display.length >= 3;

  const floatY = useSharedValue(0);
  const pop = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  const prevStreak = React.useRef(streakDays);

  // Streak v2 (spec 3.5): the badge celebrates the INCREMENT, not just idle
  // float - scale pop 1 -> 1.18 -> 1 (damping 12) + one Success haptic.
  useEffect(() => {
    const prev = prevStreak.current;
    prevStreak.current = streakDays;
    if (streakDays <= prev) return;
    if (!reduceMotion) {
      pop.value = withSequence(
        withSpring(1.18, { damping: 12, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 200 }),
      );
    }
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [streakDays, reduceMotion, pop]);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      floatY.value = 0;
      return;
    }
    floatY.value = withRepeat(
      withSequence(
        withTiming(-0.55, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.55, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [floatY, reduceMotion]);

  const flameMotion = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: pop.value }],
  }));

  const fontSize = narrow ? dim.numSize - 1.5 : dim.numSize;
  /** Baseline in the flame's belly (its widest part sits ~70% down the flame). */
  const numCenterY = (dim.box - dim.flameSize) / 2 + dim.flameSize * 0.69 + fontSize * 0.36;

  return (
    <View
      style={[styles.wrap, { width: dim.box, height: dim.box }]}
      accessibilityLabel={`${streakDays} day streak`}
      accessibilityRole="image"
    >
      <View style={[styles.stack, { width: dim.box, height: dim.box }]}>
        <AnimatedView style={[styles.flameAnim, flameMotion]}>
          <Svg
            width={dim.flameSize}
            height={dim.flameSize}
            viewBox="0 0 40 40"
            accessibilityElementsHidden
          >
            <Defs>
              {/* Black glass: lit from above, a soft gleam on the left
                  shoulder, a faint bright rim. Same language as the glass bars. */}
              <LinearGradient id={`sfb-body-${variant}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#4A4A52" />
                <Stop offset="0.45" stopColor="#1A1A1E" />
                <Stop offset="1" stopColor="#050506" />
              </LinearGradient>
              <RadialGradient id={`sfb-gleam-${variant}`} cx="14.5" cy="21" r="8" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.38" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Path
              d={FLAME_PATH}
              fill={`url(#sfb-body-${variant})`}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={0.6}
              opacity={inactive ? 0.3 : 1}
            />
            <Path d={FLAME_PATH} fill={`url(#sfb-gleam-${variant})`} opacity={inactive ? 0.3 : 1} />
            <Path
              d="M12.6 18.4C11.4 19.9 10.8 21.5 10.6 23.2"
              stroke="#FFFFFF"
              strokeOpacity={inactive ? 0.15 : 0.5}
              strokeWidth={1.1}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </AnimatedView>
        <View style={styles.numOverlay} pointerEvents="none">
          <Svg width={dim.box} height={dim.box} viewBox={`0 0 ${dim.box} ${dim.box}`}>
            <SvgText
              x={dim.box / 2}
              y={numCenterY}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight="800"
              letterSpacing={narrow ? -0.5 : 0}
              fill="#FFFFFF"
              fontFamily={Platform.OS === 'ios' ? 'System' : 'sans-serif'}
            >
              {display}
            </SvgText>
          </Svg>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  flameAnim: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  numOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

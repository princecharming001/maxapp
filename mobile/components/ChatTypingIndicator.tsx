import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, TextStyle } from 'react-native';
import { colors, fonts } from '../theme/dark';

export type ChatTypingMode = 'default' | 'schedule';

type Props = {
  mode?: ChatTypingMode;
  style?: TextStyle;
};

/**
 * Animated thinking indicator.
 *
 * Two pieces:
 *   1. A soft "breathing" pill — three dots that pulse opacity in a wave so
 *      the row reads as alive instead of frozen. (No bouncing — that's the
 *      old style; this is calmer and matches the rest of the app's voice.)
 *   2. A rotating phrase above the dots that swaps every ~1.6s with a quick
 *      cross-fade. Phrases are mode-aware: "schedule" mode lists what's
 *      happening behind a schedule generation (since those waits are long),
 *      "default" rotates short coach-vocab phrases so the user feels Max
 *      is actually thinking, not just hung.
 *
 * Phrases are deliberately short and substantive — no "please wait" filler.
 */

const PHRASES_DEFAULT = [
  'thinking',
  'pulling protocols',
  'cross-checking',
  'choosing the move',
  'tightening the answer',
];

const PHRASES_SCHEDULE = [
  'building your schedule',
  'sequencing routines',
  'matching to your hours',
  'pruning fluff',
  'locking it in',
];

export function ChatTypingIndicator({ mode = 'default', style }: Props) {
  const phrases = mode === 'schedule' ? PHRASES_SCHEDULE : PHRASES_DEFAULT;

  // Phrase rotation with cross-fade.
  const [idx, setIdx] = React.useState(0);
  const phraseFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const cycle = setInterval(() => {
      Animated.timing(phraseFade, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }).start(() => {
        setIdx((i) => (i + 1) % phrases.length);
        Animated.timing(phraseFade, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }).start();
      });
    }, 1600);
    return () => clearInterval(cycle);
  }, [phrases.length, phraseFade]);

  // Three dot opacities phased ~120deg apart so the row reads as a wave.
  const d0 = useRef(new Animated.Value(0.25)).current;
  const d1 = useRef(new Animated.Value(0.25)).current;
  const d2 = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 480,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
          Animated.timing(val, {
            toValue: 0.25,
            duration: 480,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.quad),
          }),
        ])
      );
    const a = loop(d0, 0);
    const b = loop(d1, 160);
    const c = loop(d2, 320);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [d0, d1, d2]);

  return (
    <View style={styles.wrap}>
      <Animated.Text style={[styles.phrase, style, { opacity: phraseFade }]}>
        {phrases[idx]}
      </Animated.Text>
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: d0 }]} />
        <Animated.View style={[styles.dot, { opacity: d1 }]} />
        <Animated.View style={[styles.dot, { opacity: d2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 2,
    gap: 6,
  },
  phrase: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textMuted,
  },
});

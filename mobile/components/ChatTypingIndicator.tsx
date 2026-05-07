import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, TextStyle } from 'react-native';
import { colors, fonts } from '../theme/dark';

// More granular than 'default' — caller can hint what kind of work the bot
// is doing so the rotating phrases match. Falls back to the generic set
// when unset or unrecognized.
export type ChatTypingMode =
  | 'default'
  | 'schedule'
  | 'product'
  | 'protocol'
  | 'reflection'
  | 'analysis';

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

// Phrase decks per task type. Each deck is shuffled-on-mount so a user
// who sees two responses in a row doesn't get the exact same opener
// twice. Phrases are short, lowercase, and avoid filler — they read as
// the bot actually working, not stalling.
const PHRASES_DEFAULT = [
  'thinking it through',
  'pulling the relevant bits',
  'lining up the answer',
  'checking what fits you',
  'tightening this up',
  'picking the move',
];

const PHRASES_SCHEDULE = [
  'building your schedule',
  'sequencing your routines',
  'matching to your hours',
  'spacing things out',
  'cutting the filler',
  'locking it in',
];

const PHRASES_PRODUCT = [
  'checking the catalog',
  'comparing what works for you',
  'filtering by your skin / diet',
  'pulling the best picks',
];

const PHRASES_PROTOCOL = [
  'looking up the protocol',
  'checking dose + timing',
  'lining up the steps',
  'reading the studies',
];

const PHRASES_REFLECTION = [
  'reading what you said',
  'thinking on it',
  'finding the right framing',
];

const PHRASES_ANALYSIS = [
  'parsing your scan',
  'cross-checking the numbers',
  'reading the patterns',
  'putting it together',
];

const DECKS: Record<NonNullable<ChatTypingMode>, string[]> = {
  default: PHRASES_DEFAULT,
  schedule: PHRASES_SCHEDULE,
  product: PHRASES_PRODUCT,
  protocol: PHRASES_PROTOCOL,
  reflection: PHRASES_REFLECTION,
  analysis: PHRASES_ANALYSIS,
};

const shuffleStart = (n: number) => Math.floor(Math.random() * n);

export function ChatTypingIndicator({ mode = 'default', style }: Props) {
  const phrases = DECKS[mode] ?? PHRASES_DEFAULT;

  // Phrase rotation with cross-fade. Slowed from 1.6s → 2.8s per phrase
  // so the user actually has time to read each one — earlier cadence
  // felt frantic and the same word would barely register before flipping.
  const [idx, setIdx] = React.useState(() => shuffleStart(phrases.length));
  const phraseFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Reset to a random starting phrase whenever the mode changes so a
    // schedule-gen turn followed by a default turn doesn't open with the
    // same word.
    setIdx(shuffleStart(phrases.length));
    const cycle = setInterval(() => {
      Animated.timing(phraseFade, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }).start(() => {
        setIdx((i) => (i + 1) % phrases.length);
        Animated.timing(phraseFade, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }).start();
      });
    }, 2800);
    return () => clearInterval(cycle);
  }, [phrases, phraseFade]);

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

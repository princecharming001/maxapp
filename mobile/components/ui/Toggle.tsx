import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { colors, fonts } from '../../theme/dark';

export type ToggleProps = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label?: string;
};

/**
 * iOS-like switch. ON = ink track + knob slid right; OFF = hairline-border
 * track + knob left. Animated (200ms). Optional label sits to the left, muted
 * when off and ink when on.
 */
export default function Toggle({ value, onValueChange, label }: ToggleProps) {
  const a = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(a, {
      toValue: value ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, a]);

  const trackBg = a.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.foreground],
  });
  // track 46, knob 24, 2px inset each side -> travel = 46 - 24 - 2 - 2 = 18
  const knobX = a.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      {label ? (
        <Text style={[styles.label, value && styles.labelOn]}>{label}</Text>
      ) : null}
      <Animated.View style={[styles.track, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: knobX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.1,
  },
  labelOn: { color: colors.foreground },
  track: {
    width: 46,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1A17',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});

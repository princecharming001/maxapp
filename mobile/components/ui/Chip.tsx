import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme/dark';

export type ChipProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  active?: boolean;
  tone?: 'default' | 'danger';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Shared rounded pill. Default = white fill + hairline + soft shadow; active =
 * ink fill + cream label/icon; tone="danger" tints label/icon with the error
 * color. iOS-native, crisp — replaces the old muddy-beige flat pills.
 */
export default function Chip({
  icon,
  label,
  onPress,
  active = false,
  tone = 'default',
  style,
  accessibilityLabel,
}: ChipProps) {
  const danger = tone === 'danger';
  const contentColor = active
    ? colors.background
    : danger
    ? colors.error
    : colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      disabled={!onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipDefault, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? <Ionicons name={icon} size={15} color={contentColor} /> : null}
      <Text style={[styles.label, { color: contentColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  chipDefault: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#1C1A17',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: colors.foreground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.foreground,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    letterSpacing: 0.1,
  },
});

import React from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme/dark';

export type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'style'>;

/**
 * Shared search input. White fill, hairline, soft shadow, 48 tall, radius 16,
 * leading search glyph, trailing clear button when there's a value. Forwards a
 * ref to the inner TextInput so screens can autofocus / control it.
 */
const SearchBar = React.forwardRef<TextInput, SearchBarProps>(
  ({ value, onChangeText, placeholder, style, ...rest }, ref) => {
    return (
      <View style={[styles.wrap, style]}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.leading} />
        <TextInput
          ref={ref}
          style={[styles.input, WEB_NO_OUTLINE]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          {...rest}
        />
        {value ? (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
);

SearchBar.displayName = 'SearchBar';

export default SearchBar;

// Web-only hack to kill the focus ring; typed loosely so RN's TextStyle is happy.
const WEB_NO_OUTLINE = { outlineStyle: 'none' } as unknown as object;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#1C1A17',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  leading: { marginRight: 0 },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.textPrimary,
    padding: 0,
  },
});

import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, space, target } from '../design/tokens';
import { useColours, useTheme, type ThemePreference } from '../design/theme';

const ORDER: readonly ThemePreference[] = ['light', 'dark', 'system'];

const LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Auto',
};

const GLYPH: Record<ThemePreference, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'auto',
};

/**
 * Light, dark, or follow the phone.
 *
 * A cycling button rather than a settings screen: there is exactly one
 * preference in this product and a screen to hold it would be a screen a
 * driver could get lost in.
 *
 * The current mode is named, not just drawn. An icon-only theme toggle is the
 * classic case of colour and shape carrying meaning alone, and this one is
 * read at a glance by someone deciding whether the screen is legible.
 */
export function ThemeToggle() {
  const colours = useColours();
  const { preference, setPreference } = useTheme();

  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length] ?? 'light';

  return (
    <Pressable
      onPress={() => setPreference(next)}
      accessibilityRole="button"
      accessibilityLabel={`Appearance: ${LABEL[preference]}`}
      accessibilityHint={`Switches to ${LABEL[next]}`}
      hitSlop={space.sm}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colours.surfaceDim,
          borderColor: colours.outline,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <Icon name={GLYPH[preference]} size="sm" colour={colours.textSecondary} />
        <Text variant="label" tone="secondary" numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {LABEL[preference]}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: target.standard - space.lg,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
});

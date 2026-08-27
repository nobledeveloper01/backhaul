import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { Text } from './Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';

interface Props {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly icon?: IconName | undefined;
}

/**
 * A filter, on or off.
 *
 * Selected state carries a tick as well as a fill, because "which of these six
 * chips is on" read by colour alone is exactly the judgement that fails in
 * sunlight — and it is the judgement a fleet owner makes before deciding their
 * trips have gone missing.
 *
 * Height is deliberately below the 48 dp standard target and the hit area is
 * not: chips this size are what fit a filter row, and `hitSlop` is what makes
 * them tappable.
 */
export function Chip({ label, selected, onPress, icon }: Props) {
  const colours = useColours();
  const { t } = useLanguage();

  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={t(selected ? 'selected_tap_to_remove' : 'tap_to_filter_by_this')}
      feedback="scale"
      hitSlop={space.sm}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colours.accentWash : colours.surfaceDim,
          borderColor: selected ? colours.accent : colours.outline,
        },
      ]}
    >
      <View style={styles.inner}>
        {selected ? (
          <Icon name="check" size="sm" colour={colours.accent} />
        ) : icon !== undefined ? (
          <Icon name={icon} size="sm" colour={colours.textSecondary} />
        ) : null}
        <Text
          variant="label"
          numberOfLines={1}
          style={{ color: selected ? colours.accent : colours.textSecondary }}
        >
          {label}
        </Text>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
});

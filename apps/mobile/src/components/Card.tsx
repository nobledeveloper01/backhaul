import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, space } from '../design/tokens';
import { useColours, useElevation } from '../design/theme';

type Emphasis = 'plain' | 'raised' | 'accent';

interface Props {
  readonly children: ReactNode;
  /** Small wide-tracked heading with an icon, if the card has one. */
  readonly overline?: string | undefined;
  readonly icon?: IconName | undefined;
  readonly emphasis?: Emphasis;
  readonly style?: ViewStyle | undefined;
}

/**
 * One card, used everywhere.
 *
 * Before this every screen built its own `View` with the same padding, radius
 * and hairline border repeated inline — which is why they were all identical,
 * all flat, and nothing on a screen ever led the eye anywhere.
 *
 * `emphasis` is the only lever a screen gets: `raised` for the thing being
 * read, `accent` for the one card per screen that should be looked at first,
 * `plain` for supporting detail. One primary per screen; more than one is
 * none.
 */
export function Card({
  children,
  overline,
  icon,
  emphasis = 'raised',
  style,
}: Props) {
  const colours = useColours();
  const elevation = useElevation();

  const surface =
    emphasis === 'accent'
      ? colours.accentWash
      : emphasis === 'raised'
        ? colours.surfaceRaised
        : colours.surfaceDim;

  const border = emphasis === 'accent' ? colours.accent : colours.outline;

  return (
    <View
      style={[
        styles.card,
        emphasis === 'raised' ? elevation.raised : null,
        {
          backgroundColor: surface,
          borderColor: border,
          borderWidth: emphasis === 'accent' ? 1.5 : StyleSheet.hairlineWidth * 2,
        },
        style,
      ]}
    >
      {overline !== undefined ? (
        <View style={styles.head}>
          {icon !== undefined ? (
            <Icon name={icon} size="sm" colour={colours.textSecondary} />
          ) : null}
          <Text variant="overline" tone="secondary">
            {overline.toUpperCase()}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.xl,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
});

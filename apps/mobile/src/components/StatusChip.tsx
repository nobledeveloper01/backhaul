import { StyleSheet, View } from 'react-native';
import type { Observation } from '@backhaul/domain';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly observation: Observation;
  readonly tracking: boolean;
}

/**
 * What the truck is doing, as an icon, a word and a tint.
 *
 * Three carriers of the same meaning, on purpose. Colour is never the only
 * one — this is read in sunlight through a windscreen, and the definition of
 * done says so — and the icon is what makes it legible at a glance in a list
 * of six.
 *
 * `stalled` is the only one that reads as an alarm. `silent` is grey: a
 * coverage gap is a fact about Nigerian network infrastructure, not the
 * driver's fault, and colouring it red trains shippers to distrust drivers for
 * something nobody controls.
 */
export function StatusChip({ observation, tracking }: Props) {
  const colours = useColours();

  const [label, colour, wash, icon]: [string, string, string, IconName] = !tracking
    ? ['Not started', colours.textSecondary, colours.surfaceDim, 'clock']
    : observation === 'moving'
      ? ['Moving', colours.moving, colours.movingWash, 'truck']
      : observation === 'stopped'
        ? ['Stopped', colours.stopped, colours.stoppedWash, 'pin']
        : observation === 'stalled'
          ? ['Stalled', colours.exception, colours.exceptionWash, 'alert']
          : observation === 'silent'
            ? ['No signal', colours.stale, colours.staleWash, 'signal-off']
            : ['No data yet', colours.textSecondary, colours.surfaceDim, 'clock'];

  return (
    <View style={[styles.chip, { backgroundColor: wash, borderColor: colour }]}>
      <Icon name={icon} size="sm" colour={colour} />
      <Text variant="label" style={{ color: colour }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs + 2,
    paddingLeft: space.sm,
    paddingRight: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexShrink: 1,
  },
});

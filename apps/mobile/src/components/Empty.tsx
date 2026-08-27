import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { Text } from './Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly icon: IconName;
  readonly title: string;
  /** What to do about it. An empty state with no forward path is a dead end. */
  readonly detail: string;
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
}

/**
 * Nothing here, and what to do about it.
 *
 * Every empty state in this product names a next step. "No trips" is a fact;
 * "No trips yet — already got a truck on the road? Track it in a minute" is
 * the shipper's empty state doing the product's actual job, because the wedge
 * is tracking a shipment they arranged somewhere else.
 */
export function Empty({ icon, title, detail, action }: Props) {
  const colours = useColours();

  return (
    <View style={styles.root}>
      <View style={[styles.badge, { backgroundColor: colours.surfaceDim }]}>
        <Icon name={icon} size="lg" colour={colours.textSecondary} />
      </View>

      <Text variant="title" style={styles.centred}>
        {title}
      </Text>
      <Text variant="body" tone="secondary" style={styles.centred}>
        {detail}
      </Text>

      {action !== undefined ? (
        <Press
          onPress={action.onPress}
          accessibilityLabel={action.label}
          style={[styles.action, { backgroundColor: colours.accent }]}
        >
          <Text variant="title" style={{ color: colours.onAccent }}>
            {action.label}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: { textAlign: 'center' },
  action: {
    minHeight: target.standard,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    marginTop: space.sm,
  },
});

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { motion, radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';

const ENTER = Easing.bezier(...motion.enter);

interface Props {
  readonly online: boolean;
  /** Rows the phone is holding until it can send them. */
  /**
   * Fixes waiting on the phone, or null when this face has no way to know.
   *
   * Null is not zero. The app used to pass a literal `18` from every screen —
   * a specific claim about a driver's own evidence, made by chrome that has
   * never spoken to the queue. Only the driver face runs the loop, so only the
   * driver face has a number.
   */
  readonly queued: number | null;
}

/**
 * Being offline is normal, and this says so.
 *
 * Not an error state. A driver on the northern corridors is offline for hours
 * at a time as a matter of course, and an app that treats that as a fault
 * trains them to distrust it — or to force-quit it, which loses the trip.
 *
 * What it does say is that nothing is being lost, because that is the only
 * question a driver actually has when they notice the bars are gone.
 */
export function OfflineBanner({ online, queued }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const height = useRef(new Animated.Value(online ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(height, {
      toValue: online ? 0 : 1,
      duration: online ? Math.round(motion.base * 0.7) : motion.base,
      easing: ENTER,
      // Height cannot be driven natively; opacity and translate can, and the
      // banner is small enough that the layout pass is not the problem.
      useNativeDriver: false,
    }).start();
  }, [online, height]);

  if (online) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.root,
        {
          backgroundColor: colours.staleWash,
          borderColor: colours.stale,
          opacity: height,
        },
      ]}
    >
      <Icon name="signal-off" size="sm" colour={colours.stale} />
      <View style={styles.body}>
        <Text variant="label" tone="stale">
          {queued === null
            ? t('no_signal')
            : queued === 0
              ? t('no_signal_still_recording')
              : `${queued} ${t('positions_saved_waiting')}`}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  body: { flex: 1 },
});

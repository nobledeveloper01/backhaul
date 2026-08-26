import { StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { space } from '../design/tokens';
import { useColours } from '../design/theme';

/** Past this, the age is what gets emphasised — not the position. */
const STALE_AFTER_MS = 30 * 60_000;

interface Props {
  /** Milliseconds since the last fix, or null when there has never been one. */
  readonly silentForMs: number | null;
  /**
   * Drops the words and keeps the number.
   *
   * Used where a `StatusChip` already says "No signal" — the two together read
   * as "No signal · No signal for 45 min", which is the interface telling you
   * the same thing twice and trusting you to notice only once.
   */
  readonly compact?: boolean;
}

/**
 * How old the position is — the signature pattern from `DESIGN.md` §5.1.
 *
 * Two rules live here and both are easy to lose:
 *
 * **Stale is grey, never red.** A gap in coverage is a fact about Nigerian
 * network infrastructure, not a fault of the driver. Colouring it as an alarm
 * trains shippers to distrust drivers for something nobody controls.
 *
 * **No fixes at all is not the same as a long silence.** A trip that has not
 * started reads "not started", not "no signal for 9 hours".
 */
export function PositionAge({ silentForMs, compact = false }: Props) {
  const colours = useColours();

  if (silentForMs === null) {
    return compact ? null : (
      <View style={styles.row}>
        <Icon name="clock" size="sm" colour={colours.textSecondary} />
        <Text variant="label" tone="secondary">
          Not started
        </Text>
      </View>
    );
  }

  const stale = silentForMs >= STALE_AFTER_MS;

  return (
    <View style={styles.row}>
      {compact ? null : (
        <Icon
          name={stale ? 'signal-off' : 'signal'}
          size="sm"
          colour={stale ? colours.stale : colours.moving}
        />
      )}
      {compact ? <Icon name="clock" size="sm" colour={colours.textSecondary} /> : null}
      <Text variant="label" tone={stale ? 'stale' : 'secondary'} numberOfLines={1}>
        {compact
          ? `${humanDuration(silentForMs)} ago`
          : stale
            ? `No signal for ${humanDuration(silentForMs)}`
            : `Updated ${humanDuration(silentForMs)} ago`}
      </Text>
    </View>
  );
}

/**
 * Human duration, rounded down.
 *
 * Named `humanDuration` and not `describe`: it was `describe`, which is Jest's
 * global, so importing it into a test file shadowed the thing every test in
 * that file needed. A helper that cannot be imported into a test without
 * breaking the test is badly named.
 *
 * Down, because "no signal for 2 hours" when it has been 2 hours 50 is a
 * shipper who is less alarmed than the facts warrant only briefly; rounding up
 * makes every gap sound worse than it is and the chip stops being believed.
 */
export function humanDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
});

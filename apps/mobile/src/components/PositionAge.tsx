import { StyleSheet, View } from 'react-native';
import type { Phrase } from '@backhaul/domain';

import { Icon } from './Icon';
import { Text } from './Text';
import { space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';

/** The reader's own words. Passed in, never reached for — see `humanDuration`. */
export type Words = (phrase: Phrase) => string;

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
  const { t } = useLanguage();

  if (silentForMs === null) {
    return compact ? null : (
      <View style={styles.row}>
        <Icon name="clock" size="sm" colour={colours.textSecondary} />
        <Text variant="label" tone="secondary">
          {t('not_started')}
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
        {/*
          The number first, then the words.

          "No signal for 45 min" and "Updated 45 min ago" both put the number
          in the middle of a sentence, and the middle is somewhere different in
          each of the four languages this app is read in. Written the other way
          round — the count, then the phrase — every language gets a sentence
          that is its own rather than English with the words swapped.
        */}
        {stale && !compact
          ? `${humanDuration(silentForMs, t)} · ${t('no_signal')}`
          : agoLabel(silentForMs, t)}
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
 *
 * The words come in as an argument rather than being reached for, because this
 * is a plain function and the language lives in a React context. Anything that
 * renders a duration therefore has to have asked what language it is in, which
 * is the point: it used to be impossible to forget, and it produced "45 min
 * ago" underneath four lines of Yorùbá.
 *
 * Every unit is abbreviated, English included — "1 h" rather than "1 hour" and
 * "3 h" rather than "3 hours". That drops English's plural, which is a small
 * loss, and drops the question of how to pluralise in three languages that do
 * not do it by suffix, which is a large one.
 */
export function humanDuration(ms: number, t: Words): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return t('just_now');
  }
  if (minutes < 60) {
    return `${minutes} ${t('unit_minute')}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${t('unit_hour')}`;
  }
  return `${Math.floor(hours / 24)} ${t('unit_day')}`;
}

/**
 * "1 hour", "3 hours", "45 minutes".
 *
 * Pluralisation has now been got wrong three times in this app — "every 1
 * minutes", "1 completed trip", "1 hours stopped" — always by writing the
 * number and the noun in the same template literal. One helper.
 */
export function plural(count: number, singular: string, plural_?: string): string {
  const rounded = Math.round(count * 10) / 10;
  const word = rounded === 1 ? singular : (plural_ ?? `${singular}s`);
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} ${word}`;
}

/**
 * "12 min ago", "just now".
 *
 * `humanDuration` returns a *duration*; most of them take "ago", and "just
 * now" does not — "just now ago" appeared on the fleet screen. One helper so
 * every caller gets it right.
 */
export function agoLabel(ms: number, t: Words): string {
  const duration = humanDuration(ms, t);
  return duration === t('just_now') ? duration : `${duration} ${t('ago')}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
});

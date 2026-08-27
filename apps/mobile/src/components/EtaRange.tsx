import { StyleSheet, View } from 'react-native';
import type { Eta } from '@backhaul/domain';

import type { Phrase } from '@backhaul/domain';

import { Card } from './Card';
import { Text } from './Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import type { Words } from './PositionAge';

/**
 * Sunday first, because `Date.getDay()` counts from Sunday. Written out rather
 * than handed to `toLocaleDateString`, which knows `en-NG` and does not know
 * Hausa, Yorùbá or Igbo — it would have answered "Thursday" in all four.
 */
const WEEKDAYS: readonly Phrase[] = [
  'day_sunday',
  'day_monday',
  'day_tuesday',
  'day_wednesday',
  'day_thursday',
  'day_friday',
  'day_saturday',
];

interface Props {
  readonly eta: Eta;
}

/**
 * The ETA — signature pattern from `DESIGN.md` §5.2.
 *
 * A **range**, never a single time. A single time reads as a promise and
 * neither the road nor the checkpoints will keep it.
 *
 * When the domain refuses to estimate, this renders the refusal's own sentence
 * rather than a dash. `eta()` writes those sentences to be shown — "Only 2
 * positions so far. An estimate from this truck's own pace needs 4." — and a
 * screen that swallows them leaves the user with nothing to do about it.
 */
export function EtaRange({ eta }: Props) {
  const colours = useColours();
  const { t } = useLanguage();

  if (eta.kind === 'unknown') {
    return (
      <Card overline={t('arrival')} icon="clock">
        <Text variant="title" tone="secondary">
          {t('not_enough_to_say_yet')}
        </Text>
        <Text variant="body" tone="secondary" style={styles.gap}>
          {eta.detail}
        </Text>
      </Card>
    );
  }

  return (
    <Card overline={t('arrival')} icon="clock">
      <View style={styles.header}>
        <View />
        {eta.isModelled ? (
          // The measured/modelled rule does not stop at the edge of the
          // engine. An estimate built from a class average rather than this
          // truck's own pace says so, beside the figure, not in a footnote.
          <View style={[styles.estimate, { borderColor: colours.stale }]}>
            <Text variant="label" tone="stale">
              {t('estimated')}
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="display" tabular>
        {clock(eta.earliest)} – {clock(eta.latest)}
      </Text>

      <Text variant="body" tone="secondary">
        {day(eta.expected, t)} · {Math.round(eta.remaining / 1000)} km {t('to_go')}
      </Text>
    </Card>
  );
}

function clock(at: Date): string {
  return at.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * "Ọjọ́bọ̀ · 27/08".
 *
 * The weekday comes from our own table and the date is written in figures.
 * `toLocaleDateString` was doing both, and it has no idea what Yorùbá is — so
 * a fully translated arrival card carried "Thursday, 27 Aug" underneath it.
 * A short month name would need twelve more phrases in four languages to say
 * what two digits already say.
 */
function day(at: Date, t: Words): string {
  const weekday = WEEKDAYS[at.getDay()] ?? 'day_sunday';
  const date = String(at.getDate()).padStart(2, '0');
  const month = String(at.getMonth() + 1).padStart(2, '0');
  return `${t(weekday)} · ${date}/${month}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.xs,
    minHeight: 20,
  },
  estimate: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderStyle: 'dashed',
  },
  gap: { marginTop: space.xs },
});

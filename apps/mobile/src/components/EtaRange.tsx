import { StyleSheet, View } from 'react-native';
import type { Eta } from '@backhaul/domain';

import { Card } from './Card';
import { Text } from './Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';

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

  if (eta.kind === 'unknown') {
    return (
      <Card overline="Arrival" icon="clock">
        <Text variant="title" tone="secondary">
          Not enough to say yet
        </Text>
        <Text variant="body" tone="secondary" style={styles.gap}>
          {eta.detail}
        </Text>
      </Card>
    );
  }

  return (
    <Card overline="Arrival" icon="clock">
      <View style={styles.header}>
        <View />
        {eta.isModelled ? (
          // The measured/modelled rule does not stop at the edge of the
          // engine. An estimate built from a class average rather than this
          // truck's own pace says so, beside the figure, not in a footnote.
          <View style={[styles.estimate, { borderColor: colours.stale }]}>
            <Text variant="label" tone="stale">
              Estimated
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="display" tabular>
        {clock(eta.earliest)} – {clock(eta.latest)}
      </Text>

      <Text variant="body" tone="secondary">
        {day(eta.expected)} · {Math.round(eta.remaining / 1000)} km to go
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

function day(at: Date): string {
  return at.toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
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

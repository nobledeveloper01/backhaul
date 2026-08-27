import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_REPOSITION_M,
  distance,
  format,
  ladenFraction,
  subtract,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow } from '../state/demo';
import { demoChain } from '../state/product';

interface Props {
  readonly onBack: () => void;
}

const km = (metres: number) => Math.round(metres / 1_000);

/**
 * Three legs instead of one, and the truck comes home loaded.
 *
 * `utilisation.ts` measures the problem — what fraction of the kilometres a
 * truck drove were paid for — and this is the answer to it. A trailer running
 * Lagos → Kano → Lagos empty on the way back is paid for half of what it burns.
 *
 * The screen shows the **rejected** legs as well as the taken ones. A proposal
 * that only shows what it chose asks a carrier to trust an opinion; showing the
 * one that pays four times as much and starts 800 km away, with the sentence
 * explaining why it was passed over, is what makes the choice checkable.
 */
export function ChainScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const { built, aloneValue, cargoOf, rejected } = useMemo(() => demoChain(now), [now]);

  const laden = ladenFraction(built);
  const extra = subtract(built.pays, aloneValue.pays);

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Chain this trip" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Card emphasis="accent" overline="If you take all three" icon="swap">
          <View style={styles.figureRow}>
            <View style={styles.flex}>
              <Text variant="display" tabular>
                {Math.round(laden * 100)}%
              </Text>
              <Text variant="body" tone="secondary">
                of the kilometres paid for
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="title" tabular>
                {format(extra)}
              </Text>
              <Text variant="body" tone="secondary">
                more than running home empty
              </Text>
            </View>
          </View>

          <Text variant="label" tone="secondary" style={styles.gapTop}>
            {km(built.deadheadM)} km empty across the whole chain. The same truck
            going straight home covers {km(aloneValue.laden)} km loaded and the
            same again with nothing on it.
          </Text>
        </Card>

        <Text variant="overline" tone="secondary" style={styles.heading}>
          THE CHAIN
        </Text>

        {built.legs.map((leg, index) => {
          const previous = built.legs[index - 1];
          // The gap between one leg dropping and the next one loading, measured
          // rather than assumed. Written as 0 while it was hard-coded, which is
          // exactly the kind of figure a carrier checks first.
          const empty = previous === undefined ? 0 : distance(previous.to, leg.from);

          return (
          <View key={leg.loadId}>
            {index > 0 ? (
              <View style={styles.hop}>
                <View style={[styles.hopLine, { backgroundColor: colours.outline }]} />
                <Text variant="label" tone="secondary">
                  {empty < 1_000
                    ? 'Loads where the last one dropped'
                    : `${km(empty)} km empty to get there`}
                </Text>
              </View>
            ) : null}

            <Card emphasis={index === 0 ? 'plain' : 'raised'}>
              <View style={styles.legTop}>
                <View
                  style={[
                    styles.pip,
                    {
                      backgroundColor: index === 0 ? colours.outline : colours.accent,
                    },
                  ]}
                >
                  <Text variant="overline" style={{ color: colours.onAccent }}>
                    {index + 1}
                  </Text>
                </View>
                <Text variant="title" style={styles.flex}>
                  {leg.fromName} → {leg.toName}
                </Text>
                <Text variant="body" tabular>
                  {format(leg.pays)}
                </Text>
              </View>

              <Text variant="body" tone="secondary" style={styles.gapTight}>
                {cargoOf.get(leg.loadId) ?? 'Load'} · {km(leg.distanceM)} km
                {index === 0 ? ' · already carrying this' : ''}
              </Text>
            </Card>
          </View>
          );
        })}

        {rejected.length > 0 ? (
          <>
            <Text variant="overline" tone="secondary" style={styles.heading}>
              PASSED OVER
            </Text>

            {rejected.map((entry) => (
              <Card key={entry.leg.loadId} emphasis="plain">
                <View style={styles.legTop}>
                  <Icon name="close" size="sm" colour={colours.textSecondary} />
                  <Text variant="body" tone="secondary" style={styles.flex}>
                    {entry.leg.fromName} → {entry.leg.toName}
                  </Text>
                  <Text variant="label" tone="secondary" tabular>
                    {format(entry.leg.pays)}
                  </Text>
                </View>
                <Text variant="label" tone="secondary" style={styles.gapTight}>
                  {entry.detail}
                </Text>
              </Card>
            ))}

            <Text variant="label" tone="secondary">
              Nothing is proposed that needs more than {km(MAX_REPOSITION_M)} km
              of empty repositioning. Past that the fuel and the day are rarely
              covered by the leg they are spent reaching.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  gapTop: { marginTop: space.md },
  gapTight: { marginTop: space.xs },
  figureRow: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-end' },
  legTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pip: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  hopLine: { width: 2, height: 20, marginLeft: 10 },
});

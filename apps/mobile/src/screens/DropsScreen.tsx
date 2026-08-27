import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  describeProgress,
  dropFee,
  format,
  isComplete,
  nextDrop,
  outOfOrder,
  weightAboard,
  type Drop,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { agoLabel } from '../components/PositionAge';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoDrops } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/**
 * One truck, several deliveries.
 *
 * In the order the trailer was loaded, because that is the order it can be
 * unloaded in — the last drop is at the front of the box. A route that
 * reorders them at 4am is a route that requires emptying the whole thing at
 * the first stop.
 *
 * The trip finishes on the **last signature**, not on arriving at the last
 * address: a truck can be at the final market with goods still aboard, and a
 * trip that closes on geography closes on the wrong thing.
 */
export function DropsScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const [drops, setDrops] = useState<readonly Drop[]>(() => demoDrops(trip, now));

  const next = nextDrop(drops);
  const aboard = weightAboard(drops);
  const late = outOfOrder(drops);

  const sign = (id: string) => {
    setDrops((was) =>
      was.map((drop) => (drop.id === id ? { ...drop, deliveredAt: now } : drop)),
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Drops on this trip" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Card emphasis="accent" overline="Where the truck is up to" icon="package">
          <Text variant="title">{describeProgress(drops)}</Text>

          <View style={styles.facts}>
            <View style={styles.fact}>
              <Text variant="headline" tabular>
                {Math.round(aboard / 1_000)} t
              </Text>
              <Text variant="label" tone="secondary">
                still aboard
              </Text>
            </View>
            <View style={styles.fact}>
              <Text variant="headline" tabular>
                {format(dropFee(drops))}
              </Text>
              <Text variant="label" tone="secondary">
                added for the extra stops
              </Text>
            </View>
          </View>

          <Text variant="label" tone="secondary" style={styles.gapTop}>
            The first drop is the delivery; each one after it is a detour, a
            wait and a second set of papers.
          </Text>
        </Card>

        {isComplete(drops) ? (
          <Card overline="Finished" icon="check" emphasis="plain">
            <Text variant="body">
              Every drop is signed for, so the trip can close. Arriving at the
              last address would not have been enough.
            </Text>
          </Card>
        ) : null}

        {late.length > 0 ? (
          <Card overline="Out of order" icon="swap" emphasis="plain">
            {late.map((drop) => (
              <Text key={drop.id} variant="body">
                {drop.at.name} was delivered with an earlier drop still aboard.
              </Text>
            ))}
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              Recorded, not refused. A consignee who was closed is a real thing —
              but "delivered in the order loaded" is otherwise assumed by
              everybody reading this afterwards.
            </Text>
          </Card>
        ) : null}

        {drops.map((drop, index) => {
          const done = drop.deliveredAt !== null;
          const isNext = next?.id === drop.id;

          return (
            <Card key={drop.id} emphasis={isNext ? 'raised' : 'plain'}>
              <View style={styles.top}>
                <View
                  style={[
                    styles.pip,
                    {
                      backgroundColor: done ? colours.moving : colours.surfaceDim,
                      borderColor: done ? colours.moving : colours.outline,
                    },
                  ]}
                >
                  <Text
                    variant="overline"
                    style={{ color: done ? colours.onAccent : colours.textSecondary }}
                  >
                    {index + 1}
                  </Text>
                </View>

                <View style={styles.flex}>
                  <Text variant="title">{drop.at.name}</Text>
                  <Text variant="body" tone="secondary">
                    {drop.consignee}
                  </Text>
                  <Text variant="label" tone="secondary">
                    {drop.goods}
                    {drop.units === null ? '' : ` · ${drop.units} units`}
                  </Text>
                </View>

                {isNext ? (
                  <View style={[styles.nextBadge, { borderColor: colours.accent }]}>
                    <Text variant="label" tone="accent">
                      Next
                    </Text>
                  </View>
                ) : null}
              </View>

              {done ? (
                <View style={styles.signed}>
                  <Icon name="check" size="sm" colour={colours.moving} />
                  <Text variant="label" tone="moving">
                    Signed for {agoLabel(now.getTime() - (drop.deliveredAt?.getTime() ?? 0))}
                  </Text>
                </View>
              ) : (
                <Press
                  onPress={() => sign(drop.id)}
                  accessibilityLabel={`Hand over at ${drop.at.name}`}
                  style={[
                    styles.sign,
                    {
                      backgroundColor: isNext ? colours.accent : 'transparent',
                      borderColor: isNext ? colours.accent : colours.outline,
                    },
                  ]}
                >
                  <Icon
                    name="pen"
                    size="sm"
                    colour={isNext ? colours.onAccent : colours.textSecondary}
                  />
                  <Text
                    variant="label"
                    style={{ color: isNext ? colours.onAccent : colours.textSecondary }}
                  >
                    Hand over here
                  </Text>
                </Press>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  gapTop: { marginTop: space.md },
  facts: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  fact: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  pip: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  signed: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md },
  sign: {
    marginTop: space.md,
    minHeight: target.standard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

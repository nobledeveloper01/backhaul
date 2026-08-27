import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  dropFee,
  format,
  isComplete,
  nextDrop,
  outOfOrder,
  weightAboard,
  type Drop,
  completed,
  MINIMUM_RADIUS_M,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { agoLabel } from '../components/PositionAge';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { map } from '../api/client';
import { whereTheDropsAre } from '../state/words';
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
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const { api } = useSession();

  /*
    The server sends a consignee, a sequence and a weight; it does not send a
    fence. A drop's `at` is a waypoint with its own radius, and the waypoints
    live on their own route — so what is built here is the drop *as the drops
    engine needs it*, with a fence of the domain's own minimum radius rather
    than an invented one. A fence this screen never draws is a fence it must
    not pretend to know.
  */
  const { query, refresh } = useTripData(
    trip.live,
    async () =>
      map(await api.drops(trip.id), (view) =>
        view.drops.map<Drop>((row) => ({
          id: row.id,
          at: {
            id: row.id,
            name: row.consignee,
            kind: 'destination',
            at: { lat: 0, lon: 0, accuracy: 0, at: now },
            radius: MINIMUM_RADIUS_M,
          },
          consignee: row.consignee,
          goods: row.goods,
          units: row.units,
          weightKg: row.weightKg,
          deliveredAt: row.deliveredAt,
          exception: row.exception,
        })),
      ),
    () => demoDrops(trip, now),
    [api, trip.id, now],
  );

  const drops = query.state === 'ready' ? query.value : [];

  const next = nextDrop(drops);
  const aboard = weightAboard(drops);
  const late = outOfOrder(drops);

  const sign = (id: string) => {
    if (!trip.live) {
      refresh();
      return;
    }
    void api.signDrop(trip.id, id, new Date()).then(() => refresh());
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('drops_on_this_trip')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Card emphasis="accent" overline={t('where_the_truck_is_up_to')} icon="package">
          <Text variant="title">{whereTheDropsAre(completed(drops).length, drops.length, nextDrop(drops)?.at.name ?? null, t)}</Text>

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
          <Card overline={t('finished')} icon="check" emphasis="plain">
            <Text variant="body">
              {t('every_drop_signed_note')}
            </Text>
          </Card>
        ) : null}

        {late.length > 0 ? (
          <Card overline={t('out_of_order_card')} icon="swap" emphasis="plain">
            {late.map((drop) => (
              <Text key={drop.id} variant="body">
                {drop.at.name} was delivered with an earlier drop still aboard.
              </Text>
            ))}
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              {t('out_of_order_note')}
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
                    {agoLabel(now.getTime() - (drop.deliveredAt?.getTime() ?? 0), t)} ·{' '}
                    {t('signed_for')}
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
                    {t('hand_over_here_button')}
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

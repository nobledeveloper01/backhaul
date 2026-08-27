import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MINIMUM_FILL,
  SHIPPER_DISCOUNT_PCT,
  canShare,
  format,
  type PairLoad,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow } from '../state/demo';
import { demoPairs } from '../state/product';

interface Props {
  readonly onBack: () => void;
}

/**
 * Two half-loads on one trailer.
 *
 * A 12-tonne consignment on a 30-tonne trailer pays for the trailer and wastes
 * eighteen tonnes of it. The shipper knows they are overpaying, the carrier
 * knows they are underloaded, and neither can fix it alone.
 *
 * The pairs that were **refused** are shown underneath with the reason, for the
 * same argument the chain screen makes: a proposal you cannot argue with is a
 * proposal nobody acts on.
 */
export function PairsScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const { board, found } = useMemo(() => demoPairs(now), [now]);

  // Every pair the engine turned down, with its sentence.
  const refused = useMemo(() => {
    const out: { a: PairLoad; b: PairLoad; detail: string }[] = [];
    for (let i = 0; i < board.length; i++) {
      for (let j = i + 1; j < board.length; j++) {
        const a = board[i];
        const b = board[j];
        if (a === undefined || b === undefined) continue;
        const verdict = canShare(a, b, 'trailer_30t');
        if (!verdict.ok) out.push({ a, b, detail: verdict.detail });
      }
    }
    return out;
  }, [board]);

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Share a trailer" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {found.length === 0 ? (
          <Empty
            icon="package"
            title="No pairs on the board"
            detail="Nothing here fits together on one trailer today."
          />
        ) : (
          <>
            <Text variant="body" tone="secondary">
              Both shippers pay {SHIPPER_DISCOUNT_PCT}% less than a whole truck.
              You collect more than one fare for one run. Nobody is doing anybody
              a favour, which is why it works.
            </Text>

            {found.map((pairing, index) => (
              <Card
                key={`${pairing.a.id}-${pairing.b.id}`}
                emphasis={index === 0 ? 'accent' : 'raised'}
                overline={index === 0 ? 'Best fit' : undefined}
                icon={index === 0 ? 'package' : undefined}
              >
                <View style={styles.fill}>
                  <Text variant="display" tabular>
                    {Math.round(pairing.fill * 100)}%
                  </Text>
                  <Text variant="body" tone="secondary" style={styles.flex}>
                    of the trailer used
                  </Text>
                </View>

                <View style={[styles.bar, { backgroundColor: colours.surfaceDim }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.round(pairing.fill * 100)}%`,
                        backgroundColor: colours.moving,
                      },
                    ]}
                  />
                </View>

                <Half load={pairing.a} pays={pairing.shipperPays[0]} />
                <Half load={pairing.b} pays={pairing.shipperPays[1]} />

                <View style={[styles.total, { borderTopColor: colours.outline }]}>
                  <Text variant="title" style={styles.flex}>
                    You collect
                  </Text>
                  <Text variant="title" tabular>
                    {format(pairing.carrierGets)}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}

        {refused.length > 0 ? (
          <>
            <Text variant="overline" tone="secondary" style={styles.heading}>
              WON'T FIT TOGETHER
            </Text>

            {refused.map((entry) => (
              <Card key={`${entry.a.id}-${entry.b.id}`} emphasis="plain">
                <View style={styles.refusedTop}>
                  <Icon name="close" size="sm" colour={colours.textSecondary} />
                  <Text variant="body" tone="secondary" style={styles.flex}>
                    {entry.a.cargo} + {entry.b.cargo}
                  </Text>
                </View>
                <Text variant="label" tone="secondary" style={styles.gapTight}>
                  {entry.detail}
                </Text>
              </Card>
            ))}

            <Text variant="label" tone="secondary">
              A pair that fills less than {Math.round(MINIMUM_FILL * 100)}% of the
              truck is refused even when it would physically fit: two shippers,
              two sets of paperwork and two chances of a delay, for a trailer
              that is still mostly air.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Half({ load, pays }: { load: PairLoad; pays: number }) {
  const colours = useColours();

  return (
    <View style={[styles.half, { borderColor: colours.outline }]}>
      <View style={styles.flex}>
        <Text variant="body">{load.cargo}</Text>
        <Text variant="label" tone="secondary">
          {load.origin} → {load.destination} · {Math.round(load.weightKg / 1_000)} t
        </Text>
      </View>
      <View style={styles.pays}>
        <Text variant="body" tabular>
          {format(pays as never)}
        </Text>
        <Text variant="label" tone="secondary">
          was {format(load.offered)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  gapTight: { marginTop: space.xs },
  fill: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  bar: { height: 8, borderRadius: radius.pill, overflow: 'hidden', marginTop: space.sm },
  barFill: { height: 8, borderRadius: radius.pill },
  half: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  pays: { alignItems: 'flex-end' },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  refusedTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

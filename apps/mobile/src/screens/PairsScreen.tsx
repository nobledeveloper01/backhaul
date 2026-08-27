import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MINIMUM_FILL,
  SHIPPER_DISCOUNT_PCT,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import type { LoadView } from '../api/client';

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
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const { api } = useSession();

  /*
    Both halves come from the server, over the whole board.

    Pairing is quadratic in the number of loads, and the number of loads is the
    thing a phone does not have. The refusals are a route of their own for the
    same reason the chain's are: a carrier looking at two loads that nearly fit
    needs to know which of the five things is wrong.
  */
  const { query: pairs } = useMine(() => api.pairs('trailer_30t'), [api]);
  const { query: refusals } = useMine(() => api.pairRefusals('trailer_30t'), [api]);

  const found = pairs.state === 'ready' ? pairs.value : [];
  const refused = refusals.state === 'ready' ? refusals.value : [];

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('share_a_trailer')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {found.length === 0 ? (
          <Empty
            icon="package"
            title={t('no_pairs_on_the_board')}
            detail={t('nothing_fits_together')}
          />
        ) : (
          <>
            <Text variant="body" tone="secondary">
              Both shippers pay {SHIPPER_DISCOUNT_PCT}% less than a whole truck.
              {t('pairs_note')}
            </Text>

            {found.map((pairing, index) => (
              <Card
                key={`${pairing.a.id}-${pairing.b.id}`}
                emphasis={index === 0 ? 'accent' : 'raised'}
                overline={index === 0 ? t('best_fit') : undefined}
                icon={index === 0 ? 'package' : undefined}
              >
                <View style={styles.fill}>
                  <Text variant="display" tabular>
                    {pairing.fillPct}%
                  </Text>
                  <Text variant="body" tone="secondary" style={styles.flex}>
                    {t('of_the_trailer_used')}
                  </Text>
                </View>

                <View style={[styles.bar, { backgroundColor: colours.surfaceDim }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${pairing.fillPct}%`,
                        backgroundColor: colours.moving,
                      },
                    ]}
                  />
                </View>

                <Half load={pairing.a} pays={pairing.paysANaira} />
                <Half load={pairing.b} pays={pairing.paysBNaira} />

                <View style={[styles.total, { borderTopColor: colours.outline }]}>
                  <Text variant="title" style={styles.flex}>
                    {t('you_collect')}
                  </Text>
                  <Text variant="title" tabular>
                    {pairing.carrierGetsNaira}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}

        {refused.length > 0 ? (
          <>
            <Text variant="overline" tone="secondary" style={styles.heading}>
              {t('wont_fit_together').toUpperCase()}
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
              {Math.round(MINIMUM_FILL * 100)}% {t('of_the_truck_is_refused')}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Half({ load, pays }: { load: LoadView; pays: string }) {
  const colours = useColours();
  const { t } = useLanguage();

  return (
    <View style={[styles.half, { borderColor: colours.outline }]}>
      <View style={styles.flex}>
        <Text variant="body">{load.cargo}</Text>
        {/*
          No tonnage here: the cargo line above already says "14 t onions",
          and "· 14 t" after the corridor was the same fact twice in two lines.
        */}
        <Text variant="label" tone="secondary">
          {load.originName} → {load.destinationName}
        </Text>
      </View>
      <View style={styles.pays}>
        <Text variant="body" tabular>
          {pays}
        </Text>
        <Text variant="label" tone="secondary">
          {t('was_word')} {load.offeredNaira ?? '—'}
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

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  byKind,
  describeLevy,
  format,
  fromNaira,
  needsNote,
  reconcile,
  type Levy,
  type LevyKind,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { agoLabel } from '../components/PositionAge';
import { mono, radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow, type DemoTrip } from '../state/demo';
import { useLanguage } from '../state/language';
import { demoLevies } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/**
 * What the road took.
 *
 * Between Lagos and Kano a trailer passes police checkpoints, state revenue
 * points, union desks and weighbridges. Each takes cash, none gives a receipt
 * anybody keeps, and the total is carried in a driver's head and argued about
 * afterwards.
 *
 * A driver face: big targets, one tap per payment, and the amounts are the
 * ones actually handed over rather than a keypad. It is **not** a form — a
 * driver at a checkpoint has one hand and thirty seconds.
 */
const QUICK: readonly { readonly kind: LevyKind; readonly naira: number; readonly icon: IconName }[] = [
  { kind: 'police', naira: 1_000, icon: 'shield' },
  { kind: 'police', naira: 2_000, icon: 'shield' },
  { kind: 'union', naira: 5_000, icon: 'list' },
  { kind: 'state_revenue', naira: 7_500, icon: 'document' },
  { kind: 'weighbridge', naira: 5_000, icon: 'truck' },
  { kind: 'park', naira: 3_000, icon: 'pin' },
];

export function LeviesScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const { t } = useLanguage();

  const [levies, setLevies] = useState<readonly Levy[]>(() => demoLevies(trip, now));

  const advance = fromNaira(trip.advanceNaira);
  const { spent, balance, owedToDriver } = reconcile(advance, levies);
  const grouped = byKind(levies);

  const add = (kind: LevyKind, naira: number) => {
    setLevies((was) => [
      ...was,
      {
        id: `${trip.id}-levy-${was.length}`,
        tripId: trip.id,
        kind,
        amount: fromNaira(naira),
        at: now,
        near: null,
        note: '',
        photoId: null,
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      {/*
        The driver's own language, chosen once on their screen and applied
        everywhere on this face. It was per-screen state first, which meant the
        app agreed to speak Hausa and then did not.
      */}
      <ScreenHeader title={t('money_on_the_road')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Card emphasis="accent" overline={t('this_trip')} icon="naira">
          <Text variant="display" tabular>
            {format(spent)}
          </Text>

          <View style={[styles.balance, { borderTopColor: colours.accent }]}>
            <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
              {owedToDriver ? t('you_are_owed') : t('left_of_advance')}
            </Text>
            <Text
              variant="title"
              tabular
              tone={owedToDriver ? 'exception' : 'primary'}
            >
              {format(Math.abs(balance) as typeof balance)}
            </Text>
          </View>

          {owedToDriver ? (
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              You have spent more than you were given. That is the number this
              screen exists for.
            </Text>
          ) : null}
        </Card>

        <Text variant="overline" tone="secondary" style={styles.heading}>
          {t('add_what_you_paid').toUpperCase()}
        </Text>

        <View style={styles.grid}>
          {QUICK.map((option) => (
            <Press
              key={`${option.kind}-${option.naira}`}
              onPress={() => add(option.kind, option.naira)}
              accessibilityLabel={`${describeLevy(option.kind)}, ${option.naira} naira`}
              style={[styles.tile, { borderColor: colours.outline }]}
            >
              <Icon name={option.icon} size="md" colour={colours.textSecondary} />
              <Text variant="bodyDriver" tabular>
                ₦{(option.naira / 1_000).toFixed(option.naira % 1_000 === 0 ? 0 : 1)}k
              </Text>
              {/*
                Two lines. "Police checkpoint" is the longest of the six and
                came out as "Police check…" on a button whose only job is to
                say what the money went to.
              */}
              <Text variant="label" tone="secondary" numberOfLines={2} style={styles.centred}>
                {describeLevy(option.kind)}
              </Text>
            </Press>
          ))}
        </View>

        <Text variant="label" tone="secondary">
          Anything over {format(fromNaira(20_000))} asks what it was for — not to
          question it, but because that is the entry the office queries a week
          later.
        </Text>

        <Text variant="overline" tone="secondary" style={styles.heading}>
          {t('where_it_went').toUpperCase()}
        </Text>

        <Card emphasis="plain">
          {grouped.map((row) => (
            <View key={row.kind} style={styles.summaryRow}>
              <Text variant="body" style={styles.flex}>
                {describeLevy(row.kind)}
                <Text variant="label" tone="secondary">
                  {'  '}×{row.count}
                </Text>
              </Text>
              <Text variant="body" tabular>
                {format(row.amount)}
              </Text>
            </View>
          ))}
        </Card>

        <Text variant="overline" tone="secondary" style={styles.heading}>
          {t('every_stop').toUpperCase()}
        </Text>

        {[...levies]
          .sort((a, b) => b.at.getTime() - a.at.getTime())
          .map((levy) => (
            <View key={levy.id} style={[styles.entry, { borderBottomColor: colours.outline }]}>
              <View style={styles.flex}>
                <Text variant="body">{describeLevy(levy.kind)}</Text>
                <Text variant="label" tone="secondary">
                  {agoLabel(now.getTime() - levy.at.getTime(), t)}
                  {levy.note.length > 0 ? ` · ${levy.note}` : ''}
                  {needsNote(levy.amount) && levy.note.length === 0 ? ' · needs a note' : ''}
                </Text>
              </View>
              <Text variant="body" tabular style={mono}>
                {format(levy.amount)}
              </Text>
            </View>
          ))}

        <Text variant="label" tone="secondary">
          Once enough trips have run this corridor, the middle of these totals
          is what the lane actually costs — the number a carrier needs to price
          it and has never had.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  gapTop: { marginTop: space.md },
  heading: { marginTop: space.md },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  centred: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '31%',
    minHeight: target.driver + space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

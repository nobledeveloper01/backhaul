
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import type { RankedBidView } from '../api/client';

interface Props {
  readonly onBack: () => void;
}

/**
 * Whose bid to accept.
 *
 * The screen where the product earns trust or loses it. The cheapest bid is
 * not the best bid, and the ranking says so — but the price and the record sit
 * side by side on every row so a shipper can overrule it, which is the first
 * thing anybody does with a recommendation.
 */
export function BidsScreen({ onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const { api } = useSession();

  /*
    The newest load this shipper posted, and the bids on it.

    Two reads rather than one route that does both: a shipper with three open
    loads will want to move between them, and a route that answered "the bids
    on my newest load" would have to be replaced the day that screen exists.
  */
  const { query: mine } = useMine(() => api.myLoads(), [api]);
  const load = mine.state === 'ready' ? (mine.value[0] ?? null) : null;

  const { query: bidQuery, refresh } = useMine(
    async () =>
      load === null
        ? ({ ok: true, value: [] } as const)
        : api.bids(load.id),
    [api, load],
  );

  const ranked = bidQuery.state === 'ready' ? bidQuery.value : [];
  const cheapest = ranked.length === 0
    ? 0
    : Math.min(...ranked.map((scored) => scored.bid.amountKobo));

  const award = (bidId: string) => {
    if (load === null) return;
    void api.acceptBid(load.id, bidId).then(() => refresh());
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('bids')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.lede}>
          <Icon name="package" size="sm" colour={colours.textSecondary} />
          <Text variant="body" tone="secondary" style={styles.flex}>
            {load === null
              ? t('no_loads_posted')
              : `${load.originName} → ${load.destinationName} · ${load.cargo} · ${ranked.length} ${t('carriers_have_bid')}`}
          </Text>
        </View>

        {ranked.map((scored, index) => (
          <BidRow
            key={scored.bid.id}
            scored={scored}
            rank={index + 1}
            isCheapest={scored.bid.amountKobo === cheapest}
            onAward={() => award(scored.bid.id)}
          />
        ))}

        <Text variant="label" tone="secondary" style={styles.footer}>
          {t('bids_note')}
        </Text>
      </ScrollView>
    </View>
  );
}

function BidRow({
  scored,
  rank,
  isCheapest,
  onAward,
}: {
  scored: RankedBidView;
  rank: number;
  isCheapest: boolean;
  onAward: () => void;
}) {
  const colours = useColours();
  const { t } = useLanguage();
  const best = rank === 1;

  return (
    <Card emphasis={best ? 'accent' : 'raised'}>
      <View style={styles.top}>
        <Text variant="title" style={styles.flex} numberOfLines={2}>
          {scored.bid.tripsCompleted} {t('completed_trips')}
        </Text>
        {best ? (
          <View style={[styles.badge, { backgroundColor: colours.accent }]}>
            <Text variant="label" style={{ color: colours.onAccent }}>
              {t('recommended')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text variant="display">{scored.bid.amountNaira}</Text>
        {isCheapest ? (
          <View style={[styles.tag, { borderColor: colours.outline }]}>
            <Text variant="label" tone="secondary">
              {t('cheapest')}
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        The record, beside the price rather than behind a tap. A shipper
        overruling the ranking needs both numbers in one glance.
      */}
      <View style={styles.factRow}>
        {/*
          A tick is a claim that the record is good. At 33% on time it is the
          wrong glyph in the right colour, which reads as an endorsement with a
          warning tint — worse than either alone.
        */}
        <Icon
          name={
            scored.reliabilityPct === null
              ? 'clock'
              : scored.reliabilityPct >= 80
                ? 'check'
                : 'alert'
          }
          size="sm"
          colour={
            scored.reliabilityPct === null
              ? colours.textSecondary
              : scored.reliabilityPct >= 90
                ? colours.moving
                : scored.reliabilityPct >= 80
                  ? colours.stopped
                  : colours.exception
          }
        />
        <Text variant="body" tone="secondary" style={styles.flex}>
          {scored.because}
        </Text>
      </View>

      <View style={styles.factRow}>
        <Icon name="pin" size="sm" colour={colours.textSecondary} />
        <Text variant="body" tone="secondary" style={styles.flex}>
          {scored.kmToPickup === 0
            ? t('at_the_pickup_now')
            : `${scored.kmToPickup} ${t('km_from_the_pickup')}`}
        </Text>
      </View>

      <Press
        onPress={onAward}
        accessibilityLabel={t('award')}
        accessibilityHint={t('assigns_the_load')}
        style={[
          styles.award,
          best
            ? { backgroundColor: colours.accent }
            : { backgroundColor: 'transparent', borderColor: colours.outline, borderWidth: 1.5 },
        ]}
      >
        <Text
          variant="title"
          style={best ? { color: colours.onAccent } : { color: colours.accent }}
        >
          {t('award')}
        </Text>
      </Press>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  flex: { flex: 1 },
  lede: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  badge: { paddingHorizontal: space.md, paddingVertical: 3, borderRadius: radius.pill },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  tag: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  award: {
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  footer: { marginTop: space.sm },
});

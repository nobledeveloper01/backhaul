import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, rankBids, type BidScore } from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoBids } from '../state/fleet';

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
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);

  const { pickup, bids } = useMemo(() => demoBids(now), [now]);
  const ranked = useMemo(() => rankBids(bids, pickup), [bids, pickup]);

  const cheapest = Math.min(...bids.map((bid) => bid.amount as number));

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Bids" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.lede}>
          <Icon name="package" size="sm" colour={colours.textSecondary} />
          <Text variant="body" tone="secondary" style={styles.flex}>
            Kano → Lagos, 26 t cement. {bids.length} carriers have bid.
          </Text>
        </View>

        {ranked.map((scored, index) => (
          <BidRow
            key={scored.bid.id}
            scored={scored}
            rank={index + 1}
            isCheapest={(scored.bid.amount as number) === cheapest}
          />
        ))}

        <Text variant="label" tone="secondary" style={styles.footer}>
          Ranked on price against the cheapest offer, the carrier's record, and
          how far they are from the pickup. A carrier with no history ranks as
          unknown, not as bad — a marketplace that never surfaces a new carrier
          never gets a second one.
        </Text>
      </ScrollView>
    </View>
  );
}

function BidRow({
  scored,
  rank,
  isCheapest,
}: {
  scored: BidScore;
  rank: number;
  isCheapest: boolean;
}) {
  const colours = useColours();
  const best = rank === 1;

  return (
    <Card emphasis={best ? 'accent' : 'raised'}>
      <View style={styles.top}>
        <Text variant="title" style={styles.flex} numberOfLines={2}>
          {scored.bid.carrierId}
        </Text>
        {best ? (
          <View style={[styles.badge, { backgroundColor: colours.accent }]}>
            <Text variant="label" style={{ color: colours.onAccent }}>
              Recommended
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text variant="display">{format(scored.bid.amount)}</Text>
        {isCheapest ? (
          <View style={[styles.tag, { borderColor: colours.outline }]}>
            <Text variant="label" tone="secondary">
              Cheapest
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        The record, beside the price rather than behind a tap. A shipper
        overruling the ranking needs both numbers in one glance.
      */}
      <View style={styles.factRow}>
        <Icon
          name={scored.reliability === null ? 'clock' : 'check'}
          size="sm"
          colour={
            scored.reliability === null
              ? colours.textSecondary
              : scored.reliability >= 0.9
                ? colours.moving
                : colours.stopped
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
            ? 'At the pickup now'
            : `${scored.kmToPickup} km from the pickup`}
        </Text>
      </View>

      <Press
        onPress={() => {}}
        accessibilityLabel={`Award to ${scored.bid.carrierId}`}
        accessibilityHint="Assigns the load to this carrier"
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
          Award
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

import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, fromNaira, type Kobo } from '@backhaul/domain';

import { Card } from '../components/Card';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { plural } from '../components/PositionAge';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly onBack: () => void;
}

interface PastTrip {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly cargo: string;
  readonly finishedDaysAgo: number;
  readonly km: number;
  readonly earned: Kobo;
  readonly onTime: boolean;
}

/**
 * What the driver has actually done.
 *
 * The driver's own record, in their hands. The trust metrics a shipper sees —
 * trips completed, on-time percentage — are computed server-side from tracked
 * arrivals and are immutable to clients (backend spec §4). A driver who cannot
 * see the same figures has no way to notice one is wrong, which is how a
 * ratings system becomes something done *to* people.
 */
export function DriverHistoryScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();

  const trips = useMemo<PastTrip[]>(
    () => [
      {
        id: 'p1',
        from: 'Kano',
        to: 'Lagos',
        cargo: '26 t cement',
        finishedDaysAgo: 3,
        km: 1010,
        earned: fromNaira(1_850_000),
        onTime: true,
      },
      {
        id: 'p2',
        from: 'Lagos',
        to: 'Kaduna',
        cargo: '15 t bagged rice',
        finishedDaysAgo: 9,
        km: 760,
        earned: fromNaira(1_320_000),
        onTime: true,
      },
      {
        id: 'p3',
        from: 'Ibadan',
        to: 'Port Harcourt',
        cargo: '12 t machine parts',
        finishedDaysAgo: 16,
        km: 590,
        earned: fromNaira(1_060_000),
        // Late, and shown as late. A record a driver cannot see going against
        // them is a record they cannot argue with.
        onTime: false,
      },
    ],
    [],
  );

  const totalEarned = trips.reduce((sum, trip) => (sum + trip.earned) as Kobo, 0 as Kobo);
  const totalKm = trips.reduce((sum, trip) => sum + trip.km, 0);
  const onTime = trips.filter((trip) => trip.onTime).length;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Your trips" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <Card overline="This month" icon="naira" emphasis="accent">
          <Text variant="display">{format(totalEarned)}</Text>
          <Text variant="bodyDriver" tone="secondary" style={styles.gap}>
            {plural(trips.length, 'trip')} · {totalKm.toLocaleString('en-NG')} km ·{' '}
            {onTime} of {trips.length} on time
          </Text>
        </Card>

        {trips.length === 0 ? (
          <Empty
            icon="truck"
            title="No trips yet"
            detail="Your completed trips and what they paid will show up here."
          />
        ) : (
          trips.map((trip) => <PastRow key={trip.id} trip={trip} />)
        )}

        <Text variant="label" tone="secondary" style={styles.footer}>
          On-time is measured from tracked arrivals, not from anybody's report —
          including yours. If one of these looks wrong, it is worth disputing.
        </Text>
      </ScrollView>
    </View>
  );
}

function PastRow({ trip }: { trip: PastTrip }) {
  const colours = useColours();

  return (
    <Card>
      <View style={styles.top}>
        <View style={styles.route}>
          <Text variant="title">{trip.from}</Text>
          <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
          <Text variant="title">{trip.to}</Text>
        </View>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: trip.onTime ? colours.movingWash : colours.stoppedWash,
              borderColor: trip.onTime ? colours.moving : colours.stopped,
            },
          ]}
        >
          <Icon
            name={trip.onTime ? 'check' : 'clock'}
            size="sm"
            colour={trip.onTime ? colours.moving : colours.stopped}
          />
          <Text
            variant="label"
            style={{ color: trip.onTime ? colours.moving : colours.stopped }}
          >
            {trip.onTime ? 'On time' : 'Late'}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Icon name="package" size="sm" colour={colours.textSecondary} />
        <Text variant="body" tone="secondary" style={styles.flex}>
          {trip.cargo} · {trip.km} km
        </Text>
      </View>

      <View style={styles.bottom}>
        <Text variant="title" tabular>
          {format(trip.earned)}
        </Text>
        <Text variant="label" tone="secondary">
          {plural(trip.finishedDaysAgo, 'day')} ago
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  flex: { flex: 1 },
  gap: { marginTop: space.xs },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  route: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.md,
    gap: space.md,
  },
  footer: { marginTop: space.sm },
});

import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  format,
  fromNaira,
  type Kobo,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Unready } from '../components/Unready';
import { Text } from '../components/Text';
import { agoLabel, humanDuration, plural } from '../components/PositionAge';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import { demoNow } from '../state/demo';

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
  const { t } = useLanguage();
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

  const now = useMemo(demoNow, []);
  const { api } = useSession();

  /*
    The window is a parameter, and the server does the arithmetic.

    "This month" is a question about a calendar, and an engine that guesses
    which month somebody meant is wrong in the first week of every one — so
    `earnings.ts` takes the window from its caller, and this screen is the
    caller. Thirty days back from now, which is what "this month" means to a
    driver rather than what it means to a calendar.
  */
  const from = useMemo(() => new Date(now.getTime() - 30 * 86_400_000), [now]);
  const { query, refresh } = useMine(() => api.earnings(from, now), [api, from, now]);

  const month = query.state === 'ready' ? query.value : null;
  const owed = month?.unpaid ?? [];
  const perKm = month?.perKilometreKobo ?? null;
  const waiting = month?.longestWaitMs ?? null;

  const totalEarned = trips.reduce((sum, trip) => (sum + trip.earned) as Kobo, 0 as Kobo);
  const totalKm = trips.reduce((sum, trip) => sum + trip.km, 0);
  const onTime = trips.filter((trip) => trip.onTime).length;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('your_trips')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        {/*
          Nothing derived from the answer until there is one.

          The binding above fell back to an empty list (or the walkthrough) on
          every outcome that was not a value, so a server this phone could not
          reach rendered as a fact about somebody's own records. See `Unready`.
        */}
        <Unready query={query} onRetry={refresh} />

        {query.state !== 'ready' ? null : (
          <>
            <Card overline={t('this_month')} icon="naira" emphasis="accent">
              <Text variant="display">{format(totalEarned)}</Text>
              <Text variant="bodyDriver" tone="secondary" style={styles.gap}>
                {trips.length} {t('trips_word')} · {totalKm.toLocaleString('en-NG')} km ·{' '}
                {onTime}/{trips.length} {t('on_time_word')}
              </Text>
            </Card>

            {/*
              The statement.

              A driver's relationship with this product is asymmetric: they carry
              the tracking, they take the risk on the road, and until now the app
              told them nothing they could use. What a kilometre earned is a figure
              nobody has ever been able to give them.
            */}
            <Card overline={t('what_you_are_owed')} icon="document">
              <View style={styles.figures}>
                <View style={styles.figure}>
                  <Text variant="headline" tabular>
                    {month?.outstandingNaira ?? '—'}
                  </Text>
                  <Text variant="label" tone="secondary">
                    {t('still_to_come')}
                  </Text>
                </View>
                <View style={styles.figure}>
                  <Text variant="headline" tabular>
                    {perKm === null ? '—' : format(perKm as Kobo)}
                  </Text>
                  <Text variant="label" tone="secondary">
                    a kilometre
                  </Text>
                </View>
              </View>

              {(month?.outOfPocketKobo ?? 0) > 0 ? (
                <View style={[styles.pocket, { borderTopColor: colours.outline }]}>
                  <Icon name="alert" size="sm" colour={colours.stopped} />
                  <Text variant="bodyDriver" tone="stopped" style={styles.flex}>
                    {format((month?.outOfPocketKobo ?? 0) as Kobo)}{' '}
                    {t('of_that_is_your_own_money')}
                  </Text>
                </View>
              ) : null}

              {waiting !== null ? (
                <Text variant="label" tone="secondary" style={styles.gap}>
                  {humanDuration(waiting, t)} — {t('oldest_unpaid_waiting')}{' '}
                  {t('oldest_unpaid_note')}
                </Text>
              ) : (
                <Text variant="label" tone="secondary" style={styles.gap}>
                  {t('every_trip_settled')}
                </Text>
              )}
            </Card>

            {owed.length > 0 ? (
              <>
                <Text variant="overline" tone="secondary" style={styles.sectionHead}>
                  {t('not_paid_yet').toUpperCase()}
                </Text>

                {owed.map((earning) => (
                  <View
                    key={earning.tripId}
                    style={[styles.owedRow, { borderBottomColor: colours.outline }]}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyDriver">{earning.corridor}</Text>
                      <Text variant="label" tone="secondary">
                        {agoLabel(now.getTime() - earning.deliveredAt.getTime(), t)} ·{' '}
                        {t('delivered_lower')}
                      </Text>
                    </View>
                    <Text variant="bodyDriver" tabular>
                      {earning.payNaira}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}

            {trips.length === 0 ? (
              <Empty
                icon="truck"
                title={t('no_trips_yet_history')}
                detail={t('history_empty_detail')}
              />
            ) : (
              trips.map((trip) => <PastRow key={trip.id} trip={trip} />)
            )}

            <Text variant="label" tone="secondary" style={styles.footer}>
              {t('on_time_note')}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PastRow({ trip }: { trip: PastTrip }) {
  const colours = useColours();
  const { t } = useLanguage();

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
            {t(trip.onTime ? 'on_time' : 'late')}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Icon name="package" size="sm" colour={colours.textSecondary} beside="body" />
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
  figures: { flexDirection: 'row', gap: space.lg },
  figure: { flex: 1, gap: 2 },
  pocket: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  owedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHead: { marginTop: space.md },
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
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.md,
    gap: space.md,
  },
  footer: { marginTop: space.sm },
});

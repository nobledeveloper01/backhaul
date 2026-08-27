import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isThin, type Evidence, type Pack, type Weight } from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { humanDuration } from '../components/PositionAge';
import { mono, radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { map } from '../api/client';
import { whatThePackHolds } from '../state/words';
import type { Words } from '../components/PositionAge';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoDispute } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

const clock = (at: Date) =>
  at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const day = (at: Date) =>
  at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Everything the trip recorded, in the order it happened.
 *
 * This screen is what every careful decision so far was for. The append-only
 * history, the fixes that were discarded and why, the message written in a
 * dead zone and delivered eleven hours later — individually each is a detail;
 * assembled in time order they are the reason two people can settle in an
 * afternoon rather than in a year.
 *
 * **It takes no side.** No summary, no fault, no "the evidence suggests". Each
 * item says how it got here and the humans do the rest.
 */
/** What a pack looks like before one has arrived. Not a pack with nothing in
 * it — a pack that has not been read yet, which the screen says out loud. */
const EMPTY_PACK: Pack = {
  tripId: '',
  assembledAt: new Date(0),
  items: [],
  counts: { measured: 0, attested: 0, late_attested: 0 },
  gaps: [],
  coveredMs: 0,
};

export function DisputeScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const { api } = useSession();

  /*
    The pack is assembled on the server, and that is the point.

    It reads six tables — the append-only history, the position runs, the
    thread, the incidents, the sealed proof, the share links — and this phone
    holds at most a slice of any of them. A pack assembled from what one device
    happens to have cached is a pack that is missing whatever it missed.
  */
  const { query } = useTripData(
    trip.live,
    async () =>
      map(await api.disputePack(trip.id), (view) => ({
        tripId: view.tripId,
        assembledAt: view.assembledAt,
        items: view.items.map((item) => ({
          kind: item.kind as Evidence['kind'],
          at: item.at,
          ...(item.until === null ? {} : { until: item.until }),
          receivedAt: item.receivedAt,
          summary: item.summary,
          source: item.source as Evidence['source'],
          weight: item.weight as Weight,
        })),
        counts: {
          measured: view.measured,
          attested: view.attested,
          late_attested: view.lateAttested,
        },
        gaps: view.gaps,
        coveredMs: view.coveredMs,
      })),
    () => demoDispute(trip, now),
    [api, trip.id, now],
  );

  const pack = query.state === 'ready' ? query.value : EMPTY_PACK;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('what_the_record_shows')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {query.state !== 'ready' ? (
          <Text variant="body" tone="stale" style={styles.gapTight}>
            {query.state === 'loading' ? t('loading_state') : t('could_not_load')}
          </Text>
        ) : null}

        <Card emphasis="accent" overline={t('the_pack')} icon="document">
          <Text variant="title">{whatThePackHolds(
              pack.items.length,
              pack.counts.measured,
              pack.counts.late_attested,
              Math.round(pack.gaps.reduce((sum, gap) => sum + gap.ms, 0) / 3_600_000),
              t,
            )}</Text>

          <View style={styles.counts}>
            <Count
              label={t('measured_word')}
              value={pack.counts.measured}
              detail={t('by_the_tracker')}
              colour={colours.moving}
            />
            <Count
              label={t('reported_word')}
              value={pack.counts.attested}
              detail={t('by_a_person')}
              colour={colours.accent}
            />
            {/*
              "1 / Reported late / hours afterwards" was what this said, and
              the third line read as part of the number. A column's detail has
              to finish the sentence its label started, not start a new one.
            */}
            <Count
              label={t('reported_late_word')}
              value={pack.counts.late_attested}
              detail={t('hours_after_the_fact')}
              colour={colours.stale}
            />
          </View>

          <Text variant="label" tone="secondary" style={styles.gapTop}>
            {humanDuration(pack.coveredMs, t)} of the trip is covered by tracking.
          </Text>

          {isThin(pack) ? (
            <Text variant="label" tone="stopped" style={styles.gapTight}>
              {t('not_much_here')}
            </Text>
          ) : null}
        </Card>

        {pack.gaps.length > 0 ? (
          <Card overline={t('nothing_recorded')} icon="signal-off" emphasis="plain">
            {pack.gaps.map((gap) => (
              <View key={gap.from.toISOString()} style={styles.line}>
                <Text variant="body" style={styles.flex}>
                  {humanDuration(gap.ms, t)} between {clock(gap.from)} and {clock(gap.to)}
                </Text>
              </View>
            ))}
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              {t('hole_note')}
            </Text>
          </Card>
        ) : null}

        <Text variant="overline" tone="secondary" style={styles.heading}>
          {t('in_the_order_it_happened').toUpperCase()}
        </Text>

        {pack.items.map((item, index) => {
          const previous = pack.items[index - 1];
          const newDay = previous === undefined || day(previous.at) !== day(item.at);

          return (
            <View key={`${item.at.toISOString()}-${index}`}>
              {newDay ? (
                <Text variant="overline" tone="secondary" style={styles.dayHead}>
                  {day(item.at).toUpperCase()}
                </Text>
              ) : null}

              <View style={styles.item}>
                <Text variant="label" tone="secondary" style={[styles.time, mono]}>
                  {clock(item.at)}
                </Text>

                <View
                  style={[
                    styles.pip,
                    { backgroundColor: weightColour(item.weight, colours) },
                  ]}
                />

                <View style={styles.flex}>
                  <Text variant="body">{item.summary}</Text>
                  <View style={styles.meta}>
                    <Icon
                      name={weightIcon(item.weight)}
                      size="sm"
                      colour={colours.textSecondary}
                    />
                    <Text variant="label" tone="secondary">
                      {weightLabel(item.weight, t)}
                      {item.weight === 'late_attested' && item.receivedAt !== null
                        ? ` · ${humanDuration(
                            item.receivedAt.getTime() - item.at.getTime(),
                            t,
                          )} ${t('later')}`
                        : ''}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Count({
  label,
  value,
  detail,
  colour,
}: {
  label: string;
  value: number;
  detail: string;
  colour: string;
}) {
  return (
    <View style={styles.count}>
      <Text variant="headline" tabular style={{ color: colour }}>
        {value}
      </Text>
      <Text variant="label">{label}</Text>
      <Text variant="label" tone="secondary">
        {detail}
      </Text>
    </View>
  );
}

function weightColour(weight: Weight, colours: ReturnType<typeof useColours>): string {
  switch (weight) {
    case 'measured':
      return colours.moving;
    case 'attested':
      return colours.accent;
    case 'late_attested':
      return colours.stale;
  }
}

function weightIcon(weight: Weight): IconName {
  return weight === 'measured' ? 'signal' : weight === 'attested' ? 'pen' : 'clock';
}

function weightLabel(weight: Weight, t: Words): string {
  switch (weight) {
    case 'measured':
      return t('measured_word');
    case 'attested':
      return t('reported_word');
    case 'late_attested':
      return t('reported_late_word');
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  gapTop: { marginTop: space.md },
  gapTight: { marginTop: space.xs },
  heading: { marginTop: space.md },
  dayHead: { marginTop: space.md, marginBottom: space.xs },
  counts: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  count: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', paddingVertical: space.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.sm,
  },
  time: { width: 44, paddingTop: 2 },
  pip: { width: 8, height: 8, borderRadius: radius.pill, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});

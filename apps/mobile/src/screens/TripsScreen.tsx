import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NO_TRIP_FILTER,
  describeTripFilter,
  filterTrips,
  isFiltering,
  observe,
  shouldTrack,
  silentFor,
  type Observation,
  type TripFilter,
  type TripState,
  type Phrase,
  type TripSummary,
} from '@backhaul/domain';

import { Appear } from '../components/Appear';
import { Chip } from '../components/Chip';
import { Empty } from '../components/Empty';
import { Icon, type IconName } from '../components/Icon';
import { PositionAge } from '../components/PositionAge';
import { SearchField } from '../components/SearchField';
import { StatusChip } from '../components/StatusChip';
import { Text } from '../components/Text';
import { ThemeToggle } from '../components/ThemeToggle';
import { radius, space, target } from '../design/tokens';
import { useColours, useElevation } from '../design/theme';
import { demoNow, demoTrips, type DemoTrip } from '../state/demo';
import type { TripSummaryView } from '../api/client';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { emptiness, useQuery } from '../state/server';
import { refusalWords } from '../state/words';

interface Props {
  readonly onOpen: (trip: DemoTrip) => void;
}

/**
 * The list's view of a trip, for the filter engine.
 *
 * Built here rather than stored, because everything in it is either already on
 * the phone or derived from a track that is. The point of the narrow shape is
 * that the same predicate runs on the server against a load board this device
 * has never seen.
 */
function summarise(trip: DemoTrip, now: Date): TripSummary {
  const state: TripState = trip.history[trip.history.length - 1]?.state ?? 'open';
  const observation = observe(trip.track.kept, now);

  return {
    id: trip.id,
    reference: trip.id.slice(-4).toUpperCase(),
    state,
    origin: trip.originName,
    destination: trip.destinationName,
    cargo: trip.cargo,
    truckPlate: trip.plate,
    driverName: trip.driver,
    startedAt: trip.history[0]?.at ?? now,
    hasOpenIncident: observation === 'stalled',
    isLate: observation === 'silent' || observation === 'stalled',
  };
}

/**
 * A server row, as this list needs it.
 *
 * The list renders a corridor, a state and an age, and the server sends
 * exactly those — no history and no positions. What it cannot send is the
 * track, so the fields the walkthrough fills from a `CleanedTrack` are empty
 * here rather than invented: an empty track produces `unknown`, which is what
 * this app renders when it does not know, and that is the correct answer.
 *
 * The one field worth naming is `lastSeenAt`. Null means no position has ever
 * arrived, which is *not* "a long time ago" — a trip that has not started
 * reads "not started", never "no signal for 56 years".
 */
function fromServer(row: TripSummaryView): DemoTrip {
  const at = row.lastSeenAt ?? row.startedAt;

  return {
    id: row.id,
    cargo: '',
    originName: row.origin,
    destinationName: row.destination,
    origin: { lat: 0, lon: 0, accuracy: 0, at: row.startedAt },
    destination: { lat: 0, lon: 0, accuracy: 0, at: row.startedAt },
    truck: 'trailer_30t',
    plate: '',
    driver: '',
    carrier: '',
    history: [{ state: row.state, at: row.startedAt, actor: 'system' }],
    track:
      row.lastSeenAt === null
        ? { kept: [], dropped: [] }
        : { kept: [{ lat: 0, lon: 0, accuracy: 10, at }], dropped: [] },
    raw: [],
    agreedNaira: 0,
    advanceNaira: 0,
    waitedMinutes: 0,
  };
}

/**
 * The states worth offering as a filter.
 *
 * Not all ten. A filter row with every state in it is a state machine diagram
 * on a phone, and the four here are the four a fleet owner actually sorts by.
 */
const STATE_FILTERS: readonly {
  readonly label: Phrase;
  readonly icon: IconName;
  readonly states: readonly TripState[];
}[] = [
  // A different icon each, or none. The first version gave all four the same
  // route glyph, which rendered as a row of identical marks carrying no
  // information and taking the space a longer label needed.
  { label: 'on_the_road', icon: 'truck', states: ['in_transit', 'signal_lost', 'stalled'] },
  { label: 'loading_state', icon: 'package', states: ['loading'] },
  { label: 'arrived_state', icon: 'pin', states: ['arrived'] },
  { label: 'delivered_state', icon: 'check', states: ['delivered'] },
];

/**
 * The shipper's list. Every row answers "where is it and is it moving?".
 *
 * The list comes from the server, and the walkthrough trips are shown *only*
 * when it answers with none — labelled as the walkthrough, because a demo that
 * cannot be told apart from real data is how somebody ends up trusting it.
 *
 * A server that cannot be reached is not an empty list. That distinction is
 * the whole of `emptiness`, and it is the same one `observe()` makes between
 * *stopped* and *unknown*: a shipper on a bad connection has trips, and this
 * phone cannot see them.
 */
export function TripsScreen({ onOpen }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const { t } = useLanguage();
  const { api } = useSession();

  const [filter, setFilter] = useState<TripFilter>(NO_TRIP_FILTER);

  // Unfiltered. The filter runs locally on what came back, so typing does not
  // fire a request per keystroke on a network that charges for each one — and
  // `search.ts` gives the same answer either side, which is what the parity
  // fixtures are for.
  const { query, refresh } = useQuery(() => api.trips(), [api]);

  const live = query.state === 'ready' ? query.value : [];
  const walkthrough = live.length === 0 && query.state === 'ready';

  const trips = useMemo(
    () => (walkthrough ? demoTrips(now) : live.map(fromServer)),
    [walkthrough, live, now],
  );

  const shown = useMemo(() => {
    const summaries = filterTrips(
      trips.map((trip) => summarise(trip, now)),
      filter,
    );
    const keep = new Set(summaries.map((summary) => summary.id));
    return trips.filter((trip) => keep.has(trip.id));
  }, [trips, filter, now]);

  const attention = trips.filter((trip) => needsAttention(trip, now)).length;
  const filtering = isFiltering(filter);
  const empty = emptiness(query, shown.length, filtering);

  const toggleStates = (states: readonly TripState[]) => {
    setFilter((was) => {
      const on = states.every((state) => was.states.includes(state));
      return {
        ...was,
        states: on
          ? was.states.filter((state) => !states.includes(state))
          : [...was.states, ...states.filter((state) => !was.states.includes(state))],
      };
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <FlatList
        data={shown}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text variant="headline" style={styles.flex}>
                {t('on_the_road')}
              </Text>
              <ThemeToggle />
            </View>
            {/*
              A count, not a decoration. The first thing a fleet owner does at
              6am is find out whether anything needs them — and the answer is
              usually "no", which is worth saying rather than making them read
              six rows to work out.
            */}
            <SearchField
              value={filter.text}
              onChange={(text) => setFilter((was) => ({ ...was, text }))}
              // Three words, not four: at the largest text size the longer
              // version ran off the right edge of the field.
              placeholder={t('search_trips')}
              accessibilityLabel={t('search_trips_label')}
            />

            {/*
              Horizontal, and scrollable rather than wrapped. Wrapped, the row
              grew to three lines at the largest text size and pushed the first
              trip below the fold — on the one screen whose whole job is to
              show trips.
            */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {STATE_FILTERS.map((option) => (
                <Chip
                  key={option.label}
                  label={t(option.label)}
                  icon={option.icon}
                  selected={option.states.every((state) => filter.states.includes(state))}
                  onPress={() => toggleStates(option.states)}
                />
              ))}
              <Chip
                label={t('needs_a_look')}
                icon="alert"
                selected={filter.onlyLate}
                onPress={() => setFilter((was) => ({ ...was, onlyLate: !was.onlyLate }))}
              />
              {filtering ? (
                <Chip
                  label={t('clear')}
                  icon="close"
                  selected={false}
                  onPress={() => setFilter(NO_TRIP_FILTER)}
                />
              ) : null}
            </ScrollView>

            {/*
              The filter as a sentence, and only while one is on. A chip row
              says *that* something is filtered; this says *which*, and that is
              the difference between "no trips" reading as a bug and reading as
              an answer.
            */}
            {filtering ? (
              <Text variant="label" tone="secondary">
                {describeTripFilter(filter)} · {shown.length}/{trips.length}
              </Text>
            ) : null}

            {/*
              Said out loud, not implied. A walkthrough that cannot be told
              apart from real data is how somebody ends up making a decision on
              it, and the sentence costs one line.
            */}
            {walkthrough ? (
              <Text variant="label" tone="stale">
                {t('showing_the_walkthrough')}
              </Text>
            ) : null}

            <View style={styles.summary}>
              {/*
                Top-aligned, not centre. At the largest text size this line
                wraps to three, and a centred icon floats in the gap between
                lines two and three instead of sitting beside the first word.
              */}
              <View style={styles.summaryIcon}>
                <Icon
                  name={attention === 0 ? 'check' : 'alert'}
                  size="sm"
                  colour={attention === 0 ? colours.moving : colours.stopped}
                />
              </View>
              <Text
                variant="body"
                tone={attention === 0 ? 'moving' : 'stopped'}
                style={styles.flex}
              >
                {/*
                  The count first, then the phrase — "1 of 3 need a look" puts
                  two numbers inside a sentence, and this app is read in four
                  languages that do not agree on where the middle of a sentence
                  is. A fraction and a phrase say the same thing and survive
                  translation.
                */}
                {attention === 0
                  ? `${trips.length} · ${t('all_moving')}`
                  : `${attention}/${trips.length} · ${t('need_a_look')}`}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          /*
            Four empty screens, not one.

            "Nothing yet", "nothing matching", "cannot see" and "the server
            said no" are four different facts, and only the first two are about
            this person's data. Collapsing them into "no trips" tells a shipper
            on a bad stretch of road that their trucks have disappeared.
          */
          empty === 'loading' ? (
            <Empty icon="clock" title={t('loading_your_trips')} detail="" />
          ) : empty === 'unreachable' ? (
            <Empty
              icon="signal-off"
              title={t('cannot_reach_the_server')}
              detail={t('your_trips_are_still_there')}
              action={{ label: t('try_again'), onPress: refresh }}
            />
          ) : empty === 'refused' ? (
            <Empty
              icon="alert"
              title={t('cannot_reach_the_server')}
              detail={
                query.state === 'refused'
                  ? refusalWords(
                      query.failure.kind === 'refused' ? query.failure.code : null,
                      query.failure.detail,
                      t,
                    )
                  : ''
              }
              action={{ label: t('try_again'), onPress: refresh }}
            />
          ) : empty === 'filtered' ? (
            <Empty
              icon="search"
              title={t('nothing_matches_that')}
              detail={`${describeTripFilter(filter)} — ${t('none_on_the_road_now')}`}
              action={{ label: t('clear_the_filter'), onPress: () => setFilter(NO_TRIP_FILTER) }}
            />
          ) : (
            <Empty
              icon="truck"
              title={t('no_trips_yet')}
              detail={t('already_got_a_truck')}
            />
          )
        }
        ItemSeparatorComponent={Separator}
        renderItem={({ item, index }) => (
          <Appear index={index}>
            <Row trip={item} now={now} onPress={() => onOpen(item)} />
          </Appear>
        )}
      />
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

/**
 * A trip, at a glance.
 *
 * The leading rail is the whole point of the row's layout: six trips scanned
 * in a second are scanned down a colour edge, not by reading six status words.
 * The word is still there beside it, because colour is never the only carrier.
 */
const Row = memo(function Row({
  trip,
  now,
  onPress,
}: {
  trip: DemoTrip;
  now: Date;
  onPress: () => void;
}) {
  const colours = useColours();
  const { t } = useLanguage();
  const elevation = useElevation();

  const state = trip.history[trip.history.length - 1]?.state ?? 'open';
  const tracking = shouldTrack(state);
  const observation = observe(trip.track.kept, now);
  const silence = silentFor(trip.track.kept, now);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[trip.cargo, `${trip.originName} → ${trip.destinationName}`]
        .filter((part) => part !== '')
        .join(', ')}
      accessibilityHint={t('opens_the_trip')}
      style={({ pressed }) => [
        styles.row,
        elevation.raised,
        {
          backgroundColor: colours.surfaceRaised,
          borderColor: colours.outline,
          // Opacity rather than a transform: a scale on a list row shifts its
          // neighbours and the whole list twitches under the thumb.
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={[styles.rail, { backgroundColor: railColour(observation, tracking, colours) }]} />

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.route}>
            <Text variant="title">{trip.originName}</Text>
            <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
            <Text variant="title">{trip.destinationName}</Text>
          </View>
          <Icon name="chevron-right" size="md" colour={colours.outline} />
        </View>

        {/*
          Dropped entirely when there is nothing to say.

          The walkthrough always has a cargo and a plate; the server has
          neither in its schema yet, so this rendered as a package icon beside
          a bare middot — which reads as a bug rather than as an absence. An
          empty row is better than a row that looks broken.
        */}
        {[trip.cargo, trip.plate].some((part) => part !== '') ? (
          <View style={styles.meta}>
            <View style={styles.summaryIcon}>
              <Icon name="package" size="sm" colour={colours.textSecondary} />
            </View>
            <Text variant="body" tone="secondary" style={styles.metaText}>
              {[trip.cargo, trip.plate].filter((part) => part !== '').join(' · ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <StatusChip observation={observation} tracking={tracking} />
          <PositionAge silentForMs={silence} compact />
        </View>
      </View>
    </Pressable>
  );
});

function railColour(
  observation: Observation,
  tracking: boolean,
  colours: ReturnType<typeof useColours>,
): string {
  if (!tracking) return colours.outline;
  switch (observation) {
    case 'moving':
      return colours.moving;
    case 'stopped':
      return colours.stopped;
    case 'stalled':
      return colours.exception;
    case 'silent':
      return colours.stale;
    case 'unknown':
      return colours.outline;
  }
}

/** Anything a fleet owner would want to know about without opening it. */
function needsAttention(trip: DemoTrip, now: Date): boolean {
  const observation = observe(trip.track.kept, now);
  return observation === 'stalled' || observation === 'silent';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: space.lg },
  header: { marginBottom: space.lg, gap: space.md },
  chips: { gap: space.sm, paddingRight: space.lg },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  summaryIcon: { paddingTop: 3 },
  separator: { height: space.md },
  row: {
    minHeight: target.standard,
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  rail: { width: 4 },
  rowBody: { flex: 1, padding: space.lg, gap: space.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  route: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  metaText: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
});

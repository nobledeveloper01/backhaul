import { memo, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { observe, shouldTrack, silentFor, type Observation } from '@backhaul/domain';

import { Icon } from '../components/Icon';
import { PositionAge } from '../components/PositionAge';
import { StatusChip } from '../components/StatusChip';
import { Text } from '../components/Text';
import { ThemeToggle } from '../components/ThemeToggle';
import { radius, space, target } from '../design/tokens';
import { useColours, useElevation } from '../design/theme';
import { demoNow, demoTrips, type DemoTrip } from '../state/demo';

interface Props {
  readonly onOpen: (trip: DemoTrip) => void;
}

/** The shipper's list. Every row answers "where is it and is it moving?". */
export function TripsScreen({ onOpen }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const trips = useMemo(() => demoTrips(now), [now]);

  const attention = trips.filter((trip) => needsAttention(trip, now)).length;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <FlatList
        data={trips}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text variant="headline" style={styles.flex}>
                On the road
              </Text>
              <ThemeToggle />
            </View>
            {/*
              A count, not a decoration. The first thing a fleet owner does at
              6am is find out whether anything needs them — and the answer is
              usually "no", which is worth saying rather than making them read
              six rows to work out.
            */}
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
                {attention === 0
                  ? `All ${trips.length} moving as expected`
                  : `${attention} of ${trips.length} need a look`}
              </Text>
            </View>
          </View>
        }
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => <Row trip={item} now={now} onPress={() => onOpen(item)} />}
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
  const elevation = useElevation();

  const state = trip.history[trip.history.length - 1]?.state ?? 'open';
  const tracking = shouldTrack(state);
  const observation = observe(trip.track.kept, now);
  const silence = silentFor(trip.track.kept, now);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${trip.cargo}, ${trip.originName} to ${trip.destinationName}`}
      accessibilityHint="Opens the trip"
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

        <View style={styles.meta}>
          <View style={styles.summaryIcon}>
            <Icon name="package" size="sm" colour={colours.textSecondary} />
          </View>
          <Text variant="body" tone="secondary" style={styles.metaText}>
            {trip.cargo} · {trip.plate}
          </Text>
        </View>

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
  header: { marginBottom: space.lg, gap: space.sm },
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

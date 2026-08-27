import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  demurrage,
  distance,
  distanceTravelled,
  eta,
  fixQuality,
  format,
  fromNaira,
  observe,
  settle,
  shouldTrack,
  silentFor,
  stops,
  timeStopped,
  type Kobo,
  type Position,
  type Stop,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Corridor } from '../components/Corridor';
import { EtaRange } from '../components/EtaRange';
import { Icon } from '../components/Icon';
import { PositionAge, agoLabel, plural } from '../components/PositionAge';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sparkline } from '../components/Sparkline';
import { StatusChip } from '../components/StatusChip';
import { Text } from '../components/Text';
import { space } from '../design/tokens';
import { useColours } from '../design/theme';
import type { DemoTrip } from '../state/demo';

interface Props {
  readonly trip: DemoTrip;
  readonly now: Date;
  readonly onBack: () => void;
}

export function TripDetailScreen({ trip, now, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();

  const arrival = useMemo(
    () => eta({ track: trip.track.kept, destination: trip.destination, now, truckClass: trip.truck }),
    [trip, now],
  );

  const state = trip.history[trip.history.length - 1]?.state ?? 'open';
  const quality = fixQuality(trip.track);
  const travelled = distanceTravelled(trip.track);
  const observation = observe(trip.track.kept, now);
  const silence = silentFor(trip.track.kept, now);

  const tripStops = useMemo(() => stops(trip.track.kept), [trip]);
  const waited = demurrage(trip.truck, trip.waitedMinutes * 60_000);
  const settlement = settle(fromNaira(trip.agreedNaira), waited.amount, fromNaira(trip.advanceNaira));

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={`${trip.originName} → ${trip.destinationName}`} onBack={onBack} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.identity}>
          <View style={styles.identityRow}>
            <Icon name="package" size="sm" colour={colours.textSecondary} />
            <Text variant="body" tone="secondary" style={styles.flex}>
              {trip.cargo} · {trip.plate}
            </Text>
          </View>
          <View style={styles.identityRow}>
            <Icon name="truck" size="sm" colour={colours.textSecondary} />
            <Text variant="body" tone="secondary" style={styles.flex}>
              {trip.carrier} · {trip.driver}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <StatusChip observation={observation} tracking={shouldTrack(state)} />
            <PositionAge silentForMs={silence} compact />
          </View>
        </View>

        {/* The one card per screen that leads the eye. */}
        <Card overline="Where it is" icon="route" emphasis="accent">
          <Corridor
            origin={trip.origin}
            destination={trip.destination}
            track={trip.track}
            originName={trip.originName}
            destinationName={trip.destinationName}
          />
        </Card>

        <EtaRange eta={arrival} />

        <Card overline="Pace" icon="truck">
          <Sparkline series={paceSeries(trip.track.kept)} />
          <Text variant="body" tone="secondary" style={styles.note}>
            Door to door, including every stop. Not the speedometer — a trailer
            that cruises at 80 and spends nine hours at checkpoints makes about
            35 over the day, and it is the second number an arrival is built
            from.
          </Text>
        </Card>

        {/*
          Distance never appears without the share of fixes it was computed
          from. A figure derived from 60% of the track is not wrong, but nobody
          should be shown it without knowing — the same rule the API applies.
        */}
        <Card overline="Distance covered" icon="pin">
          <View style={styles.figure}>
            <Text variant="display" tabular>
              {Math.round(travelled / 1000)}
            </Text>
            {/*
              Two siblings on a shared baseline rather than a nested Text: a
              child Text inherits the parent's fontFamily, so the unit came out
              monospaced with a full Menlo space in front of it — "764  km".
            */}
            <Text variant="display"> km</Text>
          </View>
          <Text variant="body" tone={quality < 0.9 ? 'stale' : 'secondary'}>
            {describeQuality(trip.track.kept.length, trip.track.dropped.length, quality)}
          </Text>
          {trip.track.dropped.length > 0 ? (
            <View style={styles.dropped}>
              {summariseDropped(trip.track.dropped).map((line) => (
                <View key={line} style={styles.droppedRow}>
                  <Icon name="alert" size="sm" colour={colours.stale} />
                  <Text variant="label" tone="stale" style={styles.flex}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {tripStops.length > 0 ? (
          <Card overline={`Stops · ${tripStops.length}`} icon="pin">
            <Text variant="body" tone="secondary" style={styles.stopsLede}>
              {plural(timeStopped(tripStops) / 3_600_000, 'hour')} stopped in
              total. This is what a demurrage claim is made of.
            </Text>
            {tripStops.map((stop, i) => (
              <StopRow key={stop.from.toISOString()} stop={stop} index={i + 1} />
            ))}
          </Card>
        ) : null}

        <Card overline="What is owed" icon="naira">
          <Line label="Agreed fare" amount={settlement.agreed} />
          <Line label="Demurrage" amount={settlement.demurrage} />
          <Line label="Backhaul commission" amount={settlement.commission} deduction />
          <Line label="Advance already paid" amount={settlement.advance} deduction />
          <View style={[styles.rule, { backgroundColor: colours.outline }]} />
          <Line label="Due to carrier" amount={settlement.toCarrier} emphasis />
          <Text variant="label" tone="secondary" style={styles.note}>
            {waited.basis}
          </Text>
        </Card>

        <Card overline="History" icon="clock" emphasis="plain">
          {[...trip.history].reverse().map((event, i) => (
            <View key={`${event.state}-${event.at.toISOString()}`} style={styles.event}>
              <View style={styles.timeline}>
                <View
                  style={[
                    styles.eventDot,
                    {
                      backgroundColor: i === 0 ? colours.moving : colours.surface,
                      borderColor: i === 0 ? colours.moving : colours.outline,
                    },
                  ]}
                />
                {i < trip.history.length - 1 ? (
                  <View style={[styles.eventLine, { backgroundColor: colours.outline }]} />
                ) : null}
              </View>
              <View style={styles.eventBody}>
                <Text variant="body">{event.state.replace(/_/g, ' ')}</Text>
                <Text variant="label" tone="secondary">
                  {agoLabel(now.getTime() - event.at.getTime())} · {event.actor}
                </Text>
              </View>
            </View>
          ))}
          <Text variant="label" tone="secondary" style={styles.note}>
            Append-only. A correction is a new entry; nothing here is ever edited.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

/**
 * One line of the settlement.
 *
 * `deduction` is a flag rather than a negative amount, because negating a
 * branded `Kobo` at the call site is the thing the brand exists to prevent —
 * and a deduction is a fact about the line, not a property of the number.
 */
/**
 * Pace between consecutive fixes, in km/h.
 *
 * A null wherever the gap between fixes is longer than the silence threshold:
 * the truck's average across a two-hour outage is arithmetically computable and
 * means nothing, and drawing it would put a confident line through the part of
 * the trip nobody can account for.
 */
function paceSeries(track: readonly Position[]) {
  const values: (number | null)[] = [];

  for (let i = 1; i < track.length; i++) {
    const from = track[i - 1];
    const to = track[i];
    if (from === undefined || to === undefined) continue;

    const seconds = (to.at.getTime() - from.at.getTime()) / 1000;
    if (seconds <= 0 || seconds > 20 * 60) {
      values.push(null);
      continue;
    }
    values.push((distance(from, to) / seconds) * 3.6);
  }

  return { values, label: 'Pace over the trip', unit: 'km/h' };
}

function StopRow({ stop, index }: { stop: Stop; index: number }) {
  const colours = useColours();
  const hours = stop.durationMs / 3_600_000;

  return (
    <View style={styles.stop}>
      <View style={[styles.stopIndex, { borderColor: colours.outline }]}>
        <Text variant="label" tone="secondary" tabular>
          {index}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="body">
          {hours >= 1
            ? plural(hours, 'hour')
            : plural(Math.round(stop.durationMs / 60_000), 'minute')}
          {stop.openEnded ? ' so far' : ''}
        </Text>
        <Text variant="label" tone="secondary" tabular>
          {clockOf(stop.from)} – {stop.openEnded ? 'now' : clockOf(stop.to)} ·{' '}
          {stop.fixes} positions
        </Text>
      </View>
    </View>
  );
}

function clockOf(when: Date): string {
  return when.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function Line({
  label,
  amount,
  emphasis = false,
  deduction = false,
}: {
  label: string;
  amount: Kobo;
  emphasis?: boolean;
  deduction?: boolean;
}) {
  return (
    <View style={styles.line}>
      <Text variant={emphasis ? 'title' : 'body'} tone={emphasis ? 'primary' : 'secondary'}>
        {label}
      </Text>
      <Text variant={emphasis ? 'title' : 'body'} tabular>
        {deduction ? `−${format(amount)}` : format(amount)}
      </Text>
    </View>
  );
}

function describeQuality(kept: number, dropped: number, quality: number): string {
  if (kept === 0) {
    return 'No usable positions yet.';
  }
  if (dropped === 0) {
    return `From ${kept} positions, all of them usable.`;
  }
  return `From ${kept} of ${kept + dropped} positions — ${Math.round(quality * 100)}% usable.`;
}

/** Names what was excluded, because "we dropped some" is not an answer. */
function summariseDropped(dropped: readonly { readonly problem: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const item of dropped) {
    counts.set(item.problem, (counts.get(item.problem) ?? 0) + 1);
  }
  const wording: Record<string, string> = {
    too_imprecise: 'the phone could not say where it was',
    out_of_order: 'dated before the position before it',
    implausible_jump: 'a jump no truck could make',
  };
  return [...counts].map(([problem, count]) => `${count} × ${wording[problem] ?? problem}`);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  flex: { flex: 1 },
  identity: { gap: space.sm, marginBottom: space.xs },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flexWrap: 'wrap',
    marginTop: space.xs,
  },
  figure: { flexDirection: 'row', alignItems: 'baseline', marginBottom: space.xs },
  dropped: { marginTop: space.sm, gap: space.xs },
  droppedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  rule: { height: StyleSheet.hairlineWidth * 2, marginBottom: space.md },
  note: { marginTop: space.sm },
  event: { flexDirection: 'row', gap: space.md },
  timeline: { alignItems: 'center', width: 12 },
  eventDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 5 },
  eventLine: { width: 2, flex: 1, marginVertical: 2 },
  eventBody: { flex: 1, gap: 2, paddingBottom: space.md },
  stopsLede: { marginBottom: space.md },
  stop: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    marginBottom: space.md,
  },
  stopIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

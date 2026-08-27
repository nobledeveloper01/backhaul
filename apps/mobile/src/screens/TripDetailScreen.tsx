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
  chargeableWaiting,
  headline,
  remaining,
  stops,
  timeStopped,
  type Kobo,
  type Position,
  type Stop,
  type Visit,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Corridor } from '../components/Corridor';
import { EtaRange } from '../components/EtaRange';
import { Icon } from '../components/Icon';
import { PositionAge, agoLabel, humanDuration, plural } from '../components/PositionAge';
import { ScreenHeader } from '../components/ScreenHeader';
import { Press } from '../components/Press';
import { Sparkline } from '../components/Sparkline';
import { StatusChip } from '../components/StatusChip';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import type { DemoTrip } from '../state/demo';
import {
  demoIncidents,
  demoMessages,
  demoVisits,
  demoWaypoints,
} from '../state/product';
import { unread } from '@backhaul/domain';

interface Props {
  readonly trip: DemoTrip;
  readonly now: Date;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onMessages: () => void;
  readonly onReport: () => void;
  readonly onProof: () => void;
}

export function TripDetailScreen({
  trip,
  now,
  onBack,
  onShare,
  onMessages,
  onReport,
  onProof,
}: Props) {
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
  const waypoints = useMemo(() => demoWaypoints(trip), [trip]);
  const visited = useMemo(() => demoVisits(trip), [trip]);
  const ahead = useMemo(() => remaining(visited, waypoints), [visited, waypoints]);
  const messages = useMemo(() => demoMessages(trip, now), [trip, now]);
  const incidents = useMemo(() => demoIncidents(trip, now), [trip, now]);
  const openIncident = headline(incidents);
  const waiting = chargeableWaiting(visited);
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

        {/*
          Three things a shipper does from here, side by side above the fold.
          Buried at the bottom of a scroll, the share action — the one the whole
          wedge depends on — was four hundred pixels below the thing it shares.
        */}
        <View style={styles.actions}>
          <Action icon="link" label="Share" onPress={onShare} primary />
          <Action
            icon="message"
            label="Messages"
            onPress={onMessages}
            badge={unread(messages, 'shipper').length}
          />
          <Action icon="flag" label="Report" onPress={onReport} />
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

        {/*
          An open incident sits above the arrival estimate, because a blocking
          one makes the estimate meaningless and the two read as a contradiction
          in the other order.
        */}
        {openIncident !== null ? (
          <Card overline="Reported" icon="flag" emphasis="plain">
            <Text variant="title">{openIncident.note}</Text>
            <Text variant="body" tone="secondary" style={styles.note}>
              Reported by the {openIncident.reportedBy} · {agoLabel(now.getTime() - openIncident.at.getTime())}
            </Text>
          </Card>
        ) : null}

        <EtaRange eta={arrival} />

        <Card overline="Along the way" icon="pin">
          {waypoints.map((waypoint) => {
            const visit = visited.find((v) => v.waypoint.id === waypoint.id);
            return <WaypointRow key={waypoint.id} name={waypoint.name} visit={visit} now={now} />;
          })}
          <Text variant="body" tone="secondary" style={styles.note}>
            {waiting > 0
              ? `${humanDuration(waiting)} waiting at ${chargeablePlaces(visited)} so far — the part a demurrage claim is made of. Time at the weighbridge is not counted.`
              : ahead.length > 0
                ? `${ahead.length} still ahead. Arrival is measured against each place's own radius, not one distance for the whole trip — a depot yard is 400 m and a weighbridge queue can be a kilometre.`
                : 'Every point on the route was reached.'}
          </Text>
        </Card>

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
        <Press
          onPress={onProof}
          accessibilityLabel="Open the delivery document"
          accessibilityHint="Photographs, signature and where it was captured"
          style={[styles.proof, { borderColor: colours.outline }]}
        >
          <Icon name="document" size="md" colour={colours.textSecondary} />
          <Text variant="title" style={styles.flex}>
            Delivery document
          </Text>
          <Icon name="chevron-right" size="md" colour={colours.outline} />
        </Press>
      </ScrollView>
    </View>
  );
}

/**
 * One of the three actions at the top.
 *
 * Only the first is filled. One primary per screen — three filled buttons in a
 * row is a row with no primary in it, which is the same as having none.
 */
function Action({
  icon,
  label,
  onPress,
  primary = false,
  badge = 0,
}: {
  icon: 'link' | 'message' | 'flag';
  label: string;
  onPress: () => void;
  primary?: boolean;
  badge?: number;
}) {
  const colours = useColours();
  const tint = primary ? colours.onAccent : colours.textSecondary;

  return (
    <Press
      onPress={onPress}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
      style={[
        styles.action,
        {
          backgroundColor: primary ? colours.accent : colours.surfaceDim,
          borderColor: primary ? colours.accent : colours.outline,
        },
      ]}
    >
      <View>
        <Icon name={icon} size="md" colour={tint} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: colours.accent }]}>
            <Text variant="overline" style={{ color: colours.onAccent }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="label" numberOfLines={1} style={{ color: primary ? colours.onAccent : colours.textPrimary }}>
        {label}
      </Text>
    </Press>
  );
}

/**
 * The chargeable places actually visited, named.
 *
 * "waiting at the depot and the market" was written flat, and printed on a
 * trip that had only reached the depot. A sentence that names somewhere the
 * truck has never been is the screen inventing evidence for a demurrage claim.
 */
function chargeablePlaces(visited: readonly Visit[]): string {
  const names = [
    ...new Set(
      visited
        .filter(
          (visit) =>
            visit.waypoint.kind === 'origin' || visit.waypoint.kind === 'destination',
        )
        .map((visit) => visit.waypoint.name),
    ),
  ];
  if (names.length === 0) return 'the depot';
  if (names.length === 1) return names[0] ?? 'the depot';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * A place on the route, reached or not.
 *
 * A waypoint with no visit is not an error state and is not greyed out to
 * nothing — it is simply ahead, and a route that shows only what has happened
 * gives a shipper no idea what is left.
 */
function WaypointRow({
  name,
  visit,
  now,
}: {
  name: string;
  visit: Visit | undefined;
  now: Date;
}) {
  const colours = useColours();
  const reached = visit !== undefined;
  const stillThere = visit?.left === null;

  return (
    <View style={styles.waypoint}>
      <View
        style={[
          styles.waypointDot,
          {
            backgroundColor: stillThere
              ? colours.stopped
              : reached
                ? colours.moving
                : 'transparent',
            borderColor: reached ? 'transparent' : colours.outline,
          },
        ]}
      />
      <View style={styles.flex}>
        <Text variant="body">{name}</Text>
        <Text variant="label" tone="secondary">
          {/*
            `humanDuration`, not `plural(ms / 3_600_000, 'hour')` — which is
            what this said first, and which rendered a twenty-minute stop at
            the depot as "0.3 hours". Nobody has ever said that out loud.
          */}
          {visit === undefined
            ? 'Ahead'
            : stillThere
              ? `There now · ${humanDuration(visit.durationMs)} so far`
              : `Arrived ${agoLabel(now.getTime() - visit.arrived.getTime())} · stayed ${humanDuration(visit.durationMs)}`}
        </Text>
      </View>
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
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    minHeight: target.standard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  waypoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.sm,
  },
  waypointDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 2,
    marginTop: 6,
  },
  proof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: target.standard,
    paddingHorizontal: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
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

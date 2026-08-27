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
  deviation,
  headline,
  nextRelease,
  released,
  remaining,
  stops,
  timeStopped,
  type Kobo,
  type Position,
  type Stop,
  type Visit,
  completed,
  nextDrop,
  type CleanedTrack,
  type Message,
  type Incident,
  type Release,
  type Waypoint,
  visits,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Corridor } from '../components/Corridor';
import { EtaRange } from '../components/EtaRange';
import { Icon } from '../components/Icon';
import { PositionAge, agoLabel, humanDuration } from '../components/PositionAge';
import type { Words } from '../components/PositionAge';
import { ScreenHeader } from '../components/ScreenHeader';
import { Press } from '../components/Press';
import { Sparkline } from '../components/Sparkline';
import { StatusChip } from '../components/StatusChip';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import type { DemoTrip } from '../state/demo';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { map } from '../api/client';
import { whereTheDropsAre } from '../state/words';
import {
  demoDrops,
  demoEscrow,
  demoIncidents,
  demoMessages,
  demoVisits,
  demoWaypoints,
} from '../state/product';
import { unread } from '@backhaul/domain';
import type { Phrase } from '@backhaul/domain';

interface Props {
  readonly trip: DemoTrip;
  readonly now: Date;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onMessages: () => void;
  readonly onReport: () => void;
  readonly onProof: () => void;
  readonly onDispute: () => void;
  readonly onCancel: () => void;
  readonly onDrops: () => void;
}

/** Nothing recorded, which is not the same as nothing to record. */
const EMPTY_TRACK: CleanedTrack = { kept: [], dropped: [] };

export function TripDetailScreen({
  trip,
  now,
  onBack,
  onShare,
  onMessages,
  onReport,
  onProof,
  onDispute,
  onCancel,
  onDrops,
}: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const arrival = useMemo(
    () => eta({ track: trip.track.kept, destination: trip.destination, now, truckClass: trip.truck }),
    [trip, now],
  );

  const state = trip.history[trip.history.length - 1]?.state ?? 'open';
  const quality = fixQuality(trip.track);
  const { api } = useSession();

  /*
    Six reads, not one.

    A trip screen is six questions — where is it, what is on the route, what
    has been said, what has gone wrong, when does the money move, and what is
    still to be dropped — and each has its own route because each has its own
    write path. Rolling them into one endpoint would make every screen that
    needs one of them pay for all six.

    They fire together and settle independently, so the corridor draws as soon
    as the fixes land rather than waiting on the slowest of six.
  */
  const fixes = useTripData(
    trip.live,
    () => api.fixes(trip.id),
    () => trip.track,
    [api, trip.id, trip.track],
  ).query;

  const route = useTripData(
    trip.live,
    async () =>
      map(await api.waypoints(trip.id), (view) => ({
        waypoints: view.waypoints.map<Waypoint>((w) => ({
          id: w.id,
          name: w.name,
          kind: w.kind as Waypoint['kind'],
          at: { lat: w.lat, lon: w.lon, accuracy: 0, at: now },
          radius: w.radiusM,
        })),
        visits: view.visits,
        chargeableWaitingMs: view.chargeableWaitingMs,
      })),
    () => ({
      waypoints: [...demoWaypoints(trip)],
      visits: [],
      chargeableWaitingMs: chargeableWaiting(demoVisits(trip)),
    }),
    [api, trip.id, trip, now],
  ).query;

  const thread = useTripData(
    trip.live,
    async () =>
      map(await api.messages(trip.id), (rows) =>
        rows.map<Message>((row) => ({
          id: row.id,
          tripId: trip.id,
          from: row.from as Message['from'],
          body: row.body,
          at: row.at,
          receivedAt: row.receivedAt,
          readBy: row.readBy as Message['readBy'],
        })),
      ),
    () => demoMessages(trip, now),
    [api, trip.id, now],
  ).query;

  const trouble = useTripData(
    trip.live,
    async () =>
      map(await api.incidents(trip.id), (rows) =>
        rows.map<Incident>((row) => ({
          id: row.id,
          tripId: trip.id,
          kind: row.kind as Incident['kind'],
          severity: row.severity as Incident['severity'],
          at: row.at,
          near: null,
          note: row.note,
          reportedBy: row.reportedBy as Incident['reportedBy'],
          photoIds: row.photoIds,
          resolvedAt: row.resolvedAt,
        })),
      ),
    () => demoIncidents(trip, now),
    [api, trip.id, now],
  ).query;

  const escrow = useTripData(
    trip.live,
    async () =>
      map(await api.escrow(trip.id), (view) =>
        view.releases.map((release) => ({
          milestone: {
            kind: release.kind as Release['milestone']['kind'],
            pct: release.pct,
            condition: release.condition,
          },
          amount: release.amountKobo as Release['amount'],
          met: release.met,
        })),
      ),
    () => demoEscrow(trip, now),
    [api, trip.id, now],
  ).query;

  /*
    Three numbers, not the drops themselves.

    This screen renders one line — "2/4 signed for · next Kano market" — and
    the drops screen renders the rest. Mapping every drop into the domain's
    shape here would mean inventing a fence per drop for a sentence that never
    draws one.
  */
  const dropList = useTripData(
    trip.live,
    async () =>
      map(await api.drops(trip.id), (view) => ({
        done: view.drops.filter((drop) => drop.deliveredAt !== null).length,
        total: view.drops.length,
        nextName:
          view.drops.find((drop) => drop.deliveredAt === null)?.consignee ?? null,
      })),
    () => {
      const demo = demoDrops(trip, now);
      return {
        done: completed(demo).length,
        total: demo.length,
        nextName: nextDrop(demo)?.at.name ?? null,
      };
    },
    [api, trip.id, now],
  ).query;

  // The walkthrough's own track when there is nothing else; the server's when
  // there is. Never a mix — a corridor drawn half from each is a corridor of
  // neither trip.
  const track = fixes.state === 'ready' ? fixes.value : EMPTY_TRACK;

  const travelled = distanceTravelled(track);
  const observation = observe(track.kept, now);
  const silence = silentFor(track.kept, now);

  const tripStops = useMemo(() => stops(track.kept), [track]);
  const waypoints = route.state === 'ready' ? route.value.waypoints : [];
  const visited = useMemo(
    () => (route.state === 'ready' ? visits(track.kept, waypoints) : []),
    [route.state, track, waypoints],
  );
  const ahead = useMemo(() => remaining(visited, waypoints), [visited, waypoints]);
  const messages = thread.state === 'ready' ? thread.value : [];
  const incidents = trouble.state === 'ready' ? trouble.value : [];
  const openIncident = headline(incidents);
  const waiting = route.state === 'ready' ? route.value.chargeableWaitingMs : 0;
  const course = useMemo(
    () => deviation(track.kept, trip.destination, now),
    [track, trip.destination, now],
  );
  const money = escrow.state === 'ready' ? escrow.value : [];
  const drops = dropList.state === 'ready'
    ? dropList.value
    : { done: 0, total: 0, nextName: null };
  const nextMoney = nextRelease(money);
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
            {/*
              An owner-driver is one person, and printing their name twice —
              "Tunde Adeyemi · Tunde Adeyemi" — reads as a bug rather than as a
              one-truck business, which is most of this market.
            */}
            <Text variant="body" tone="secondary" style={styles.flex}>
              {trip.carrier === trip.driver
                ? `${trip.driver} · owner-driver`
                : `${trip.carrier} · ${trip.driver}`}
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
          <Action icon="link" label={t('share')} onPress={onShare} primary />
          <Action
            icon="message"
            label={t('messages')}
            onPress={onMessages}
            badge={unread(messages, 'shipper').length}
          />
          <Action icon="flag" label={t('report')} onPress={onReport} />
        </View>

        {/* The one card per screen that leads the eye. */}
        <Card overline={t('where_it_is')} icon="route" emphasis="accent">
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
              Reported by the {openIncident.reportedBy} · {agoLabel(now.getTime() - openIncident.at.getTime(), t)}
            </Text>
          </Card>
        ) : null}

        {/*
          Off course, when it is. Not measured against a straight line between
          origin and destination — the road is nowhere near it — but against
          whether the truck has been getting *further away* for long enough.
        */}
        {course.kind === 'deviating' ? (
          <Card overline={t('off_course')} icon="alert" emphasis="plain">
            <Text variant="title" tone="stopped">
              {course.detail}
            </Text>
            <Text variant="body" tone="secondary" style={styles.note}>
              {t('deviation_note')}
            </Text>
          </Card>
        ) : null}

        <EtaRange eta={arrival} />

        <Card overline={t('along_the_way')} icon="pin">
          {waypoints.map((waypoint) => {
            const visit = visited.find((v) => v.waypoint.id === waypoint.id);
            return <WaypointRow key={waypoint.id} name={waypoint.name} visit={visit} now={now} />;
          })}
          <Text variant="body" tone="secondary" style={styles.note}>
            {waiting > 0
              ? `${humanDuration(waiting, t)} · ${chargeablePlaces(visited)} — ${t('waiting_note')}`
              : ahead.length > 0
                ? `${ahead.length} ${t('still_ahead_note')}`
                : t('every_point_reached')}
          </Text>
        </Card>

        <Press
          onPress={onDrops}
          accessibilityLabel={t('drops_on_this_trip')}
          accessibilityHint={whereTheDropsAre(drops.done, drops.total, drops.nextName, t)}
          feedback="opacity"
          style={[styles.rowLink, { borderColor: colours.outline }]}
        >
          <Icon name="package" size="md" colour={colours.textSecondary} />
          <View style={styles.flex}>
            <Text variant="title">{t('drops')}</Text>
            <Text variant="label" tone="secondary">
              {whereTheDropsAre(drops.done, drops.total, drops.nextName, t)}
            </Text>
          </View>
          <Icon name="chevron-right" size="md" colour={colours.outline} />
        </Press>

        <Card overline={t('pace')} icon="truck">
          <Sparkline series={paceSeries(trip.track.kept, t)} />
          <Text variant="body" tone="secondary" style={styles.note}>
            {t('pace_note')}
          </Text>
        </Card>

        {/*
          Distance never appears without the share of fixes it was computed
          from. A figure derived from 60% of the track is not wrong, but nobody
          should be shown it without knowing — the same rule the API applies.
        */}
        <Card overline={t('distance_covered')} icon="pin">
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
            {describeQuality(trip.track.kept.length, trip.track.dropped.length, quality, t)}
          </Text>
          {trip.track.dropped.length > 0 ? (
            <View style={styles.dropped}>
              {summariseDropped(trip.track.dropped, t).map((line) => (
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
          <Card overline={`${t('stops_overline')} · ${tripStops.length}`} icon="pin">
            <Text variant="body" tone="secondary" style={styles.stopsLede}>
              {humanDuration(timeStopped(tripStops), t)} {t('stops_note')}
            </Text>
            {tripStops.map((stop, i) => (
              <StopRow key={stop.from.toISOString()} stop={stop} index={i + 1} />
            ))}
          </Card>
        ) : null}

        <Card overline={t('money_released')} icon="naira">
          <Text variant="display" tabular>
            {format(released(money))}
          </Text>
          <Text variant="body" tone="secondary" style={styles.note}>
            {/*
              The milestone's `kind` is the key, and the condition sentence in
              `escrow.ts` is what the two implementations are held to through
              the parity fixtures. The screen renders the reader's own words
              for it rather than the domain's English — the domain writes one
              language and the app is read in four.
            */}
            {nextMoney === null
              ? t('everything_released')
              : `${t('next')} · ${t(CONDITIONS[nextMoney.milestone.kind])}`}
          </Text>

          <View style={styles.milestones}>
            {money.map((release) => (
              <View key={release.milestone.kind} style={styles.milestone}>
                <Icon
                  name={release.met ? 'check' : 'clock'}
                  size="sm"
                  colour={release.met ? colours.moving : colours.textSecondary}
                />
                <Text
                  variant="body"
                  tone={release.met ? 'primary' : 'secondary'}
                  style={styles.flex}
                >
                  {milestoneLabel(release.milestone.kind, t)} · {release.milestone.pct}%
                </Text>
                <Text variant="body" tabular tone={release.met ? 'primary' : 'secondary'}>
                  {format(release.amount)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card overline={t('what_is_owed')} icon="naira">
          <Line label={t('agreed_fare')} amount={settlement.agreed} />
          <Line label={t('demurrage')} amount={settlement.demurrage} />
          <Line label={t('commission')} amount={settlement.commission} deduction />
          <Line label={t('advance_paid')} amount={settlement.advance} deduction />
          <View style={[styles.rule, { backgroundColor: colours.outline }]} />
          <Line label={t('due_to_carrier')} amount={settlement.toCarrier} emphasis />
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
                  {agoLabel(now.getTime() - event.at.getTime(), t)} · {event.actor}
                </Text>
              </View>
            </View>
          ))}
          <Text variant="label" tone="secondary" style={styles.note}>
            Append-only. A correction is a new entry; nothing here is ever edited.
          </Text>
        </Card>
        <Press
          onPress={onDispute}
          accessibilityLabel={t('what_the_record_shows')}
          accessibilityHint={t('record_detail')}
          style={[styles.proof, { borderColor: colours.outline }]}
        >
          <Icon name="list" size="md" colour={colours.textSecondary} />
          <Text variant="title" style={styles.flex}>
            {t('what_the_record_shows')}
          </Text>
          <Icon name="chevron-right" size="md" colour={colours.outline} />
        </Press>

        <Press
          onPress={onCancel}
          accessibilityLabel={t('call_this_trip_off')}
          accessibilityHint={t('cancel_detail')}
          feedback="opacity"
          style={[styles.cancel, { borderColor: colours.outline }]}
        >
          <Text variant="label" tone="secondary">
            {t('call_this_trip_off')}
          </Text>
        </Press>

        <Press
          onPress={onProof}
          accessibilityLabel={t('open_delivery_document')}
          accessibilityHint={t('delivery_document_detail')}
          style={[styles.proof, { borderColor: colours.outline }]}
        >
          <Icon name="document" size="md" colour={colours.textSecondary} />
          <Text variant="title" style={styles.flex}>
            {t('delivery_document')}
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
      {/*
        Two lines and a cap. One line uncapped truncated all three to "Sh…",
        "M…" and "Re…" at the largest text size — three buttons that no longer
        said what they did.
      */}
      <Text
        variant="label"
        numberOfLines={2}
        maxFontSizeMultiplier={1.5}
        style={{ textAlign: 'center', color: primary ? colours.onAccent : colours.textPrimary }}
      >
        {label}
      </Text>
    </Press>
  );
}

/**
 * A milestone, in words.
 *
 * `in_transit` with the underscore swapped for a space is a state name wearing
 * a disguise. These are the four things a carrier is waiting to be paid for
 * and they deserve their own words.
 */
/** The escrow conditions, keyed by the milestone kind rather than its wording. */
const CONDITIONS: Record<'advance' | 'in_transit' | 'delivered' | 'retention', Phrase> = {
  advance: 'condition_advance',
  in_transit: 'condition_in_transit',
  delivered: 'condition_delivered',
  retention: 'condition_retention',
};

function milestoneLabel(
  kind: 'advance' | 'in_transit' | 'delivered' | 'retention',
  t: Words,
): string {
  switch (kind) {
    case 'advance':
      return t('on_loading');
    case 'in_transit':
      return t('on_the_road');
    case 'delivered':
      return t('on_delivery');
    case 'retention':
      return t('held_back');
  }
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
  const { t } = useLanguage();
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
            ? t('ahead')
            : stillThere
              ? `${t('there_now')} · ${humanDuration(visit.durationMs, t)} ${t('so_far')}`
              : `${agoLabel(now.getTime() - visit.arrived.getTime(), t)} · ${t('stayed')} ${humanDuration(visit.durationMs, t)}`}
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
function paceSeries(track: readonly Position[], t: Words) {
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

  return { values, label: t('pace_over_the_trip'), unit: 'km/h' };
}

function StopRow({ stop, index }: { stop: Stop; index: number }) {
  const colours = useColours();
  const { t } = useLanguage();

  return (
    <View style={styles.stop}>
      <View style={[styles.stopIndex, { borderColor: colours.outline }]}>
        <Text variant="label" tone="secondary" tabular>
          {index}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="body">
          {humanDuration(stop.durationMs, t)}
          {stop.openEnded ? ` ${t('so_far')}` : ''}
        </Text>
        <Text variant="label" tone="secondary" tabular>
          {clockOf(stop.from)} – {stop.openEnded ? t('now') : clockOf(stop.to)} ·{' '}
          {stop.fixes} {t('positions')}
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

function describeQuality(kept: number, dropped: number, quality: number, t: Words): string {
  if (kept === 0) {
    return t('no_usable_positions_yet');
  }
  if (dropped === 0) {
    return `${kept} ${t('positions_all_usable')}`;
  }
  // The fraction first, then the words — see `humanDuration` for why.
  return `${kept}/${kept + dropped} ${t('positions')} · ${Math.round(quality * 100)}% ${t('usable')}`;
}

/** Names what was excluded, because "we dropped some" is not an answer. */
function summariseDropped(
  dropped: readonly { readonly problem: string }[],
  t: Words,
): string[] {
  const counts = new Map<string, number>();
  for (const item of dropped) {
    counts.set(item.problem, (counts.get(item.problem) ?? 0) + 1);
  }
  const wording: Record<string, Phrase> = {
    too_imprecise: 'dropped_imprecise',
    out_of_order: 'dropped_out_of_order',
    implausible_jump: 'dropped_jump',
  };
  return [...counts].map(([problem, count]) => {
    const phrase = wording[problem];
    return `${count} × ${phrase === undefined ? problem : t(phrase)}`;
  });
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
  rowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: target.standard,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  milestones: { marginTop: space.md, gap: space.sm },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cancel: {
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
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

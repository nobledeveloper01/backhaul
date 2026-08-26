import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  demurrage,
  distanceTravelled,
  eta,
  fixQuality,
  format,
  fromNaira,
  observe,
  settle,
  shouldTrack,
  silentFor,
  type Kobo,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Corridor } from '../components/Corridor';
import { EtaRange } from '../components/EtaRange';
import { Icon } from '../components/Icon';
import { PositionAge, humanDuration } from '../components/PositionAge';
import { ScreenHeader } from '../components/ScreenHeader';
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
                  {humanDuration(now.getTime() - event.at.getTime())} ago · {event.actor}
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
});

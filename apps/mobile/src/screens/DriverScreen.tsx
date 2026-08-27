import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  INTERVAL,
  allowedFrom,
  decide,
  isSystemRaised,
  shouldTrack,
  transition,
  type TripEvent,
  type TripState,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Press } from '../components/Press';
import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours, useElevation } from '../design/theme';
import { demoNow, demoTrips } from '../state/demo';

/**
 * The driver's whole app.
 *
 * **Driver screen time is the enemy.** The driver did not choose this app, is
 * paid whether or not they use it, and is reading it in a moving cab. So there
 * is one screen, one action, and nothing to browse.
 *
 * Everything else on it answers the two questions a driver actually has about
 * tracking software: *is it costing me my battery*, and *what is it telling
 * people about me*. Both plainly, because a driver who cannot see why their
 * phone is doing something assumes the worst and force-quits — and a
 * force-quit trip is a trip with no evidence.
 */
interface Props {
  readonly online: boolean;
  readonly onToggleConnection: () => void;
  readonly onOpenHistory: () => void;
  readonly onReport: () => void;
  readonly onDeliver: () => void;
}

export function DriverScreen({
  online,
  onToggleConnection,
  onOpenHistory,
  onReport,
  onDeliver,
}: Props) {
  const colours = useColours();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const base = useMemo(() => demoTrips(now)[0], [now]);
  const [history, setHistory] = useState<readonly TripEvent[]>(base?.history ?? []);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (base === undefined) {
    return null;
  }

  const state = history[history.length - 1]?.state ?? 'open';
  const tracking = shouldTrack(state);

  // The same policy the native loop follows. Rendered so the driver can see
  // it rather than infer it.
  const plan = decide({ speed: tracking ? 18 : 0, battery: 0.42, online, queued: 18 }, now);

  // Three exclusions, each for its own reason. `signal_lost` and `stalled` are
  // observations the tracker raises — asking a driver to tap "signal lost" is
  // asking them to self-report the thing the tracking exists to detect.
  // `disputed` and `cancelled` are consequential and belong behind a
  // confirmation, not beside "I've arrived" at 64 dp in a moving cab.
  const next = allowedFrom(state).filter(
    (candidate) =>
      !isSystemRaised(candidate) && candidate !== 'disputed' && candidate !== 'cancelled',
  );

  function move(to: TripState) {
    const result = transition(history, to, new Date(), 'driver');
    if (!result.ok) {
      setRefusal(result.detail);
      return;
    }
    setRefusal(null);
    setHistory([...history, result.event]);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      <View style={styles.route}>
        <Text variant="overline" tone="secondary">
          YOUR TRIP
        </Text>
        <Text variant="headline">
          {base.originName} → {base.destinationName}
        </Text>
        <View style={styles.metaRow}>
          <Icon name="package" size="sm" colour={colours.textSecondary} />
          <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
            {base.cargo} · {base.plate}
          </Text>
        </View>
      </View>

      {/*
        The consent block. Big, first, and it says who can see the driver —
        because "tracking is consented, visible and bounded" is a product rule
        before it is a battery optimisation.
      */}
      <View
        style={[
          styles.consent,
          elevation.raised,
          {
            backgroundColor: tracking ? colours.movingWash : colours.surfaceDim,
            borderColor: tracking ? colours.moving : colours.outline,
          },
        ]}
      >
        <View style={styles.consentHead}>
          <Icon
            name={tracking ? 'signal' : 'signal-off'}
            size="lg"
            colour={tracking ? colours.moving : colours.textSecondary}
          />
          <Text variant="title" tone={tracking ? 'moving' : 'secondary'} style={styles.flex}>
            {tracking ? 'Recording your location' : 'Not recording'}
          </Text>
        </View>
        <Text variant="bodyDriver" tone="secondary">
          {/*
            Three different situations, and they were one message until the
            screen was walked through: a trip that has not begun, one that has
            arrived, and one that is over. "Recording starts when you begin
            loading" is true of the first and nonsense on the other two.
          */}
          {tracking
            ? `Shared with ${base.carrier} and the cargo owner, until this trip ends.`
            : state === 'open' || state === 'assigned'
              ? 'Nothing is being shared. Recording starts when you begin loading.'
              : 'Recording has stopped. Nothing more is being shared.'}
        </Text>
      </View>

      {/*
        A way to see the offline state without waiting for a dead zone. In the
        product this is the OS telling us; here it is a control, because an
        offline state nobody can reach is an offline state nobody authored.
      */}
      <Press
        onPress={onToggleConnection}
        accessibilityLabel={online ? 'Simulate losing signal' : 'Simulate regaining signal'}
        feedback="opacity"
        style={[styles.link, { borderColor: colours.outline }]}
      >
        <Icon name={online ? 'signal' : 'signal-off'} size="sm" colour={colours.textSecondary} />
        <Text variant="label" tone="secondary" style={styles.flex}>
          {online ? 'Signal is good — tap to simulate losing it' : 'Offline — tap to restore signal'}
        </Text>
      </Press>

      {tracking ? (
        <Card overline="Battery" icon="battery">
          <Text variant="bodyDriver">
            Checking your position {cadence(plan.sampleIn)} — {plan.because}.
          </Text>
          {plan.sampleIn >= INTERVAL.conserving ? (
            <Text variant="bodyDriver" tone="stopped" style={styles.gap}>
              Your battery is low, so Backhaul is checking less often to help the
              phone last the trip.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {refusal !== null ? (
        <View style={[styles.refusal, { backgroundColor: colours.exceptionWash, borderColor: colours.exception }]}>
          <Icon name="alert" size="md" colour={colours.exception} />
          <Text variant="bodyDriver" tone="exception" style={styles.flex}>
            {refusal}
          </Text>
        </View>
      ) : null}

      {/*
        Two things a driver does that are not a state change: say something
        went wrong, and hand the goods over. Both at driver size, side by side,
        above the state buttons — a driver at a roadside should not scroll past
        four cards to report a breakdown.
      */}
      <View style={styles.pair}>
        <Press
          onPress={onReport}
          accessibilityLabel="Report a problem"
          feedback="opacity"
          style={[styles.half, { borderColor: colours.outline }]}
        >
          <Icon name="flag" size="lg" colour={colours.textSecondary} />
          <Text variant="bodyDriver" tone="secondary" numberOfLines={1}>
            Report
          </Text>
        </Press>

        <Press
          onPress={onDeliver}
          accessibilityLabel="Hand over and sign"
          feedback="opacity"
          style={[styles.half, { borderColor: colours.outline }]}
        >
          <Icon name="camera" size="lg" colour={colours.textSecondary} />
          <Text variant="bodyDriver" tone="secondary" numberOfLines={1}>
            Hand over
          </Text>
        </Press>
      </View>

      <Press
        onPress={onOpenHistory}
        accessibilityLabel="Your past trips and earnings"
        feedback="opacity"
        style={[styles.link, { borderColor: colours.outline }]}
      >
        <Icon name="naira" size="sm" colour={colours.textSecondary} />
        <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
          Your trips and what they paid
        </Text>
        <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
      </Press>

      {next.length > 0 ? (
        <View style={styles.actions}>
          {next.map((candidate) => (
            <Pressable
              key={candidate}
              onPress={() => move(candidate)}
              accessibilityRole="button"
              accessibilityLabel={actionLabel(candidate)}
              style={({ pressed }) => [
                styles.action,
                elevation.lifted,
                { backgroundColor: colours.accent, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text variant="title" style={{ color: colours.onAccent }}>
                {actionLabel(candidate)}
              </Text>
              <Icon name="chevron-right" size="md" colour={colours.onAccent} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Card overline="Finished" icon="check">
          <Text variant="title">This trip is done.</Text>
          <Text variant="bodyDriver" tone="secondary" style={styles.gap}>
            Nothing more to do, and nothing is being shared any more.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

/**
 * How often, in words rather than a number and a unit.
 *
 * "every 1 minutes" is what the arithmetic produces and it is not a sentence.
 */
function cadence(seconds: number): string {
  if (seconds < 60) {
    return `every ${seconds} seconds`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
}

/**
 * What the button does, in the driver's words rather than the machine's.
 *
 * The state machine's vocabulary is for the record; a driver at a loading bay
 * is pressing "I've started loading", not "transition to loading".
 */
function actionLabel(state: TripState): string {
  switch (state) {
    case 'loading':
      return "I've started loading";
    case 'in_transit':
      return "I'm on the road";
    case 'arrived':
      return "I've arrived";
    case 'delivered':
      return 'Delivered';
    case 'assigned':
      return 'Accept this trip';
    case 'signal_lost':
    case 'stalled':
    case 'open':
    case 'disputed':
    case 'cancelled':
      return state.replace(/_/g, ' ');
  }
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md },
  half: {
    flex: 1,
    minHeight: target.driver + space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.md,
  },
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  flex: { flex: 1 },
  gap: { marginTop: space.sm },
  route: { gap: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  consent: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    gap: space.sm,
  },
  consentHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  refusal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: target.standard,
  },
  actions: { gap: space.md },
  action: {
    minHeight: target.driver,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
});

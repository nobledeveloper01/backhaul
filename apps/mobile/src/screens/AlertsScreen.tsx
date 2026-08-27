import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  POLICY,
  QUIET_FROM_HOUR,
  QUIET_TO_HOUR,
  decideAlert,
  describeAlert,
  digest,
  type AlertKind,
  type Urgency,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly onBack: () => void;
}

const KINDS = Object.keys(POLICY) as AlertKind[];

const HOURS = [3, 9, 14, 23];

/**
 * What we will tell you, and when.
 *
 * A notification settings screen usually lists switches. This lists the
 * **policy** — because the thing a fleet owner actually wants to know before
 * trusting an app with their phone is whether it will wake them at 3am, and a
 * row of toggles answers that only by implication.
 *
 * The hour selector is the demonstration. Moving it re-runs `decideAlert` for
 * every kind, so the screen shows the real decision rather than a description
 * of one.
 */
export function AlertsScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();

  const [hour, setHour] = useState(14);

  const now = new Date();
  const decisions = KINDS.map((kind) => ({
    kind,
    decision: decideAlert({
      kind,
      to: 'shipper',
      localHour: hour,
      lastSentAt: null,
      now,
    }),
  }));

  const held = decisions
    .filter((row) => !row.decision.send && row.decision.reason === 'quiet_hours')
    .map((row) => row.kind);

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="What reaches your phone" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Text variant="body" tone="secondary">
          Six engines can each produce something worth knowing. None of them
          decides whether to interrupt you — this does, in one place, because
          the way an app loses its notifications is by sending a reasonable
          number of them six times over.
        </Text>

        <Card overline="At what time?" icon="clock" emphasis="plain">
          <View style={styles.hours}>
            {HOURS.map((option) => (
              <Chip
                key={option}
                label={`${String(option).padStart(2, '0')}:00`}
                selected={hour === option}
                onPress={() => setHour(option)}
              />
            ))}
          </View>
          <Text variant="label" tone="secondary" style={styles.gapTop}>
            Quiet between {QUIET_FROM_HOUR}:00 and 0{QUIET_TO_HOUR}:00. Anything
            held is not dropped — it arrives in the morning as one line.
          </Text>
        </Card>

        {decisions.map(({ kind, decision }) => (
          <View
            key={kind}
            style={[styles.row, { borderBottomColor: colours.outline }]}
          >
            <View style={styles.flex}>
              <Text variant="body">{sentenceCase(describeAlert(kind))}</Text>
              <Text variant="label" tone="secondary">
                {POLICY[kind].to.join(', ')} · at most once every{' '}
                {every(POLICY[kind].repeatAfterMs)}
              </Text>
            </View>

            <Outcome
              send={decision.send}
              urgency={decision.send ? decision.urgency : POLICY[kind].urgency}
              reason={decision.send ? null : decision.reason}
            />
          </View>
        ))}

        {held.length > 0 ? (
          <Card overline="In the morning" icon="message" emphasis="plain">
            <Text variant="body">{digest(held)}</Text>
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              One line rather than four buzzes in a minute, which reads as a
              malfunction rather than as a summary.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Outcome({
  send,
  urgency,
  reason,
}: {
  send: boolean;
  urgency: Urgency;
  reason: string | null;
}) {
  const colours = useColours();

  const [label, tint, icon] = !send
    ? reason === 'quiet_hours'
      ? (['Held', colours.stale, 'moon'] as const)
      : (['Not sent', colours.textSecondary, 'close'] as const)
    : urgency === 'urgent'
      ? (['Wakes you', colours.exception, 'alert'] as const)
      : urgency === 'push'
        ? (['Notifies', colours.accent, 'signal'] as const)
        : (['In the app', colours.textSecondary, 'list'] as const);

  return (
    <View style={[styles.outcome, { borderColor: tint }]}>
      <Icon name={icon} size="sm" colour={tint} />
      <Text variant="label" numberOfLines={1} style={{ color: tint }}>
        {label}
      </Text>
    </View>
  );
}

const sentenceCase = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * "5 min", "4 h".
 *
 * Rounding everything to hours printed "at most once every 0 h" beside the
 * duress alarm, whose window is five minutes — a repeat limit of zero, which
 * is the opposite of what it says.
 */
function every(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  gapTop: { marginTop: space.md },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  outcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  describeCadence,
  describeDue,
  due,
  dueIn,
  format,
  isDue,
  typicalPrice,
  type Lane,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow } from '../state/demo';
import { demoLanes } from '../state/product';

interface Props {
  readonly onBack: () => void;
  readonly onPost: () => void;
}

/**
 * The runs a shipper makes over and over.
 *
 * The smallest feature in the product and the one with the most leverage: a
 * shipper with three saved lanes posts in two taps, and a lane that has run
 * eleven times knows what it costs. It is the first thing here that gets
 * better simply because time passed.
 *
 * Due lanes lead. Everything else is a list.
 */
export function LanesScreen({ onBack, onPost }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const lanes = useMemo(() => demoLanes(now), [now]);
  // `due()` rather than a filter: it sorts most-overdue first, which is what
  // makes the one filled button land on the lane that actually needs posting.
  // Filtering kept the demo's own order and put "due tomorrow" above "five
  // days overdue".
  const dueNow = due(lanes, now);
  const rest = lanes.filter((lane) => !isDue(lane, now));

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Your lanes" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {dueNow.length > 0 ? (
          <>
            <Text variant="overline" tone="secondary">
              COMING ROUND AGAIN
            </Text>
            {/*
              Only the first due lane gets a filled button. Two of them side by
              side is a screen with two primaries, which is a screen with none —
              and the one that is overdue should be the one being pointed at.
            */}
            {dueNow.map((lane, index) => (
              <Row
                key={lane.id}
                lane={lane}
                now={now}
                onPost={onPost}
                due
                lead={index === 0}
              />
            ))}
            <Text variant="label" tone="secondary">
              Two days of warning, so a load is posted before the day rather than
              on it — a load posted the morning it must move goes to whoever is
              nearest rather than to whoever is best.
            </Text>
          </>
        ) : null}

        <Text variant="overline" tone="secondary" style={styles.heading}>
          SAVED
        </Text>

        {rest.map((lane) => (
          <Row key={lane.id} lane={lane} now={now} onPost={onPost} due={false} lead={false} />
        ))}
      </ScrollView>
    </View>
  );
}

function Row({
  lane,
  now,
  onPost,
  due,
  lead,
}: {
  lane: Lane;
  now: Date;
  onPost: () => void;
  due: boolean;
  lead: boolean;
}) {
  const colours = useColours();
  const typical = typicalPrice(lane);

  // Overdue is a different fact from due, and reading them in the same colour
  // makes "act now" and "you have a day" look alike.
  const overdue = (dueIn(lane, now) ?? 0) < 0;

  return (
    <Card emphasis={due ? 'accent' : 'raised'}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="title">{lane.name}</Text>
          <Text variant="body" tone="secondary">
            {lane.origin} → {lane.destination} · {lane.cargo}
          </Text>
        </View>
        <Text variant="label" tone={overdue ? 'stopped' : due ? 'accent' : 'secondary'}>
          {describeDue(lane, now)}
        </Text>
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <Text variant="label" tone="secondary">
            Usually
          </Text>
          {/*
            The median of the recent runs, not the average of everything. A
            mean over two years anchors a shipper to a number that stopped
            being true.
          */}
          <Text variant="title" tabular>
            {typical === null ? '—' : format(typical)}
          </Text>
          <Text variant="label" tone="secondary">
            {typical === null
              ? 'after three runs'
              : `from ${lane.history.length} runs`}
          </Text>
        </View>

        <View style={styles.fact}>
          <Text variant="label" tone="secondary">
            How often
          </Text>
          <Text variant="title">{describeCadence(lane.cadence)}</Text>
        </View>
      </View>

      <Press
        onPress={onPost}
        accessibilityLabel={`Post ${lane.name}`}
        accessibilityHint="Opens it to bids with this lane's details already filled in"
        feedback="opacity"
        style={[
          styles.post,
          {
            backgroundColor: lead ? colours.accent : 'transparent',
            borderColor: lead ? colours.accent : colours.outline,
          },
        ]}
      >
        <Icon name="plus" size="sm" colour={lead ? colours.onAccent : colours.textSecondary} />
        <Text
          variant="label"
          style={{ color: lead ? colours.onAccent : colours.textSecondary }}
        >
          Post this run
        </Text>
      </Press>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  facts: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  fact: { flex: 1, gap: 2 },
  post: {
    marginTop: space.md,
    minHeight: target.standard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

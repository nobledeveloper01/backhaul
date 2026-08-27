import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  byUrgency,
  describePaper,
  describeTruckClass,
  describeStanding,
  mayCarry,
  type Assessment,
  type Standing,
  type Vehicle,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow } from '../state/demo';
import { demoVehicles } from '../state/product';

interface Props {
  readonly onBack: () => void;
}

/**
 * The trucks, worst first.
 *
 * `trust.ts` verifies a carrier; this verifies the thing that actually carries
 * the goods. Conflating them is how a Trusted carrier ends up moving somebody's
 * cargo on a trailer whose roadworthiness lapsed in March.
 *
 * Sorted by urgency rather than by plate, because a fleet list sorted
 * alphabetically is a list nobody scrolls to the bottom of — and the truck at
 * the bottom is the one with the lapsed certificate.
 */
export function VehiclesScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const fleet = useMemo(() => byUrgency(demoVehicles(now), now), [now]);
  const grounded = fleet.filter((entry) => !mayCarry(entry.assessment)).length;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Trucks and papers" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <View style={styles.lede}>
          <Icon
            name={grounded === 0 ? 'check' : 'alert'}
            size="sm"
            colour={grounded === 0 ? colours.moving : colours.exception}
          />
          <Text
            variant="body"
            tone={grounded === 0 ? 'moving' : 'exception'}
            style={styles.flex}
          >
            {grounded === 0
              ? `All ${fleet.length} trucks can take work`
              : `${grounded} of ${fleet.length} cannot be given a new trip`}
          </Text>
        </View>

        {fleet.map(({ vehicle, assessment }) => (
          <Row key={vehicle.id} vehicle={vehicle} assessment={assessment} />
        ))}

        <Text variant="label" tone="secondary">
          A paper that lapses while a truck is on the road never strands it. It
          blocks the next trip instead — the pressure belongs on the office, not
          on a driver eight hundred kilometres from home.
        </Text>
      </ScrollView>
    </View>
  );
}

function Row({ vehicle, assessment }: { vehicle: Vehicle; assessment: Assessment }) {
  const colours = useColours();
  const tint = tintFor(assessment.standing, colours);

  return (
    <Card emphasis={mayCarry(assessment) ? 'raised' : 'accent'}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="title">{vehicle.plate}</Text>
          <Text variant="label" tone="secondary">
            {describeTruckClass(vehicle.truck)}
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: tint }]}>
          <Text variant="label" style={{ color: tint }}>
            {describeStanding(assessment.standing)}
          </Text>
        </View>
      </View>

      {assessment.lapsed.map((entry) => (
        <Line
          key={entry.paper}
          icon="alert"
          colour={colours.exception}
          text={`${describePaper(entry.paper)} — ${Math.abs(entry.days)} days out of date`}
        />
      ))}

      {assessment.missing.map((paper) => (
        <Line
          key={paper}
          icon="close"
          colour={colours.textSecondary}
          text={`${describePaper(paper)} — never uploaded`}
        />
      ))}

      {assessment.expiring.map((entry) => (
        <Line
          key={entry.paper}
          icon="clock"
          colour={colours.stopped}
          text={`${describePaper(entry.paper)} — ${entry.days} days left`}
        />
      ))}

      {assessment.standing === 'road_legal' ? (
        <Line icon="check" colour={colours.moving} text="Every paper in date" />
      ) : null}
    </Card>
  );
}

function Line({
  icon,
  colour,
  text,
}: {
  icon: 'alert' | 'clock' | 'check' | 'close';
  colour: string;
  text: string;
}) {
  return (
    <View style={styles.line}>
      <Icon name={icon} size="sm" colour={colour} />
      <Text variant="body" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

function tintFor(standing: Standing, colours: ReturnType<typeof useColours>): string {
  switch (standing) {
    case 'road_legal':
      return colours.moving;
    case 'expiring':
      return colours.stopped;
    case 'lapsed':
      return colours.exception;
    case 'incomplete':
      return colours.textSecondary;
    case 'retired':
      return colours.outline;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  lede: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.sm },
  badge: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
});

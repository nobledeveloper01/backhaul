import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type Assessment,
  type Paper,
  type Standing,
  type TruckClass,
  type Vehicle,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import { PAPER_WORDS, STANDING_WORDS, TRUCK_WORDS } from '../state/words';

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
/**
 * Worst first.
 *
 * The same order `byUrgency` produces in the domain — a truck that cannot
 * legally move belongs above one whose insurance lapses in three weeks, and a
 * retired truck belongs at the bottom rather than in the middle because it is
 * technically road-legal.
 */
const URGENCY: Readonly<Record<Standing, number>> = {
  lapsed: 0,
  incomplete: 1,
  expiring: 2,
  road_legal: 3,
  retired: 4,
};

export function VehiclesScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const { api } = useSession();

  /*
    The assessment comes from the server already made.

    Both sides implement `assess` and the parity fixtures hold them to the same
    standing — but the *inputs* are expiry dates, and the wire carries days
    rather than dates. Rebuilding a date from a day count and re-assessing
    would round-trip fine for a lapsed paper and invent one for a paper that is
    simply in date: the server does not say when, only that it is. Inventing a
    far-future expiry to satisfy the local engine would be the app making up
    the one fact this screen exists to show.

    So the standing, the lapsed list and the expiring list are read, and the
    ordering — the part that is presentation rather than fact — is done here.
  */
  const { query } = useMine(() => api.vehicles(), [api]);

  const fleet = useMemo(() => {
    const rows = query.state === 'ready' ? query.value : [];

    return [...rows]
      .map((row) => ({
        vehicle: {
          id: row.id,
          plate: row.plate,
          truck: row.truck as TruckClass,
          carrierId: '',
          papers: {},
          retiredAt: null,
        } satisfies Vehicle,
        assessment: {
          standing: row.standing as Standing,
          lapsed: row.lapsed.map((entry) => ({ paper: entry.paper as Paper, days: entry.days })),
          expiring: row.expiring.map((entry) => ({ paper: entry.paper as Paper, days: entry.days })),
          missing: row.missing.map((paper) => paper as Paper),
        } satisfies Assessment,
        mayCarry: row.mayCarry,
      }))
      .sort((a, b) => URGENCY[a.assessment.standing] - URGENCY[b.assessment.standing]);
  }, [query]);

  const grounded = fleet.filter((entry) => !entry.mayCarry).length;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('trucks_and_papers')} onBack={onBack} />

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
              ? `${fleet.length} ${t('all_trucks_can_take_work')}`
              : `${grounded} ${t('of_count')} ${fleet.length} ${t('cannot_be_given_a_new_trip')}`}
          </Text>
        </View>

        {fleet.map(({ vehicle, assessment, mayCarry }) => (
          <Row
            key={vehicle.id}
            vehicle={vehicle}
            assessment={assessment}
            mayCarry={mayCarry}
          />
        ))}

        <Text variant="label" tone="secondary">
          {t('lapsed_paper_note')}
        </Text>
      </ScrollView>
    </View>
  );
}

/** `mayCarry` is the server's answer, passed down rather than recomputed. */
function Row({
  vehicle,
  assessment,
  mayCarry,
}: {
  vehicle: Vehicle;
  assessment: Assessment;
  mayCarry: boolean;
}) {
  const colours = useColours();
  const { t } = useLanguage();
  const tint = tintFor(assessment.standing, colours);

  return (
    <Card emphasis={mayCarry ? 'raised' : 'accent'}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="title">{vehicle.plate}</Text>
          <Text variant="label" tone="secondary">
            {t(TRUCK_WORDS[vehicle.truck])}
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: tint }]}>
          <Text variant="label" style={{ color: tint }}>
            {t(STANDING_WORDS[assessment.standing])}
          </Text>
        </View>
      </View>

      {assessment.lapsed.map((entry) => (
        <Line
          key={entry.paper}
          icon="alert"
          colour={colours.exception}
          text={`${t(PAPER_WORDS[entry.paper])} — ${Math.abs(entry.days)} ${t('days_out_of_date')}`}
        />
      ))}

      {assessment.missing.map((paper) => (
        <Line
          key={paper}
          icon="close"
          colour={colours.textSecondary}
          text={`${t(PAPER_WORDS[paper])} — ${t('never_uploaded')}`}
        />
      ))}

      {assessment.expiring.map((entry) => (
        <Line
          key={entry.paper}
          icon="clock"
          colour={colours.stopped}
          text={`${t(PAPER_WORDS[entry.paper])} — ${entry.days} ${t('days_left')}`}
        />
      ))}

      {assessment.standing === 'road_legal' ? (
        <Line icon="check" colour={colours.moving} text={t('every_paper_in_date')} />
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

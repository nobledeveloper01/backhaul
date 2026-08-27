import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GRACE_MS,
  cancel,
  countsAgainstRecord,
  format,
  fromNaira,
  subtract,
  type CancelledBy,
  type CancelOutcome,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { map } from '../api/client';
import { demoNow, type DemoTrip } from '../state/demo';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/**
 * What calling it off costs.
 *
 * The number is shown **before** anything is confirmed, and the sentence that
 * explains it is the same one the other party sees. A fee that appears after
 * the fact is a fee somebody disputes; a fee two people read differently is an
 * argument with no referee.
 *
 * The destructive action is last, is the only red thing on the screen, and is
 * not the primary — nobody arrives here having decided.
 */
export function CancelScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const [by, setBy] = useState<CancelledBy>('shipper');
  const [done, setDone] = useState(false);

  const { api } = useSession();

  const state = trip.history.at(-1)?.state ?? 'open';
  const acceptedAt = trip.history.find((event) => event.state === 'assigned')?.at ?? now;
  const agreed = fromNaira(trip.agreedNaira);

  /*
    The fee comes from the server, and the wording with it.

    Both sides implement `cancel` and the parity fixtures hold them to the same
    number *and* the same sentence — but the fee depends on the agreed fare and
    on when the bid was accepted, and both live in the trip's terms, which this
    phone does not hold. Computing it locally from `trip.agreedNaira` was
    computing it from the walkthrough.
  */
  const { query } = useTripData(
    trip.live,
    async () =>
      map(await api.cancellation(trip.id, by), (view) =>
        view.ok
          ? ({
              ok: true,
              feePct: view.feePct ?? 0,
              fee: (view.feeKobo ?? 0) as ReturnType<typeof fromNaira>,
              withinGrace: view.withinGrace ?? false,
              detail: view.detail,
            } as const)
          : ({ ok: false, reason: 'terminal', detail: view.detail } as const),
      ),
    () => cancel({ by, state, agreed, acceptedAt, now }),
    [api, trip.id, by, state, agreed, acceptedAt, now],
  );

  const outcome: CancelOutcome =
    query.state === 'ready'
      ? query.value
      : cancel({ by, state, agreed, acceptedAt, now });

  if (done && outcome.ok) {
    return (
      <View style={[styles.screen, { backgroundColor: colours.surface }]}>
        <ScreenHeader title={t('cancelled')} onBack={onBack} />
        <View style={styles.finished}>
          <Text variant="headline" style={styles.centred}>
            {t('the_trip_is_cancelled')}
          </Text>
          <Text variant="body" tone="secondary" style={styles.centred}>
            {outcome.fee === 0
              ? 'Nothing is owed either way.'
              : `${format(outcome.fee)} is owed, and both sides can see why.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('call_this_trip_off')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {/*
          A reviewer's control. In the product the caller is whoever is signed
          in; here both sides of the same rule are worth being able to read.
        */}
        <View style={styles.sides}>
          {(['shipper', 'carrier'] as const).map((side) => (
            <Press
              key={side}
              onPress={() => setBy(side)}
              accessibilityLabel={`As the ${side}`}
              feedback="opacity"
              style={[
                styles.side,
                {
                  backgroundColor: by === side ? colours.accentWash : colours.surfaceDim,
                  borderColor: by === side ? colours.accent : colours.outline,
                },
              ]}
            >
              <Text
                variant="label"
                style={{ color: by === side ? colours.accent : colours.textSecondary }}
              >
                As the {side}
              </Text>
            </Press>
          ))}
        </View>

        {!outcome.ok ? (
          <Card emphasis="plain">
            <Text variant="title">{outcome.detail}</Text>
          </Card>
        ) : (
          <>
            <Card emphasis="accent" overline={t('what_it_costs')} icon="naira">
              <Text variant="display" tabular>
                {format(outcome.fee)}
              </Text>
              <Text variant="body" tone="secondary" style={styles.gapTop}>
                {outcome.detail}
              </Text>

              {outcome.fee > 0 ? (
                <View style={[styles.split, { borderTopColor: colours.accent }]}>
                  <Row label={t('agreed_fare')} value={format(agreed)} />
                  <Row label={`Cancellation (${outcome.feePct}%)`} value={format(outcome.fee)} />
                  <Row
                    label={t('left_of_the_fare')}
                    value={format(subtract(agreed, outcome.fee))}
                    strong
                  />
                </View>
              ) : null}
            </Card>

            <Card overline={t('and_also')} icon="shield" emphasis="plain">
              <Line
                on={outcome.withinGrace}
                text={`Within ${Math.round(GRACE_MS / 3_600_000)} hours of the bid being accepted`}
              />
              <Line
                on={countsAgainstRecord(by, state)}
                text={t('counts_against_record')}
              />
              <Text variant="label" tone="secondary" style={styles.gapTop}>
                {t('incident_costs_one_tier')}
              </Text>
            </Card>

            {/*
              Last, and the only red thing here. Nobody arrives at this screen
              having decided.
            */}
            <Press
              onPress={() => setDone(true)}
              accessibilityLabel={t('cancel_this_trip')}
              accessibilityHint={outcome.detail}
              style={[styles.destructive, { borderColor: colours.exception }]}
            >
              <Icon name="close" size="md" colour={colours.exception} />
              <Text variant="title" tone="exception">
                {t('cancel_this_trip')}
              </Text>
            </Press>

            <Press
              onPress={onBack}
              accessibilityLabel={t('keep_the_trip')}
              style={[styles.keep, { backgroundColor: colours.accent }]}
            >
              <Text variant="title" style={{ color: colours.onAccent }}>
                {t('keep_the_trip')}
              </Text>
            </Press>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'title' : 'body'} tone={strong ? 'primary' : 'secondary'} style={styles.flex}>
        {label}
      </Text>
      <Text variant={strong ? 'title' : 'body'} tabular>
        {value}
      </Text>
    </View>
  );
}

function Line({ on, text }: { on: boolean; text: string }) {
  const colours = useColours();
  return (
    <View style={styles.check}>
      <Icon name={on ? 'check' : 'close'} size="sm" colour={on ? colours.moving : colours.textSecondary} />
      <Text variant="body" tone={on ? 'primary' : 'secondary'} style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  gapTop: { marginTop: space.md },
  centred: { textAlign: 'center' },
  finished: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  sides: { flexDirection: 'row', gap: space.sm },
  side: {
    flex: 1,
    minHeight: target.standard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  split: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    gap: space.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  destructive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: target.standard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  keep: {
    minHeight: target.standard,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

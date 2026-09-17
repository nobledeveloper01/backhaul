import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canHandOver } from '@backhaul/domain';
import type { TripSummaryView } from '@backhaul/api';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { Unready } from '../components/Unready';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useMine } from '../state/server';
import { useSession } from '../state/session';

interface Props {
  readonly onBack: () => void;
}

/**
 * The carrier hands a trip to the person who will drive it (ADR-0021).
 *
 * Every awarded load opens with the carrier in the driver's slot
 * (ADR-0019), which is right for an owner-operator and wrong for a fleet. This
 * is the fleet's half: the trips that have not started, each with a place to
 * put the driver's number. Once the wheel turns the trip leaves this list —
 * the server refuses a handover mid-transit and this screen does not offer
 * one.
 *
 * The number is a phone number, as everywhere in this product. A driver who
 * has never installed anything still becomes the party; the trip is on their
 * phone the first time they sign in with that SIM.
 */
export function HandOverScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { api } = useSession();

  const { query, refresh } = useMine(
    () => api.trips({ states: ['open', 'assigned', 'loading'] }),
    [api],
  );

  const waiting = useMemo<readonly TripSummaryView[]>(
    () => (query.state === 'ready' ? query.value.filter((trip) => canHandOver(trip.state)) : []),
    [query],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('hand_to_a_driver')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Unready query={query} onRetry={refresh} />

        {query.state !== 'ready' ? null : waiting.length === 0 ? (
          <Card icon="truck">
            <Text variant="body" tone="secondary">
              {t('no_trips_waiting_for_a_driver')}
            </Text>
          </Card>
        ) : (
          <>
            <Text variant="body" tone="secondary" style={styles.lede}>
              {t('you_are_driving_these')}
            </Text>
            {waiting.map((trip) => (
              <HandOverCard key={trip.id} trip={trip} onHandedOver={refresh} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function HandOverCard({
  trip,
  onHandedOver,
}: {
  readonly trip: TripSummaryView;
  readonly onHandedOver: () => void;
}) {
  const colours = useColours();
  const { t } = useLanguage();
  const { api } = useSession();

  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<
    { readonly kind: 'done' } | { readonly kind: 'refused'; readonly detail: string } | null
  >(null);

  const handOver = async () => {
    if (busy || phone.trim() === '') return;
    setBusy(true);
    try {
      const result = await api.handOver(trip.id, phone.trim());
      if (result.ok) {
        setOutcome({ kind: 'done' });
        onHandedOver();
      } else {
        // The server's sentence, in the one language it has; the code is
        // what a screen would render from, and this one has no code yet.
        setOutcome({ kind: 'refused', detail: result.failure.detail });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card overline={`${trip.origin} → ${trip.destination}`} icon="route" style={styles.card}>
      {outcome?.kind === 'done' ? (
        <View style={styles.row}>
          <Icon name="check" size="sm" colour={colours.moving} beside="body" />
          <Text variant="body" style={styles.flex}>
            {t('handed_over')} · {t('the_driver_sees_it_now')}
          </Text>
        </View>
      ) : (
        <>
          <Text variant="label" tone="secondary">
            {t('the_drivers_number').toUpperCase()}
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            accessibilityLabel={t('the_drivers_number')}
            editable={!busy}
            style={[styles.input, { borderColor: colours.outline, color: colours.textPrimary }]}
            placeholderTextColor={colours.textSecondary}
          />
          {outcome?.kind === 'refused' ? (
            <View style={styles.row}>
              <Icon name="alert" size="sm" colour={colours.exception} beside="body" />
              <Text variant="body" tone="exception" style={styles.flex}>
                {outcome.detail}
              </Text>
            </View>
          ) : (
            <Text variant="label" tone="secondary" style={styles.note}>
              {t('a_driver_can_be_named_only_before_it_starts')}
            </Text>
          )}
          <Press
            onPress={() => void handOver()}
            accessibilityLabel={t('give_the_trip')}
            disabled={busy || phone.trim() === ''}
            style={[
              styles.action,
              { backgroundColor: colours.accent, opacity: busy || phone.trim() === '' ? 0.5 : 1 },
            ]}
          >
            <Text variant="title" style={{ color: colours.onAccent }}>
              {t('give_the_trip')}
            </Text>
          </Press>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  lede: { marginBottom: space.xs },
  card: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1 },
  note: { marginTop: space.xs },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 18,
  },
  action: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
});

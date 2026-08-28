import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalisePhone, type Phrase } from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { newId } from '../state/ids';
import type { TripParties } from '../api/client';

interface Props {
  readonly onBack: () => void;
}

/**
 * Which two numbers this caller has to supply, and what to call them.
 *
 * Your own slot comes from your token, so a shipper is asked for the driver
 * and the carrier and never for themselves. The server enforces the same rule
 * and would refuse your own number in your own slot; this is that rule made
 * visible rather than a second copy of it, because a form that asks for
 * something the server will reject is a form that wastes a person's morning.
 */
const OTHERS: Readonly<
  Record<'driver' | 'carrier' | 'shipper', readonly { slot: keyof TripParties; label: Phrase }[]>
> = {
  shipper: [
    { slot: 'driverPhone', label: 'the_drivers_number' },
    { slot: 'carrierPhone', label: 'the_carriers_number' },
  ],
  carrier: [
    { slot: 'driverPhone', label: 'the_drivers_number' },
    { slot: 'shipperPhone', label: 'the_shippers_number' },
  ],
  driver: [
    { slot: 'carrierPhone', label: 'the_carriers_number' },
    { slot: 'shipperPhone', label: 'the_shippers_number' },
  ],
};

/**
 * The wedge.
 *
 * Almost every load in this market is agreed somewhere the product cannot
 * see — on WhatsApp, on a call, in a yard — and the one sentence this project
 * settles arguments with says tracking is what that is worth paying for, with
 * one truck and nobody else on the platform. Until this screen existed the
 * only way a trip came into being was post a load and take a bid, which is the
 * half that is worth nothing until there is liquidity.
 *
 * The two other parties are named by **phone number**, because a number is
 * what somebody who agreed a load on WhatsApp actually has. A number with no
 * account behind it gets one, holding the number and nothing else until its
 * owner signs in with that SIM — and this screen cannot tell you which of the
 * two happened, deliberately. See ADR-0016.
 */
export function TrackTripScreen({ onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { api, who } = useSession();

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');
  const [numbers, setNumbers] = useState<Record<string, string>>({});

  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);

  const asked = who === null ? [] : OTHERS[who.role];

  /*
    Checked here with the engine the server checks with.

    `normalisePhone` is the same function on both sides — four people write one
    number four ways and every one means the same driver. Running it on the
    phone is not a second implementation, it is the first one used twice: it
    means a mistyped number is caught before a request goes out, rather than
    after a round trip on a corridor where a round trip costs thirty seconds.
  */
  const reachable: Record<string, string> = {};
  let unreachable: Phrase | null = null;
  for (const { slot } of asked) {
    const typed = (numbers[slot] ?? '').trim();
    if (typed.length === 0) continue;
    const number = normalisePhone(typed);
    if (number === null) unreachable = 'not_a_number_this_can_reach';
    else reachable[slot] = number;
  }
  const parties: TripParties = reachable;

  const complete =
    origin.trim().length > 0 &&
    destination.trim().length > 0 &&
    asked.every(({ slot }) => reachable[slot] !== undefined);

  const ready = who !== null && complete && unreachable === null && !opening && !opened;

  /*
    Opened only when the server says so, and it says nothing about the numbers.

    The failure copy says nothing was sent to anybody on purpose: a person who
    typed two numbers and saw an error needs to know whether two strangers have
    just had their phones ring. They have not.
  */
  const open = () => {
    if (!ready) return;

    setOpening(true);
    setFailed(false);

    void api
      .openTrip(
        newId(),
        parties,
        { origin: origin.trim(), destination: destination.trim() },
        new Date(),
        who?.role ?? 'shipper',
        note.trim().length === 0 ? undefined : note.trim(),
      )
      .then((result) => {
        setOpening(false);
        if (result.ok) setOpened(true);
        else setFailed(true);
      });
  };

  const field = (
    label: Phrase,
    value: string,
    onChange: (next: string) => void,
    numeric = false,
  ) => (
    <View style={styles.field}>
      <Text variant="label" tone="secondary">
        {t(label)}
      </Text>
      <TextInput
        value={value}
        onChangeText={(next) => {
          setFailed(false);
          onChange(next);
        }}
        editable={!opened}
        keyboardType={numeric ? 'phone-pad' : 'default'}
        // `tel` on the phone fields so the keyboard suggests the number the
        // person is already looking at in their messages.
        textContentType={numeric ? 'telephoneNumber' : 'none'}
        accessibilityLabel={t(label)}
        placeholderTextColor={colours.textSecondary}
        style={[
          styles.input,
          { borderColor: colours.outline, color: colours.textPrimary },
        ]}
      />
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('track_a_trip')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {opened ? (
          <Card emphasis="accent" overline={t('track_a_trip')} icon="route">
            <Text variant="title">
              {origin.trim()} → {destination.trim()}
            </Text>
            <Text variant="body" tone="secondary" style={styles.gapTop}>
              {t('it_is_on_your_list_now')}
            </Text>
          </Card>
        ) : (
          <>
            <Card overline={t('track_a_trip')} icon="route">
              <Text variant="body" tone="secondary">
                {t('arranged_anywhere')}
              </Text>
            </Card>

            <Card overline={t('the_route')} icon="route">
              {field('where_it_loads', origin, setOrigin)}
              {field('where_it_unloads', destination, setDestination)}
              {field('what_it_is_carrying', note, setNote)}
            </Card>

            <Card overline={t('who_is_on_it')} icon="shield">
              {asked.map(({ slot, label }) =>
                <View key={slot}>
                  {field(label, numbers[slot] ?? '', (next) =>
                    setNumbers((held) => ({ ...held, [slot]: next })),
                  true)}
                </View>,
              )}

              {unreachable === null ? null : (
                <Text variant="label" tone="secondary" style={styles.gapTop}>
                  {t(unreachable)}
                </Text>
              )}
            </Card>

            {failed ? (
              <View style={styles.state}>
                <Icon name="alert" size="md" colour={colours.stopped} beside="body" />
                <Text variant="body" style={styles.flex}>
                  {t('could_not_start_tracking')}
                </Text>
              </View>
            ) : null}

            {who === null ? (
              /*
                The walkthrough has no token, so it has no slot of its own to
                fill and the server has nobody to admit. Said rather than shown
                as a button that cannot work — the same choice the share screen
                makes about a link it cannot really issue.
              */
              <Text variant="label" tone="secondary">
                {t('walkthrough_opens_no_trips')}
              </Text>
            ) : (
              <Press
                onPress={open}
                accessibilityLabel={t('start_tracking_it')}
                feedback="opacity"
                style={[
                  styles.primary,
                  {
                    backgroundColor: ready ? colours.accent : colours.surfaceDim,
                    opacity: ready ? 1 : 0.6,
                  },
                ]}
              >
                <Text variant="title" style={{ color: ready ? colours.onAccent : colours.textSecondary }}>
                  {t(opening ? 'starting_to_track' : 'start_tracking_it')}
                </Text>
              </Press>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.md, gap: space.md },
  field: { gap: space.xs, marginTop: space.sm },
  input: {
    minHeight: target.standard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  primary: {
    minHeight: target.standard,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1 },
  gapTop: { marginTop: space.xs },
});

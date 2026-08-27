import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MINIMUM_PHOTOS,
  capturedAwayFromDestination,
  capturedNear,
  describeException,
  document,
  seal,
  settlesDespite,
  type Delivery,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoDelivery, demoWaypoints } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

const stamp = (at: Date) =>
  `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${at
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

/**
 * The delivery, and the document it produces.
 *
 * Two halves on one screen because they are two views of one thing: what the
 * driver captured, and the note the shipper reads. Three separate renderings of
 * the same delivery that disagree is exactly the situation a proof is supposed
 * to end, so the lines come from `document()` and not from this file.
 *
 * The capture is **live** here — photographs and a signature can be added, and
 * `seal()` decides when it is enough. The refusal is the interesting state: it
 * has to say what is missing without making the driver read a checklist.
 */
export function ProofScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const captured = useMemo(() => demoDelivery(trip, now), [trip, now]);
  const destination = useMemo(
    () => demoWaypoints(trip).find((w) => w.kind === 'destination') ?? null,
    [trip],
  );

  const [delivery, setDelivery] = useState<Delivery>({
    ...captured,
    photoIds: [],
    signature: null,
  });

  const sealed = seal(delivery);
  const away = capturedNear(delivery, destination);
  const far = capturedAwayFromDestination(delivery, destination);

  const lines = document({
    delivery,
    destination,
    cargo: trip.cargo,
    reference: `BH-${trip.id.slice(-4).toUpperCase()}`,
    formatDate: stamp,
  });

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Proof of delivery" onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {/*
          The refusal, above everything. A driver standing in a market with a
          queue behind them needs the next action, not a status.
        */}
        <Card emphasis={sealed.ok ? 'raised' : 'accent'} overline="Handover" icon="camera">
          <View style={styles.state}>
            <Icon
              name={sealed.ok ? 'check' : 'camera'}
              size="md"
              colour={sealed.ok ? colours.moving : colours.accent}
            />
            <Text variant="title" style={styles.flex}>
              {sealed.ok ? 'Signed for' : sealed.detail}
            </Text>
          </View>

          <View style={styles.capture}>
            <Press
              onPress={() =>
                setDelivery((was) => ({
                  ...was,
                  photoIds: [...was.photoIds, `p${was.photoIds.length + 1}`],
                }))
              }
              accessibilityLabel="Take a photograph"
              style={[styles.tile, { borderColor: colours.outline }]}
            >
              <Icon name="camera" size="lg" colour={colours.textSecondary} />
              <Text variant="body" tone="secondary">
                {delivery.photoIds.length} of {MINIMUM_PHOTOS}
              </Text>
            </Press>

            <Press
              onPress={() =>
                setDelivery((was) => ({ ...was, signature: captured.signature }))
              }
              accessibilityLabel="Capture a signature"
              style={[styles.tile, { borderColor: colours.outline }]}
            >
              <Icon
                name="pen"
                size="lg"
                colour={delivery.signature === null ? colours.textSecondary : colours.moving}
              />
              <Text variant="body" tone="secondary" numberOfLines={1}>
                {delivery.signature?.name ?? 'Signature'}
              </Text>
            </Press>
          </View>

          <Text variant="label" tone="secondary" style={styles.gapTop}>
            The goods, and where you are. Two is the fewest that make a delivery
            arguable — one photograph of a pallet could have been taken anywhere.
          </Text>
        </Card>

        {/*
          Position is a flag, never a refusal. A market address in Kano is a
          district, not a gate, and a driver who cannot close a delivery they
          actually made will stop using the app before the day is out.
        */}
        {away !== null ? (
          <Card overline="Where it was captured" icon="pin" emphasis="plain">
            <View style={styles.state}>
              <Icon
                name={far ? 'alert' : 'check'}
                size="md"
                colour={far ? colours.stopped : colours.moving}
              />
              <Text variant="body" style={styles.flex}>
                {far
                  ? `${Math.round(away / 100) / 10} km from ${destination?.name ?? 'the destination'}. Recorded on the document.`
                  : `At ${destination?.name ?? 'the destination'} — ${Math.round(away)} m out.`}
              </Text>
            </View>
          </Card>
        ) : null}

        {delivery.exception !== null ? (
          <Card overline="Exception" icon="alert">
            <Text variant="title">{describeException(delivery.exception)}</Text>
            <Text variant="body" tone="secondary" style={styles.gapTop}>
              {delivery.exception.note}
            </Text>
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              {settlesDespite(delivery.exception)
                ? 'This trip still settles. A shortage is argued separately — holding the whole payment punishes the carrier for a discrepancy that is usually the loading end’s.'
                : 'Nothing was handed over, so nothing is owed for the handover.'}
            </Text>
          </Card>
        ) : null}

        <Text variant="overline" tone="secondary" style={styles.heading}>
          THE DELIVERY NOTE
        </Text>

        <Card emphasis="plain">
          {lines.map((line) => (
            <View key={line.label} style={[styles.line, { borderBottomColor: colours.outline }]}>
              <Text variant="label" tone="secondary" style={styles.lineLabel}>
                {line.label}
              </Text>
              {/*
                Not monospaced. Menlo at body size is wide enough that
                "Ibrahim Sani (storekeeper)" truncated mid-word on a document
                whose entire job is to be readable afterwards. Tabular figures
                are for numbers that change in place, not for prose.
              */}
              <Text variant="body" style={styles.lineValue}>
                {line.value}
              </Text>
            </View>
          ))}
          <Text variant="label" tone="secondary" style={styles.gapTop}>
            The same lines go into the PDF and the dispute pack. There is one
            version of this document, not three.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  state: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  capture: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  tile: {
    flex: 1,
    minHeight: target.driver + space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.sm,
  },
  gapTop: { marginTop: space.md },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineLabel: { width: 110 },
  lineValue: { flex: 1 },
});

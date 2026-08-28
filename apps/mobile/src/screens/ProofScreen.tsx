import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MINIMUM_PHOTOS,
  capturedAwayFromDestination,
  capturedNear,
  document,
  documentText,
  seal,
  settlesDespite,
  type Delivery,
  type ExceptionKind,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Unready } from '../components/Unready';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { newId } from '../state/ids';
import { map } from '../api/client';
import { EXCEPTION_WORDS } from '../state/words';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoDelivery, demoWaypoints } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
  /** Absent on the driver's copy — a driver does not review themselves. */
  readonly onReview?: (() => void) | undefined;
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
export function ProofScreen({ trip, onBack, onReview }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const { t } = useLanguage();

  const captured = useMemo(() => demoDelivery(trip, now), [trip, now]);
  const destination = useMemo(
    () => demoWaypoints(trip).find((w) => w.kind === 'destination') ?? null,
    [trip],
  );

  const { api } = useSession();

  /*
    The draft lives on the server, not in this component.

    A delivery is captured at a gate on a phone that may be closed, killed by
    the OEM, or out of battery before the driver reaches the office. Holding
    the photographs and the signature in `useState` means a delivery that
    vanishes when the app does — which is the one piece of evidence the whole
    product is built to keep.
  */
  const { query, refresh } = useTripData(
    trip.live,
    async () =>
      map(await api.delivery(trip.id), (view) =>
        view === null
          ? { delivery: { ...captured, photoIds: [], signature: null }, sealedAt: null, canSeal: false }
          : {
            sealedAt: view.sealedAt,
            canSeal: view.canSeal,
            delivery: {
              tripId: trip.id,
              at: view.at,
              photoIds: view.photoIds,
              signature:
                view.signatureName === null
                  ? null
                  : {
                      name: view.signatureName,
                      role: view.signatureRole ?? '',
                      // The strokes are an opaque blob the domain never looks
                      // inside, and the list route does not send its id.
                      imageId: '',
                    },
              capturedAt: captured.capturedAt,
              note: view.note,
              exception:
                view.exceptionKind === null
                  ? null
                  : {
                      kind: view.exceptionKind as ExceptionKind,
                      quantity: view.exceptionQuantity,
                      note: view.exceptionNote ?? '',
                      photoIds: [],
                    },
            },
          },
      ),
    () => ({
      delivery: { ...captured, photoIds: [], signature: null },
      sealedAt: null,
      canSeal: false,
    }),
    [api, trip.id, captured],
  );

  const delivery: Delivery =
    query.state === 'ready'
      ? query.value.delivery
      : { ...captured, photoIds: [], signature: null };

  /** Saves the draft and re-reads it, so the screen shows what the server holds. */
  const save = (next: Delivery) => {
    if (!trip.live) return;

    void api
      .saveDelivery(trip.id, {
        at: next.at,
        photoIds: next.photoIds,
        signatureName: next.signature?.name ?? null,
        signatureRole: next.signature?.role ?? null,
        signatureImageId: next.signature?.imageId ?? null,
        note: next.note,
      })
      .then(() => refresh());
  };

  /*
    Whether the server holds a sealed proof, and whether it would accept one.

    `seal()` answers "is this enough" from what is on the screen. It is not the
    same question as "has this been sealed", and the screen was rendering the
    first as though it were the second: a driver saw "signed for" the moment
    the local check passed, and `api.sealDelivery` was never called by
    anything. Nothing downstream fires without it — a delivered trip with no
    sealed proof has no date to hang the pay on, so the earnings statement
    skips it and the escrow milestone never releases.

    The walkthrough has no server to ask, so it keeps the local answer. That is
    the same split as every other screen here.
  */
  const held = query.state === 'ready' && trip.live ? query.value : null;
  const sealedAt = held?.sealedAt ?? null;
  const sealed = sealedAt !== null ? { ok: true as const } : seal(delivery);
  const canSeal = held === null ? seal(delivery).ok : held.canSeal;
  const away = capturedNear(delivery, destination);
  const far = capturedAwayFromDestination(delivery, destination);

  const lines = document({
    delivery,
    destination,
    cargo: trip.cargo,
    reference: `BH-${trip.id.slice(-4).toUpperCase()}`,
    sealedAt,
    formatDate: stamp,
  });

  /*
    Whether the last hand-over failed, so the screen can say so.

    `Share.share` rejects when the sheet cannot open at all — no handler on a
    stripped Transsion ROM is the realistic one. Swallowing that leaves a
    driver pressing a button that does nothing at the moment they are trying to
    hand the note over, which is the worst place in this product to be silent.
    A dismissed sheet is not a failure and resolves normally.
  */
  const [handOverFailed, setHandOverFailed] = useState(false);

  /*
    The note as text, through the share sheet — WhatsApp, SMS, email, notes.

    Plain text rather than a rendered file because this runs on a 2 GB handset
    that has been offline all trip, and because text is the one format every
    app on that phone can already receive. The lines are `document()`'s, not
    this screen's: a hand-over that disagreed with what the shipper reads would
    be two proofs of one delivery.
  */
  const handOver = () => {
    setHandOverFailed(false);
    void Share.share({
      message: documentText({ title: t('the_delivery_note'), lines }),
      // Android puts this on the chooser and into an email subject; iOS ignores it.
      title: t('the_delivery_note'),
    }).catch(() => setHandOverFailed(true));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('proof_of_delivery')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {/*
          Nothing derived from the answer until there is one.

          The binding above fell back to an empty list (or the walkthrough) on
          every outcome that was not a value, so a server this phone could not
          reach rendered as a fact about somebody's own records. See `Unready`.
        */}
        <Unready query={query} onRetry={refresh} />

        {query.state !== 'ready' ? null : (
          <>
            {/*
              The refusal, above everything. A driver standing in a market with a
              queue behind them needs the next action, not a status.
            */}
            <Card emphasis={sealed.ok ? 'raised' : 'accent'} overline={t('handover')} icon="camera">
              <View style={styles.state}>
                <Icon
                  name={sealed.ok ? 'check' : 'camera'}
                  size="md"
                  colour={sealed.ok ? colours.moving : colours.accent}
                  beside="title"
                />
                <Text variant="title" style={styles.flex}>
                  {sealed.ok ? t('signed_for') : sealed.detail}
                </Text>
              </View>

              {/*
                The one-way door, and only when the server would open it.

                Sealing is the moment the proof stops being editable, which is
                why it is a deliberate action rather than something that
                happens when the last photograph lands. Once it is through, the
                button is gone — there is nothing to press twice.
              */}
              {trip.live && sealedAt === null && canSeal ? (
                <Press
                  onPress={() => {
                    void api.sealDelivery(trip.id).then(() => refresh());
                  }}
                  accessibilityLabel={t('seal_the_proof')}
                  style={[styles.seal, { backgroundColor: colours.accent }]}
                >
                  <Text variant="title" style={{ color: colours.onAccent }}>
                    {t('seal_the_proof')}
                  </Text>
                </Press>
              ) : null}

              <View style={styles.capture}>
                <Press
                  onPress={() =>
                    save({ ...delivery, photoIds: [...delivery.photoIds, newId()] })
                  }
                  accessibilityLabel={t('take_photo')}
                  style={[styles.tile, { borderColor: colours.outline }]}
                >
                  <Icon name="camera" size="lg" colour={colours.textSecondary} />
                  <Text variant="body" tone="secondary">
                    {delivery.photoIds.length} of {MINIMUM_PHOTOS}
                  </Text>
                </Press>

                <Press
                  onPress={() => save({ ...delivery, signature: captured.signature })}
                  accessibilityLabel={t('ask_for_signature')}
                  style={[styles.tile, { borderColor: colours.outline }]}
                >
                  <Icon
                    name="pen"
                    size="lg"
                    colour={delivery.signature === null ? colours.textSecondary : colours.moving}
                  />
                  <Text variant="body" tone="secondary" numberOfLines={1}>
                    {delivery.signature?.name ?? t('signature')}
                  </Text>
                </Press>
              </View>

              <Text variant="label" tone="secondary" style={styles.gapTop}>
                {t('two_photos_note')}
              </Text>
            </Card>

            {/*
              Position is a flag, never a refusal. A market address in Kano is a
              district, not a gate, and a driver who cannot close a delivery they
              actually made will stop using the app before the day is out.
            */}
            {away !== null ? (
              <Card overline={t('where_it_was_captured')} icon="pin" emphasis="plain">
                <View style={styles.state}>
                  <Icon
                    name={far ? 'alert' : 'check'}
                    size="md"
                    colour={far ? colours.stopped : colours.moving}
                    beside="body"
                  />
                  <Text variant="body" style={styles.flex}>
                    {far
                      ? `${Math.round(away / 100) / 10} ${t('km_from_the_destination')}`
                      : `${t('at_the_destination')} ${destination?.name ?? t('the_destination')} — ${Math.round(away)} ${t('metres_out')}`}
                  </Text>
                </View>
              </Card>
            ) : null}

            {delivery.exception !== null ? (
              <Card overline={t('what_went_wrong')} icon="alert">
                <Text variant="title">{t(EXCEPTION_WORDS[delivery.exception.kind])}</Text>
                <Text variant="body" tone="secondary" style={styles.gapTop}>
                  {delivery.exception.note}
                </Text>
                <Text variant="label" tone="secondary" style={styles.gapTop}>
                  {t(
                    settlesDespite(delivery.exception)
                      ? 'still_settles_note'
                      : 'nothing_owed_for_handover',
                  )}
                </Text>
              </Card>
            ) : null}

            <Text variant="overline" tone="secondary" style={styles.heading}>
              {t('the_delivery_note').toUpperCase()}
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
              {/*
                The hand-over, and only once the proof is sealed.

                An unsealed delivery is still editable — a photograph can go,
                a name can be rewritten — so a note handed over from one is not
                proof of anything, and the receiver has no way to tell that
                from the outside. The button is absent rather than disabled,
                and the line in its place says what would bring it back; the
                seal itself is one card up, so there is no dead end here.
              */}
              {sealedAt !== null ? (
                <Press
                  onPress={handOver}
                  accessibilityLabel={t('hand_over_the_note')}
                  style={[styles.handOver, { borderColor: colours.outline }]}
                >
                  <Icon name="document" size="md" colour={colours.textSecondary} />
                  <Text variant="title" style={styles.flex}>
                    {t('hand_over_the_note')}
                  </Text>
                </Press>
              ) : (
                /*
                  Two different sentences, because "sign it off first" is only
                  a forward path where signing off is possible. In the
                  walkthrough it is not — `sealedAt` comes from the server and
                  the seal button is gated on `trip.live` — so the same line
                  would point at a button that is not on the screen and cannot
                  be put there. A dead end reads exactly like an instruction
                  until you try to follow it.
                */
                <Text variant="label" tone="secondary" style={styles.gapTop}>
                  {t(trip.live ? 'hand_over_once_signed_off' : 'walkthrough_signs_nothing_off')}
                </Text>
              )}

              {handOverFailed ? (
                <View style={[styles.state, styles.gapTop]}>
                  <Icon name="alert" size="md" colour={colours.stopped} beside="body" />
                  <Text variant="body" style={styles.flex}>
                    {t('could_not_hand_it_over')}
                  </Text>
                </View>
              ) : null}

              <Text variant="label" tone="secondary" style={styles.gapTop}>
                {t('one_version_note')}
              </Text>
            </Card>

            {/*
              The review is offered here rather than as a notification a week
              later, because this is the moment somebody has an opinion and the
              document they are forming it about is on the screen.
            */}
            {onReview !== undefined && sealed.ok ? (
              <Press
                onPress={onReview}
                accessibilityLabel={t('say_how_the_carrier_did')}
                style={[styles.review, { borderColor: colours.outline }]}
              >
                <Icon name="pen" size="md" colour={colours.textSecondary} />
                <Text variant="title" style={styles.flex}>
                  {t('how_did_they_do')}
                </Text>
                <Icon name="chevron-right" size="md" colour={colours.outline} />
              </Press>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  state: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
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
  seal: {
    minHeight: target.driver,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineLabel: { width: 110 },
  // Driver-face target: this is pressed at a gate, one-handed, in sunlight.
  handOver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: target.driver,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginTop: space.md,
  },
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: target.standard,
    paddingHorizontal: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  lineValue: { flex: 1 },
});

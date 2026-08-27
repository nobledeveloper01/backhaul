import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_SEVERITY,
  needsPhoto,
  raisesDispute,
  type IncidentKind,
  type Severity,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target, type } from '../design/tokens';
import { useColours } from '../design/theme';
import type { DemoTrip } from '../state/demo';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { newId } from '../state/ids';
import { INCIDENT_WORDS } from '../state/words';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/**
 * The six, with a label short enough for a tile.
 *
 * `describeKind` writes the status line — "Problem with the load" — which is
 * right above a trip and two lines long in a box the width of a thumb, leaving
 * one tile in each row taller than its neighbour. The tile gets its own word.
 */
const KINDS: readonly {
  readonly kind: IncidentKind;
  readonly icon: IconName;
  readonly label: string;
}[] = [
  { kind: 'breakdown', icon: 'truck', label: 'Broken down' },
  { kind: 'detained', icon: 'clock', label: 'Held up' },
  { kind: 'road', icon: 'route', label: 'Road blocked' },
  { kind: 'accident', icon: 'alert', label: 'Accident' },
  { kind: 'cargo', icon: 'package', label: 'The load' },
  { kind: 'security', icon: 'shield', label: 'Security' },
];

/**
 * Reporting from the roadside.
 *
 * Written for somebody standing next to a broken truck on the Kaduna road, so
 * the whole thing is **one tap to file**: the kind carries a default severity,
 * the position comes from the tracker, and everything else is optional. A form
 * that demands a classification and a description before it will accept a
 * report is a form that produces no reports.
 *
 * Six targets at driver size, because this is the one shipper-side screen a
 * driver also uses.
 */
export function IncidentScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const { api } = useSession();

  const [kind, setKind] = useState<IncidentKind | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState(0);
  const [filed, setFiled] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  /*
    Filed only once the server has it.

    Showing "Reported" the moment the button is pressed is the version a driver
    trusts and should not: they walk away from a broken truck believing
    somebody knows, and nobody does. The screen waits, says so while it waits,
    and says so if it fails — with the text still in the box.
  */
  const file = () => {
    if (kind === null || sending) return;

    // The last fix the tracker has, if it has one. A report with no position
    // is still a report — the driver does not have to type where they are.
    const fix = trip.track.kept.at(-1);

    if (!trip.live) {
      setFiled(true);
      return;
    }

    setSending(true);
    setFailed(false);

    void api
      .reportIncident(trip.id, {
        kind,
        at: new Date(),
        note,
        reportedBy: 'driver',
        photoIds: Array.from({ length: photos }, () => newId()),
        ...(fix === undefined ? {} : { lat: fix.lat, lon: fix.lon }),
      })
      .then((result) => {
        setSending(false);
        if (result.ok) setFiled(true);
        else setFailed(true);
      });
  };

  const severity: Severity | null = kind === null ? null : DEFAULT_SEVERITY[kind];
  const wantsPhoto = kind !== null && needsPhoto(kind);
  const short = wantsPhoto && photos === 0;

  const last = trip.track.kept.at(-1);

  if (filed && kind !== null) {
    return (
      <View style={[styles.screen, { backgroundColor: colours.surface }]}>
        <ScreenHeader title="Reported" onBack={onBack} />
        <View style={styles.done}>
          <View style={[styles.tick, { backgroundColor: colours.movingWash }]}>
            <Icon name="check" size="lg" colour={colours.moving} />
          </View>
          <Text variant="headline" style={styles.centred}>
            {t(INCIDENT_WORDS[kind])}{' '}
            reported
          </Text>
          <Text variant="bodyDriver" tone="secondary" style={styles.centred}>
            {raisesDispute(kind)
              ? 'The shipper and the carrier have been told, and the trip is now under dispute.'
              : 'The shipper and the carrier have been told. Keep driving when you can.'}
          </Text>

          {/*
            A way out at driver size. The header's ‹ Back is a 44 pt target in
            the top corner of a phone in a cradle — reachable, but not with one
            thumb at a roadside.
          */}
          <Press
            onPress={onBack}
            accessibilityLabel={t('back_to_the_trip')}
            style={[styles.send, styles.wide, { backgroundColor: colours.accent }]}
          >
            <Text variant="title" style={{ color: colours.onAccent }}>
              {t('back_to_trip')}
            </Text>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      // Without this the note field and the send button sit under the
      // keyboard, on the one screen where the thing being typed is the point.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={t('what_happened')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.grid}>
          {KINDS.map((option) => (
            <Press
              key={option.kind}
              onPress={() => setKind(option.kind)}
              accessibilityLabel={t(INCIDENT_WORDS[option.kind])}
              style={[
                styles.tile,
                {
                  backgroundColor: kind === option.kind ? colours.accentWash : colours.surfaceDim,
                  borderColor: kind === option.kind ? colours.accent : colours.outline,
                },
              ]}
            >
              <Icon
                name={option.icon}
                size="lg"
                colour={kind === option.kind ? colours.accent : colours.textSecondary}
              />
              <Text
                variant="bodyDriver"
                numberOfLines={2}
                style={{ color: kind === option.kind ? colours.accent : colours.textPrimary }}
              >
                {option.label}
              </Text>
            </Press>
          ))}
        </View>

        {kind !== null ? (
          <>
            <Card overline={t('what_this_does')} icon="flag" emphasis="plain">
              {/*
                Severity and dispute are two different answers, and the first
                version only said the first — so a cargo report, which puts the
                trip under dispute, read as "nothing else changes".
              */}
              <Text variant="body">
                {severity === 'blocking'
                  ? 'The arrival estimate stops showing until this clears — an estimate beside a stopped truck is a contradiction.'
                  : severity === 'delaying'
                    ? 'The arrival estimate stays, and the delay is on the trip for everyone to see.'
                    : 'Recorded against the trip, where everyone on it can see it.'}
              </Text>
              {raisesDispute(kind) ? (
                <Text variant="body" tone="stopped" style={styles.gapTop}>
                  {t('puts_under_dispute')}
                </Text>
              ) : null}
              {last !== undefined ? (
                <Text variant="label" tone="secondary" style={styles.gapTop}>
                  ±{Math.round(last.accuracy)} m — {t('no_need_to_type_where')}
                </Text>
              ) : null}
            </Card>

            <Card overline={t('anything_to_add')} icon="message">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={colours.textSecondary}
                accessibilityLabel="Add a note"
                multiline
                style={[
                  styles.note,
                  {
                    color: colours.textPrimary,
                    backgroundColor: colours.surfaceDim,
                    borderColor: colours.outline,
                    fontFamily: type.bodyDriver.fontFamily,
                    fontSize: type.bodyDriver.fontSize,
                  },
                ]}
              />

              {/*
                A photograph is asked for on cargo and accident reports and
                never on a security one. Nobody photographs a hijack, and
                demanding it would mean the report that matters most is the one
                that cannot be filed.
              */}
              {wantsPhoto ? (
                <Press
                  onPress={() => setPhotos((was) => was + 1)}
                  accessibilityLabel="Add a photograph"
                  style={[
                    styles.photo,
                    { borderColor: short ? colours.stopped : colours.outline },
                  ]}
                >
                  <Icon
                    name="camera"
                    size="md"
                    colour={short ? colours.stopped : colours.textSecondary}
                  />
                  <Text variant="bodyDriver" tone={short ? 'stopped' : 'secondary'}>
                    {photos === 0
                      ? 'Add a photo — this one needs it'
                      : `${photos} photo${photos === 1 ? '' : 's'} added`}
                  </Text>
                </Press>
              ) : null}
            </Card>

            {failed ? (
              <Text variant="label" tone="exception">
                {t('report_not_sent')}
              </Text>
            ) : null}

            <Press
              onPress={file}
              disabled={short || sending}
              accessibilityLabel={t('send_the_report')}
              style={[styles.send, { backgroundColor: colours.accent }]}
            >
              <Text variant="title" style={{ color: colours.onAccent }}>
                {sending ? t('sending_the_report') : t('send_the_report')}
              </Text>
            </Press>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    // Two across at every text size. Three across put "Problem with the load"
    // onto four lines in a box the width of a thumb.
    width: '48%',
    minHeight: target.driver + space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.md,
  },
  gapTop: { marginTop: space.sm },
  note: {
    minHeight: target.driver,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: space.md,
    textAlignVertical: 'top',
  },
  photo: {
    marginTop: space.md,
    minHeight: target.driver,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
  },
  send: {
    minHeight: target.driver,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  tick: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: { textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
});

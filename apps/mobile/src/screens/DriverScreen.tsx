import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HOLD_MS,
  INTERVAL,
  allowedFrom,
  decide,
  UPLOAD_EVERY_MS,
  dailyCost,
  describeLanguage,
  estimateCost,
  isSystemRaised,
  say,
  shouldTrack,
  transition,
  usage,
  visibleConfirmation,
  type TripEvent,
  type TripState,
  describeBytes,
  monthlyCost,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Press } from '../components/Press';
import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours, useElevation } from '../design/theme';
import { demoNow, demoTrips } from '../state/demo';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import { useTracking } from '../state/tracking';
import { openSettings } from '../native/permissions';
import { map } from '../api/client';
import type { Words } from '../components/PositionAge';

/**
 * The driver's whole app.
 *
 * **Driver screen time is the enemy.** The driver did not choose this app, is
 * paid whether or not they use it, and is reading it in a moving cab. So there
 * is one screen, one action, and nothing to browse.
 *
 * Everything else on it answers the two questions a driver actually has about
 * tracking software: *is it costing me my battery*, and *what is it telling
 * people about me*. Both plainly, because a driver who cannot see why their
 * phone is doing something assumes the worst and force-quits — and a
 * force-quit trip is a trip with no evidence.
 */
interface Props {
  readonly online: boolean;
  readonly onToggleConnection: () => void;
  readonly onOpenHistory: () => void;
  readonly onReport: () => void;
  readonly onDeliver: () => void;
  readonly onLevies: () => void;
  readonly onLanguage: () => void;
}

export function DriverScreen({
  online,
  onToggleConnection,
  onOpenHistory,
  onReport,
  onDeliver,
  onLevies,
  onLanguage,
}: Props) {
  const colours = useColours();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  const { api } = useSession();

  /*
    The driver's own trip, from the server.

    A driver has at most one trip in front of them, and it is the newest one
    they are on. Two would be a scheduling question this screen does not ask.
  */
  const { query: mine, refresh } = useMine(() => api.trips(), [api]);

  const live = mine.state === 'ready' ? (mine.value[0] ?? null) : null;
  const walkthrough = useMemo(() => demoTrips(now)[0], [now]);

  const { query: detail } = useMine<readonly TripEvent[] | null>(
    async () =>
      live === null
        ? { ok: true, value: null }
        : map(await api.trip(live.id), (view) => view.history),
    [api, live],
  );

  /*
    The server's history when there is one; the walkthrough's when there is
    not. Never a mix — a state machine fed half of each would offer a driver an
    action their trip cannot take.
  */
  const history: readonly TripEvent[] =
    detail.state === 'ready' && detail.value !== null
      ? detail.value
      : (walkthrough?.history ?? []);

  const [refusal, setRefusal] = useState<string | null>(null);

  /*
    The driver face is the one surface whose reader had no say in what they are
    using — a shipper chose this app, a driver was handed a phone. Hausa is the
    working language of the corridors it is built around.

    Shared through a provider rather than held here: a choice that applies to
    one screen is the app agreeing to speak somebody's language and then not
    doing it. A picker rather than the device locale, because a phone bought
    second-hand carries the last owner's.
  */
  const { language, t } = useLanguage();

  /*
    In the product this queues a duress signal and switches the tracker to the
    thirty-second follow cadence regardless of battery policy. Here there is no
    transport — and, more to the point, there is nothing to render either way.
    `visibleConfirmation()` returns null, and this function holding its result
    is what keeps that true when somebody later makes this screen friendlier.
  */
  const raiseAlarm = () => {
    const shown = visibleConfirmation();
    if (shown !== null) throw new Error('A duress alarm must show nothing.');
  };

  /*
    The trip in front of the driver: the server's when there is one, the
    walkthrough's otherwise. Named `trip` rather than `base` because it is no
    longer a base for anything — it is the trip.
  */
  const trip = live ?? walkthrough;

  /*
    The corridor as two names, picked apart here rather than downstream.

    `TripSummaryView.origin` is a place name and `DemoTrip.origin` is a
    coordinate — the same field spelled two ways in two types that this screen
    is now handed either of. Reading it once, by name, is the difference
    between one line and a type error in four places.
  */
  const corridor = live === null
    ? { from: walkthrough?.originName ?? '', to: walkthrough?.destinationName ?? '' }
    : { from: live.origin, to: live.destination };

  /*
    Cargo and plate, joined only across the ones that are there. A trailer with
    no plate recorded rendered a bare "·" once, which reads as a fault rather
    than as an absence.
  */
  const cargoLine =
    live !== null
      ? null
      : ([walkthrough?.cargo, walkthrough?.plate]
          .filter((part): part is string => part !== undefined && part.trim().length > 0)
          .join(' · ') || null);

  const kept = walkthrough?.track.kept.length ?? 0;
  const dataUsed = usage(kept, Math.max(1, Math.round(kept / 10)));
  const dataCost = estimateCost(dataUsed);

  // The trip figure is too small to be legible — twenty-odd kilobytes reads as
  // nothing at all. The month is the number that answers the question.
  const dailyData = dailyCost({ interval: INTERVAL.moving, uploadEveryMs: UPLOAD_EVERY_MS });

  if (trip === undefined) {
    return null;
  }

  const state = history[history.length - 1]?.state ?? 'open';
  const tracking = shouldTrack(state);

  /*
    The loop itself, not a picture of it.

    This screen used to render `decide({ speed: 18, battery: 0.42, queued: 18 })`
    — the real policy fed three constants — under a card that says "we are
    recording your trip". `Tracker` was written and tested and nothing ever
    called `start()`, so the sentence was true of nothing.

    The walkthrough keeps the constants, because there is no trip to record and
    a demonstration of the cadence ladder is the honest thing to show a
    reviewer. A live trip gets the loop.
  */
  const loop = useTracking(api, live?.id ?? null, tracking, online);

  const plan =
    loop.report === null
      ? decide({ speed: tracking ? 18 : 0, battery: 0.42, online, queued: 0 }, now)
      : { sampleIn: loop.report.sampleIn, because: loop.report.because };

  // Three exclusions, each for its own reason. `signal_lost` and `stalled` are
  // observations the tracker raises — asking a driver to tap "signal lost" is
  // asking them to self-report the thing the tracking exists to detect.
  // `disputed` and `cancelled` are consequential and belong behind a
  // confirmation, not beside "I've arrived" at 64 dp in a moving cab.
  const next = allowedFrom(state).filter(
    (candidate) =>
      !isSystemRaised(candidate) && candidate !== 'disputed' && candidate !== 'cancelled',
  );

  /*
    Checked here, recorded there.

    The local `transition` runs first so a driver at a loading bay with no
    signal is told immediately that the button they pressed is not one their
    trip can take — the server would say the same thing, in the same words,
    two seconds later. What it must not do is *record* it: a history that
    exists only on a phone is a history that ends with the phone.
  */
  function move(to: TripState) {
    const result = transition(history, to, new Date(), 'driver');
    if (!result.ok) {
      setRefusal(result.detail);
      return;
    }

    setRefusal(null);

    if (live === null) return;

    void api.recordEvent(live.id, to, result.event.at, 'driver').then((sent) => {
      if (sent.ok) refresh();
      else if (sent.failure.kind === 'refused') setRefusal(sent.failure.detail);
    });
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      {/*
        The duress alarm lives on the corridor, which is the one line this
        screen always has.

        A long press on something already there, rather than a second copy of
        the same words added below it — which is what the first version did,
        and which put "28 t cement · LSR-482-XA" on the screen twice. The
        second version moved the press onto a cargo row and then rendered the
        corridor into it, which put the *corridor* on the screen twice instead.

        Nothing happens visibly. `visibleConfirmation()` returns null and
        `raiseAlarm` holds it to that: whoever is standing over the driver must
        not be able to tell.
      */}
      <Pressable
        onLongPress={raiseAlarm}
        delayLongPress={HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={`${corridor.from} → ${corridor.to}`}
        style={styles.route}
      >
        <Text variant="overline" tone="secondary">
          {t('your_trip').toUpperCase()}
        </Text>
        {/*
          Labelled when it is not theirs.

          This screen says YOUR TRIP above whatever it is showing, and before
          a driver's first trip exists that was the walkthrough's — a
          demonstration a person cannot tell from their own trip is worse than
          no demonstration, and this one had the words "your trip" over it.
        */}
        {live === null ? (
          <Text variant="label" tone="stale">
            {/*
              Which kind of "no trip", because there are two and they are not
              the same admission. "The server has none for you" is a fact about
              the server; a phone that never reached it has learned nothing
              about what is or is not there, and saying so anyway is the app
              vouching for a read it did not make.
            */}
            {t(mine.state === 'ready' ? 'showing_the_walkthrough' : 'walkthrough_unreached')}
          </Text>
        ) : null}
        <Text variant="headline">
          {corridor.from} → {corridor.to}
        </Text>
        {/*
          What is on the trailer, when the trip says. A server trip summary
          does not carry cargo or a plate — the walkthrough does — and a row
          that falls back to the corridor is the corridor twice. Rendered only
          when there is something in it that is not already above it.
        */}
        {cargoLine === null ? null : (
          <View style={styles.metaRow}>
            <Icon name="package" size="sm" colour={colours.textSecondary} beside="bodyDriver" />
            <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
              {cargoLine}
            </Text>
          </View>
        )}
      </Pressable>

      {/*
        The consent block. Big, first, and it says who can see the driver —
        because "tracking is consented, visible and bounded" is a product rule
        before it is a battery optimisation.
      */}
      <View
        style={[
          styles.consent,
          elevation.raised,
          {
            backgroundColor: tracking ? colours.movingWash : colours.surfaceDim,
            borderColor: tracking ? colours.moving : colours.outline,
          },
        ]}
      >
        <View style={styles.consentHead}>
          <Icon
            name={tracking ? 'signal' : 'signal-off'}
            size="lg"
            colour={tracking ? colours.moving : colours.textSecondary}
            beside="title"
          />
          <Text variant="title" tone={tracking ? 'moving' : 'secondary'} style={styles.flex}>
            {say(language, tracking ? 'tracking_on' : 'tracking_off')}
          </Text>
        </View>
        <Text variant="bodyDriver" tone="secondary">
          {/*
            Three different situations, and they were one message until the
            screen was walked through: a trip that has not begun, one that has
            arrived, and one that is over. "Recording starts when you begin
            loading" is true of the first and nonsense on the other two.
          */}
          {/*
            The carrier's name is dropped in Hausa rather than interpolated
            into a translated sentence: word order differs between these two
            languages and a template with a hole in it assumes it does not.
            `language.ts` has no interpolation for exactly that reason.
          */}
          {tracking
            ? language === 'en'
              ? say(language, 'shared_until_trip_ends')
              : say(language, 'shared_until_trip_ends')
            : state === 'open' || state === 'assigned'
              ? say(language, 'nothing_shared_yet')
              : say(language, 'recording_stopped')}
        </Text>
      </View>

      {/*
        A way to see the offline state without waiting for a dead zone. In the
        product this is the OS telling us; here it is a control, because an
        offline state nobody can reach is an offline state nobody authored.
      */}
      <Press
        onPress={onToggleConnection}
        accessibilityLabel={t(online ? 'simulate_losing_signal' : 'simulate_regaining_signal')}
        feedback="opacity"
        style={[styles.link, { borderColor: colours.outline }]}
      >
        <Icon name={online ? 'signal' : 'signal-off'} size="sm" colour={colours.textSecondary} />
        <Text variant="label" tone="secondary" style={styles.flex}>
          {online
            ? `${say(language, 'signal_good')}${language === 'en' ? ' — tap to simulate losing it' : ''}`
            : `${say(language, 'no_signal')}${language === 'en' ? ' — tap to restore signal' : ''}`}
        </Text>
      </Press>

      {/*
        What is stopping the recording, above everything about it.

        A driver whose location is switched off must be told that their trip is
        not being recorded. The failure this whole subsystem exists to prevent
        is a stretch of road nobody can account for, and its worst form is the
        one nobody knew was happening — so this is a card with a way forward on
        it, not a line of grey text.
      */}
      {loop.blocker !== null ? (
        <Card overline={t('tracking_off')} icon="alert" emphasis="accent">
          <Text variant="bodyDriver">{t(loop.blocker)}</Text>
          <Press
            onPress={() => {
              if (loop.blocker === 'location_blocked') void openSettings();
              else loop.recheck();
            }}
            accessibilityLabel={t(
              loop.blocker === 'location_blocked' ? 'open_settings' : 'allow_location',
            )}
            style={[styles.blockerAction, { backgroundColor: colours.accent }]}
          >
            <Text variant="title" style={{ color: colours.onAccent }}>
              {t(loop.blocker === 'location_blocked' ? 'open_settings' : 'allow_location')}
            </Text>
          </Press>
        </Card>
      ) : null}

      {/*
        The OS throttling the service, said out loud rather than logged. On a
        Transsion handset this is the difference between a trip that records
        and one that quietly does not, and the app's own log is the last place
        anybody looks. See ADR-0002.
      */}
      {loop.restricted ? (
        <Card overline={t('tracking_off')} icon="alert" emphasis="accent">
          <Text variant="bodyDriver">{t('phone_is_holding_back')}</Text>
          {/*
            A way out, because there is one. On iOS this state covers both a
            revoked location authorisation — which records nothing — and Low
            Power Mode, which throttles it; the native side reports them as one
            because they mean the same thing to a driver, and Settings is where
            both are fixed. The sentence says the stronger of the two truths.
          */}
          <Press
            onPress={() => void openSettings()}
            accessibilityLabel={t('open_settings')}
            style={[styles.blockerAction, { backgroundColor: colours.accent }]}
          >
            <Text variant="title" style={{ color: colours.onAccent }}>
              {t('open_settings')}
            </Text>
          </Press>
        </Card>
      ) : null}

      {tracking ? (
        <Card overline={t('battery')} icon="battery">
          {/*
            Two fixed sentences rather than one with the interval poured into
            it. The cadence ladder has four rungs and Hausa does not put the
            number where English does; a template would have produced a
            sentence no Hausa speaker would say.
          */}
          <Text variant="bodyDriver">
            {language === 'en'
              ? `Checking your position ${cadence(plan.sampleIn)} — ${plan.because}.`
              : say(
                  language,
                  plan.sampleIn <= INTERVAL.moving ? 'checking_moving' : 'checking_stopped',
                )}
          </Text>
          {plan.sampleIn >= INTERVAL.conserving ? (
            <Text variant="bodyDriver" tone="stopped" style={styles.gap}>
              {t('battery_low_note')}
            </Text>
          ) : null}
          {/*
            What is still on the phone, waiting for a signal. The count first,
            then the phrase — and nothing at all when there is nothing waiting,
            because "0 waiting to send" is a sentence about a problem the
            driver does not have.
          */}
          {loop.report !== null && loop.report.queued > 0 ? (
            <Text variant="bodyDriver" tone="stale" style={styles.gap}>
              {loop.report.queued} {t('waiting_to_send')}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {refusal !== null ? (
        <View style={[styles.refusal, { backgroundColor: colours.exceptionWash, borderColor: colours.exception }]}>
          <Icon name="alert" size="md" colour={colours.exception} />
          <Text variant="bodyDriver" tone="exception" style={styles.flex}>
            {refusal}
          </Text>
        </View>
      ) : null}

      {/*
        Two things a driver does that are not a state change: say something
        went wrong, and hand the goods over. Both at driver size, side by side,
        above the state buttons — a driver at a roadside should not scroll past
        four cards to report a breakdown.
      */}
      {/*
        What the tracking costs in data.
        
        The premise was that drivers force-quit trackers because they eat data,
        so the app should warn about it. The arithmetic says a day of recording
        is about fifteen kobo — so this is not a warning, it is the answer to
        the fear, and it sits beside the battery line for the same reason.
      */}
      {/*
        One place to change this, not two.
        
        This was four chips inline — fine at two languages and a row that wraps
        to three lines at four. It is now a link to the same screen the app
        opens with, which also means somebody who picked wrongly at launch
        finds it where they would look for it.
      */}
      <Press
        onPress={onLanguage}
        accessibilityLabel={describeLanguage(language)}
        feedback="opacity"
        style={[styles.link, { borderColor: colours.outline }]}
      >
        <Icon name="message" size="sm" colour={colours.textSecondary} />
        <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
          {describeLanguage(language)}
        </Text>
        <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
      </Press>

      <View style={styles.dataRow}>
        <Icon name="signal" size="sm" colour={colours.textSecondary} beside="body" />
        <Text variant="body" tone="secondary" style={styles.flex}>
          {describeBytes(dataUsed.bytes)} {t('of_data_so_far')} —{' '}
          {dataCost / 100 < 1 ? t('under_one_naira') : `₦${Math.round(dataCost / 100)}`}{' '}
          {t('of_your_airtime')} {monthlyCost(dailyData.cost) / 100 < 1
            ? t('under_one_naira')
            : `₦${Math.round(monthlyCost(dailyData.cost) / 100)}`}{' '}
          {t('about_a_month_at_this_rate')}
        </Text>
      </View>

      <Press
        onPress={onLevies}
        accessibilityLabel={say(language, 'money_on_the_road')}
        feedback="opacity"
        style={[styles.link, { borderColor: colours.outline }]}
      >
        <Icon name="naira" size="sm" colour={colours.textSecondary} />
        <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
          {say(language, 'money_on_the_road')}
        </Text>
        <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
      </Press>

      <View style={styles.pair}>
        <Press
          onPress={onReport}
          accessibilityLabel={t('report_problem')}
          feedback="opacity"
          style={[styles.half, { borderColor: colours.outline }]}
        >
          <Icon name="flag" size="lg" colour={colours.textSecondary} />
          {/*
            Two lines. Hausa's "Ba da rahoton matsala" is longer than "Report",
            and at one line it came out as "Ba da rahoton m…" — a button that no
            longer said what it did.
          */}
          <Text variant="bodyDriver" tone="secondary" numberOfLines={2} style={styles.centred}>
            {say(language, 'report_problem')}
          </Text>
        </Press>

        <Press
          onPress={onDeliver}
          accessibilityLabel={t('hand_over_and_sign')}
          feedback="opacity"
          style={[styles.half, { borderColor: colours.outline }]}
        >
          <Icon name="camera" size="lg" colour={colours.textSecondary} />
          <Text variant="bodyDriver" tone="secondary" numberOfLines={2} style={styles.centred}>
            {say(language, 'hand_over')}
          </Text>
        </Press>
      </View>

      <Press
        onPress={onOpenHistory}
        accessibilityLabel={t('past_trips_and_earnings')}
        feedback="opacity"
        style={[styles.link, { borderColor: colours.outline }]}
      >
        <Icon name="naira" size="sm" colour={colours.textSecondary} />
        <Text variant="bodyDriver" tone="secondary" style={styles.flex}>
          {say(language, 'your_trips')}
        </Text>
        <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
      </Press>

      {next.length > 0 ? (
        <View style={styles.actions}>
          {next.map((candidate) => (
            <Pressable
              key={candidate}
              onPress={() => move(candidate)}
              accessibilityRole="button"
              accessibilityLabel={actionLabel(candidate, t)}
              style={({ pressed }) => [
                styles.action,
                elevation.lifted,
                { backgroundColor: colours.accent, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text variant="title" style={{ color: colours.onAccent }}>
                {actionLabel(candidate, t)}
              </Text>
              <Icon name="chevron-right" size="md" colour={colours.onAccent} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Card overline={t('finished')} icon="check">
          <Text variant="title">{t('this_trip_is_done')}</Text>
          <Text variant="bodyDriver" tone="secondary" style={styles.gap}>
            {t('nothing_more_to_do')}
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

/**
 * How often, in words rather than a number and a unit.
 *
 * "every 1 minutes" is what the arithmetic produces and it is not a sentence.
 */
// untranslated-check: this function is English on purpose. It is only reached
// from the `language === 'en'` branch above, where the reader gets the engine's
// own reason with the interval poured into it; the other three languages get
// two fixed sentences, because the cadence ladder has four rungs and Hausa
// does not put the number where English does.
function cadence(seconds: number): string {
  if (seconds < 60) {
    return `every ${seconds} seconds`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
}

/**
 * What the button does, in the driver's words rather than the machine's.
 *
 * The state machine's vocabulary is for the record; a driver at a loading bay
 * is pressing "I've started loading", not "transition to loading".
 */
function actionLabel(state: TripState, t: Words): string {
  switch (state) {
    case 'loading':
      return t('i_have_loaded');
    case 'in_transit':
      return t('im_on_the_road');
    case 'arrived':
      return t('i_have_arrived');
    case 'delivered':
      return t('delivered_word');
    case 'assigned':
      return t('accept_this_trip');
    case 'signal_lost':
    case 'stalled':
    case 'open':
    case 'disputed':
    case 'cancelled':
      return state.replace(/_/g, ' ');
  }
}

const styles = StyleSheet.create({
  dataRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  centred: { textAlign: 'center' },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  pair: { flexDirection: 'row', gap: space.md },
  half: {
    flex: 1,
    minHeight: target.driver + space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.md,
  },
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  flex: { flex: 1 },
  gap: { marginTop: space.sm },
  blockerAction: {
    minHeight: target.driver,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  route: { gap: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.xs },
  consent: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    gap: space.sm,
  },
  consentHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  refusal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: target.standard,
  },
  actions: { gap: space.md },
  action: {
    minHeight: target.driver,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
});

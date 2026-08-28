import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import {
  format,
  tierOf,
  utilisation,
  worthOfOneReturnLeg,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Empty } from '../components/Empty';
import { Unready } from '../components/Unready';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import type { AlertView } from '@backhaul/api';
import { demoLegs } from '../state/fleet';
import { TIER_WORDS } from '../state/words';
import { agoLabel } from '../components/PositionAge';

interface Props {
  readonly onOpenBids: () => void;
  readonly onOpenVerification: () => void;
  readonly onOpenVehicles: () => void;
  readonly onOpenAlerts: () => void;
}

/**
 * The fleet owner's screen: what needs them, and how well the trucks are used.
 *
 * Utilisation first, because it is the number the product exists to move. An
 * extra loaded return leg per truck per month is a material change to a small
 * fleet's income, and this is where that claim becomes a figure they can check
 * against their own trucks.
 */
export function FleetScreen({
  onOpenBids,
  onOpenVerification,
  onOpenVehicles,
  onOpenAlerts,
}: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);
  const { t } = useLanguage();

  const { api } = useSession();

  const legs = useMemo(demoLegs, []);
  const used = useMemo(() => utilisation(legs), [legs]);

  /*
    The hour is the reader's, not the server's.

    A shipper in Lagos and a driver in Kano share a timezone today, and
    assuming that inside the server is how it breaks the first time somebody
    ships from Accra — so the server takes the hour as a parameter and this
    screen is the thing that knows it.
  */
  const { query: alertQuery, refresh: refreshAlerts } = useMine(
    () => api.alerts(now.getHours()),
    [api, now],
  );

  const alerts = alertQuery.state === 'ready' ? alertQuery.value.alerts : [];

  /*
    The verification summary, from the server rather than from a sentence
    somebody typed.

    This line used to read "One document short of Trusted · a licence expires
    in 18 days", hard-coded, on every fleet in every language — while the
    screen it opens read the real thing off the API. That is the defect the
    comment on the trucks row below already warns about: a summary that
    disagrees with the thing it summarises is worse than no summary. It had
    been sitting one card above the warning.

    Nothing is rendered until the answer arrives. A tier is a claim about
    somebody's standing and there is no honest placeholder for it.
  */
  const { query: verificationQuery } = useMine(() => api.verification(), [api]);

  const standing =
    verificationQuery.state === 'ready'
      ? (() => {
          const held = verificationQuery.value;
          const documents = {
            identity: held.hasIdentity,
            licence: held.hasLicence,
            registration: held.hasRegistration,
            insurance: held.hasInsurance,
          };
          const record = {
            tripsCompleted: held.tripsCompleted,
            tripsPromised: held.tripsPromised,
            tripsOnTime: held.tripsOnTime,
            incidents: held.incidents,
          };
          return { tier: tierOf(documents, record) };
        })()
      : null;

  const { query: fleetQuery } = useMine(() => api.vehicles(), [api]);
  const trucks = fleetQuery.state === 'ready' ? fleetQuery.value : [];
  const grounded = trucks.filter((truck) => !truck.mayCarry).length;

  const averageLeg =
    legs.reduce((total, leg) => total + leg.metres, 0) / Math.max(1, legs.length);
  const worth = worthOfOneReturnLeg(used, averageLeg);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      <Text variant="headline">{t('your_fleet')}</Text>

      {/*
        The one figure this screen exists for, and it is still the
        walkthrough's.

        `utilisation.ts` has no route. Serving it needs a decision this screen
        cannot make: a loaded leg is a trip and the server can measure it from
        the cleaned track, but the *empty* running is the gap between two
        trips, where tracking is off and there is nothing to measure — so the
        only figure available for it is an estimate, and rule 7 says an
        estimate is never presented as a measurement. See ADR-0012.

        Until that is settled the number is the demonstration's, and it says
        so. A carrier reading an invented utilisation as their own would act
        on it — that is what the figure is for.
      */}
      <Card overline={t('utilisation')} icon="truck" emphasis="accent">
        <Text variant="label" tone="stale" style={styles.walkthrough}>
          {t('walkthrough_figures')}
        </Text>
        <Text variant="display">{Math.round(used.ratio * 100)}%</Text>
        <Text variant="body" tone="secondary" style={styles.gap}>
          {format(used.perKmDriven)} {t('a_kilometre_driven')} · {used.legs} {t('legs_this_month')}
        </Text>

        <UtilisationBar
          loaded={used.loadedMetres}
          empty={used.emptyMetres}
        />

        <View style={styles.split}>
          <Figure
            icon="package"
            label={t('km_loaded')}
            value={`${Math.round(used.loadedMetres / 1000)} km`}
            tone="moving"
          />
          <Figure
            icon="route"
            label={t('km_empty')}
            value={`${Math.round(used.emptyMetres / 1000)} km`}
            tone="stopped"
          />
        </View>
      </Card>

      {worth !== null ? (
        <Card overline={t('one_more_return_leg')} icon="swap">
          <Text variant="display">{format(worth)}</Text>
          <Text variant="body" tone="secondary" style={styles.gap}>
            {t('return_leg_note')} {used.legs}
          </Text>
          <Press
            onPress={onOpenBids}
            accessibilityLabel={t('see_bids')}
            style={[styles.action, { backgroundColor: colours.accent }]}
          >
            <Text variant="title" style={{ color: colours.onAccent }}>
              {t('see_who_is_bidding')}
            </Text>
          </Press>
        </Card>
      ) : null}

      {/*
        Verification sits with the fleet rather than in a settings screen. It is
        not account admin — it is the thing that decides which loads this
        carrier is allowed to bid on, and a tier expiring is a truck that stops
        earning.
      */}
      <Press
        onPress={onOpenVerification}
        accessibilityLabel={t('verification')}
        accessibilityHint={t('verification_hint')}
        feedback="opacity"
        style={[
          styles.verify,
          { backgroundColor: colours.surfaceRaised, borderColor: colours.outline },
        ]}
      >
        <Icon name="shield" size="md" colour={colours.textSecondary} />
        <View style={styles.verifyBody}>
          <Text variant="title">{t('verification')}</Text>
          {/*
            The tier, and only the tier.

            The first version put the count of what is missing beside it —
            "Unverified · 2 To reach Verified" — which reads as three separate
            thoughts in English and worse in the other three, because
            `to_reach` is written as a card heading and carries a capital into
            the middle of the line. This row's job is "where do I stand"; the
            screen it opens is where the rest of it lives.
          */}
          {standing === null ? null : (
            <Text variant="label" tone="secondary">
              {t(TIER_WORDS[standing.tier])}
            </Text>
          )}
        </View>
        <Icon name="chevron-right" size="md" colour={colours.outline} />
      </Press>

      <Press
        onPress={onOpenVehicles}
        accessibilityLabel={t('trucks_and_papers')}
        accessibilityHint={t('vehicles_hint')}
        feedback="opacity"
        style={[
          styles.verify,
          { backgroundColor: colours.surfaceRaised, borderColor: colours.outline },
        ]}
      >
        <Icon name="truck" size="md" colour={colours.textSecondary} />
        <View style={styles.verifyBody}>
          <Text variant="title">{t('trucks_and_papers')}</Text>
          {/*
            Counted, not written. The hard-coded version said "one truck"
            while the screen it opened said two — a summary that disagrees
            with the thing it summarises is worse than no summary.
          */}
          {/*
            Nothing rather than a count, until there is one. `trucks` fell back
            to `[]` on every outcome that was not a value, so a carrier whose
            phone could not reach the server read "0 · trucks can take work" —
            which is not a loading state, it is a fleet that has been grounded.
          */}
          {fleetQuery.state !== 'ready' ? null : (
            <Text variant="label" tone="secondary">
              {grounded === 0
                ? `${trucks.length} · ${t('trucks_can_take_work')}`
                : `${grounded}/${trucks.length} · ${t('cannot_be_given_a_trip')}`}
            </Text>
          )}
        </View>
        <Icon name="chevron-right" size="md" colour={colours.outline} />
      </Press>

      <Press
        onPress={onOpenAlerts}
        accessibilityLabel={t('what_reaches_your_phone')}
        accessibilityHint={t('alerts_hint')}
        feedback="opacity"
        style={[
          styles.verify,
          { backgroundColor: colours.surfaceRaised, borderColor: colours.outline },
        ]}
      >
        <Icon name="signal" size="md" colour={colours.textSecondary} />
        <View style={styles.verifyBody}>
          <Text variant="title">{t('what_reaches_your_phone')}</Text>
          <Text variant="label" tone="secondary">
            {t('one_thing_wakes_you')}
          </Text>
        </View>
        <Icon name="chevron-right" size="md" colour={colours.outline} />
      </Press>

      <Text variant="overline" tone="secondary" style={styles.sectionHead}>
        {t('needs_a_look_head').toUpperCase()}
      </Text>

      {/*
        "Nothing needs you" is a claim, and it was being made about a fleet the
        app could not see. `alerts` fell back to `[]` on every outcome that was
        not a value, so a carrier on a bad stretch of road was told their
        trucks were fine — by an app that had not managed to ask.
      */}
      {alertQuery.state !== 'ready' ? (
        <Card emphasis="plain">
          <Unready query={alertQuery} onRetry={refreshAlerts} />
        </Card>
      ) : alerts.length === 0 ? (
        <Card emphasis="plain">
          <Empty
            icon="check"
            title={t('nothing_needs_you')}
            detail={t('good_morning_note')}
          />
        </Card>
      ) : (
        alerts.map((alert) => (
          // A trip can have two things wrong with it at once, so the key is
          // the pair rather than the trip.
          <AlertRow key={`${alert.tripId}-${alert.kind}`} alert={alert} now={now} />
        ))
      )}
    </ScrollView>
  );
}

/**
 * Loaded against empty, to scale.
 *
 * One bar rather than two numbers: the point is the *proportion*, and a
 * proportion read from two figures is a subtraction the reader has to do.
 */
function UtilisationBar({ loaded, empty }: { loaded: number; empty: number }) {
  const colours = useColours();
  const total = loaded + empty;
  const width = 300;
  const loadedWidth = total === 0 ? 0 : (width * loaded) / total;

  return (
    <View style={styles.bar}>
      <Svg width="100%" height={14} viewBox={`0 0 ${width} 14`}>
        <Rect x={0} y={0} width={width} height={14} rx={7} fill={colours.stoppedWash} />
        <Rect x={0} y={0} width={loadedWidth} height={14} rx={7} fill={colours.moving} />
      </Svg>
    </View>
  );
}

function Figure({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: 'moving' | 'stopped';
}) {
  const colours = useColours();
  return (
    <View style={styles.figure}>
      <View style={styles.figureHead}>
        <Icon name={icon} size="sm" colour={tone === 'moving' ? colours.moving : colours.stopped} />
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      </View>
      <View style={styles.figureValue}>
        <Text variant="title" tabular>
          {value.split(' ')[0]}
        </Text>
        <Text variant="title"> {value.split(' ')[1]}</Text>
      </View>
    </View>
  );
}

function AlertRow({ alert, now }: { alert: AlertView; now: Date }) {
  const colours = useColours();
  const { t } = useLanguage();

  // Silence is grey. A coverage gap is a fact about Nigerian network
  // infrastructure, not the driver's fault, and colouring it as an alarm
  // trains a fleet owner to distrust drivers for something nobody controls.
  const [icon, colour, wash]: [IconName, string, string] =
    alert.kind === 'signal_lost'
      ? ['signal-off', colours.stale, colours.staleWash]
      : alert.kind === 'duress'
        ? ['alert', colours.exception, colours.exceptionWash]
        : alert.kind === 'stalled' || alert.kind === 'incident'
          ? ['alert', colours.exception, colours.exceptionWash]
          : ['clock', colours.stopped, colours.stoppedWash];

  return (
    <View style={[styles.alert, { backgroundColor: wash, borderColor: colour }]}>
      <View style={styles.alertIcon}>
        <Icon name={icon} size="md" colour={colour} />
      </View>
      <View style={styles.flex}>
        <Text variant="title">{alert.corridor}</Text>
        <Text variant="body" tone="secondary" style={styles.gap}>
          {alert.describe}
        </Text>
        <Text variant="label" tone="secondary" style={styles.gap}>
          {agoLabel(now.getTime() - alert.at.getTime(), t)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  verify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  verifyBody: { flex: 1, gap: 2 },
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.md },
  flex: { flex: 1 },
  gap: { marginTop: space.xs },
  walkthrough: { marginBottom: space.xs },
  bar: { marginTop: space.md },
  split: { flexDirection: 'row', gap: space.xl, marginTop: space.md },
  figure: { gap: 2 },
  figureValue: { flexDirection: 'row', alignItems: 'baseline' },
  figureHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  action: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  sectionHead: { marginTop: space.lg },
  alert: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
  },
  alertIcon: { paddingTop: 2 },
});

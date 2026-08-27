import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import {
  byUrgency,
  format,
  mayCarry,
  utilisation,
  worthOfOneReturnLeg,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Empty } from '../components/Empty';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { demoAlerts, demoLegs, type Alert, type AlertKind } from '../state/fleet';
import { demoVehicles } from '../state/product';
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

  const legs = useMemo(demoLegs, []);
  const used = useMemo(() => utilisation(legs), [legs]);
  const alerts = useMemo(() => demoAlerts(now), [now]);
  const fleet = useMemo(() => byUrgency(demoVehicles(now), now), [now]);
  const grounded = fleet.filter((entry) => !mayCarry(entry.assessment)).length;

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
      <Text variant="headline">Your fleet</Text>

      <Card overline="Utilisation" icon="truck" emphasis="accent">
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
            label="Loaded"
            value={`${Math.round(used.loadedMetres / 1000)} km`}
            tone="moving"
          />
          <Figure
            icon="route"
            label="Empty"
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
          <Text variant="label" tone="secondary">
            One document short of Trusted · a licence expires in 18 days
          </Text>
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
          <Text variant="label" tone="secondary">
            {grounded === 0
              ? `All ${fleet.length} trucks can take work`
              : `${grounded} of ${fleet.length} cannot be given a new trip`}
          </Text>
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

      {alerts.length === 0 ? (
        <Card emphasis="plain">
          <Empty
            icon="check"
            title={t('nothing_needs_you')}
            detail={t('good_morning_note')}
          />
        </Card>
      ) : (
        alerts.map((alert) => <AlertRow key={alert.id} alert={alert} now={now} />)
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

function AlertRow({ alert, now }: { alert: Alert; now: Date }) {
  const colours = useColours();
  const { t } = useLanguage();

  // Silence is grey. A coverage gap is a fact about Nigerian network
  // infrastructure, not the driver's fault, and colouring it as an alarm
  // trains a fleet owner to distrust drivers for something nobody controls.
  const [icon, colour, wash]: [IconName, string, string] =
    alert.kind === 'silent'
      ? ['signal-off', colours.stale, colours.staleWash]
      : alert.kind === 'stalled'
        ? ['alert', colours.exception, colours.exceptionWash]
        : ['clock', colours.stopped, colours.stoppedWash];

  return (
    <View style={[styles.alert, { backgroundColor: wash, borderColor: colour }]}>
      <View style={styles.alertIcon}>
        <Icon name={icon} size="md" colour={colour} />
      </View>
      <View style={styles.flex}>
        <Text variant="title">{alert.title}</Text>
        <Text variant="body" tone="secondary" style={styles.gap}>
          {alert.detail}
        </Text>
        <Text variant="label" tone="secondary" style={styles.gap}>
          {agoLabel(now.getTime() - alert.at.getTime(), t)}
        </Text>
      </View>
    </View>
  );
}

export type { AlertKind };

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

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_SHARE_DAYS,
  check,
  daysLeft,
  invite,
  visibleUnder,
  type ShareLink,
  type ShareScope,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { mono, radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { map } from '../api/client';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoShareLinks } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
  readonly onPreview: () => void;
}

/**
 * Letting somebody watch this trip without an account.
 *
 * The wedge lives on this screen. Tracking one truck is worth paying for, but
 * only if the person who wants to *see* it can — and that person is usually a
 * cargo owner who has never heard of Backhaul and will not install anything to
 * find out where their goods are.
 *
 * Two decisions are on screen and nothing else: what the link shows, and how
 * long it lasts. Everything else a share sheet usually asks is either a
 * setting nobody changes or a way to leak a phone number.
 */
export function ShareScreen({ trip, onBack, onPreview }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const { t } = useLanguage();

  const { api } = useSession();
  const [scope, setScope] = useState<ShareScope>('position');

  /*
    The list carries no tokens, and that is the design rather than an omission.

    A token is shown once, at the moment it is issued, and is never retrievable
    — so a link is revoked by its id. A list that carried tokens would hand
    every link on the trip to whoever opened this screen, which is exactly what
    a capability must not do. See ADR-0010.
  */
  const { query, refresh } = useTripData(
    trip.live,
    async () =>
      map(await api.shareLinks(trip.id), (rows) =>
        rows.map<ShareLink>((row) => ({
          // The id stands in for the token everywhere this screen needs a key.
          token: row.id,
          tripId: trip.id,
          scope: row.scope,
          issuedAt: new Date(row.issuedAt),
          expiresAt: new Date(row.expiresAt),
          revokedAt: row.revokedAt === null ? null : new Date(row.revokedAt),
          label: row.label,
        })),
      ),
    () => demoShareLinks(trip, now),
    [api, trip.id, now],
  );

  const links = query.state === 'ready' ? query.value : [];

  const visible = visibleUnder(scope);

  const message = invite({
    from: 'Sahel Haulage',
    cargo: trip.cargo,
    destination: trip.destinationName,
    url: 'bkhl.ng/t/9f3a2b1c',
  });

  const revoke = (id: string) => {
    if (!trip.live) {
      refresh();
      return;
    }
    void api.revokeShare(trip.id, id).then(() => refresh());
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('share_this_trip')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Card emphasis="accent" overline={t('what_they_will_see')} icon="link">
          {/*
            Full-width rows rather than chips. As chips the second option — the
            longer sentence — wrapped onto its own line and the pair read as two
            unrelated buttons of different sizes rather than a choice between
            two things.
          */}
          <Option
            title={t('where_it_is_only')}
            detail={t('position_and_arrival_only')}
            selected={scope === 'position'}
            onPress={() => setScope('position')}
          />
          <Option
            title={t('where_it_has_been_too')}
            detail={t('adds_the_full_track')}
            selected={scope === 'evidence'}
            onPress={() => setScope('evidence')}
          />

          <View style={styles.rules}>
            <Rule on={visible.position} label={t('where_the_truck_is_now')} />
            <Rule on={visible.eta} label={t('when_it_should_arrive')} />
            <Rule on={visible.history} label={t('everywhere_it_has_been')} />
            <Rule on={visible.trackQuality} label={t('what_the_track_dropped')} />
          </View>

          {/*
            Below the line, and separated on purpose. The two `false`s are typed
            `false` in the domain, not `boolean` — no scope turns them on. Mixed
            in with the rest they looked like two more things the toggle
            controls, and the sentence that actually gets a link sent is "it
            cannot show them your number".
          */}
          <View style={[styles.never, { borderTopColor: colours.accent }]}>
            <Text variant="overline" tone="secondary">
              {t('never_shown').toUpperCase()}
            </Text>
            <Rule on={visible.contactDetails} label={t('anybodys_phone_number')} />
            <Rule on={visible.money} label={t('what_the_load_is_worth')} />
          </View>
        </Card>

        <Card overline={t('the_message')} icon="message">
          <View style={[styles.sms, { backgroundColor: colours.surfaceDim }]}>
            <Text variant="body">{message}</Text>
          </View>
          <Text variant="label" tone="secondary" style={styles.gapTop}>
            {message.length} {t('one_sms_and_it_says_who')}
          </Text>

          <View style={styles.actions}>
            <Press
              onPress={onPreview}
              accessibilityLabel={t('see_what_they_see')}
              style={[styles.primary, { backgroundColor: colours.accent }]}
            >
              <View style={styles.centreRow}>
                <Icon name="link" size="md" colour={colours.onAccent} />
                <Text variant="title" style={{ color: colours.onAccent }}>
                  {t('see_what_they_see')}
                </Text>
              </View>
            </Press>
          </View>

          <Text variant="label" tone="secondary" style={styles.gapTop}>
            {DEFAULT_SHARE_DAYS} {t('days_unless_you_turn_it_off')}
          </Text>
        </Card>

        <Text variant="overline" tone="secondary" style={styles.heading}>
          {t('links_on_this_trip').toUpperCase()}
        </Text>

        {links.map((link) => (
          <LinkRow key={link.token} link={link} now={now} onRevoke={() => revoke(link.token)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Rule({ on, label }: { on: boolean; label: string }) {
  const colours = useColours();

  return (
    <View style={styles.rule}>
      <Icon
        name={on ? 'check' : 'close'}
        size="sm"
        colour={on ? colours.moving : colours.textSecondary}
      />
      <Text variant="body" tone={on ? 'primary' : 'secondary'} style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

/** One of the two scopes, as a row you can hit with a thumb. */
function Option({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colours = useColours();

  return (
    <Press
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityHint={detail}
      feedback="opacity"
      style={[
        styles.option,
        {
          backgroundColor: selected ? colours.surfaceRaised : 'transparent',
          borderColor: selected ? colours.accent : colours.outline,
        },
      ]}
    >
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colours.accent : colours.outline },
        ]}
      >
        {selected ? <View style={[styles.radioDot, { backgroundColor: colours.accent }]} /> : null}
      </View>
      <View style={styles.flex}>
        <Text variant="title" tone={selected ? 'accent' : 'primary'}>
          {title}
        </Text>
        <Text variant="label" tone="secondary">
          {detail}
        </Text>
      </View>
    </Press>
  );
}

function LinkRow({
  link,
  now,
  onRevoke,
}: {
  link: ShareLink;
  now: Date;
  onRevoke: () => void;
}) {
  const colours = useColours();
  const { t } = useLanguage();
  const state = check(link, now);
  const left = daysLeft(link, now);

  /*
    Revoked and expired are different words on purpose. Telling somebody their
    link "was revoked" when it merely lapsed invites a phone call about trust,
    and the domain answers them separately so a screen cannot blur them.
  */
  /*
    `daysLeft` floors, so 0 means "less than a day" — which is not the same as
    "today". A link issued at 3am with 23 hours left expires *tomorrow*, and
    "Expires today" was the screen rounding a fact into a wrong one.
  */
  const [label, tint] = state.ok
    ? left === 0
      ? ([t('under_a_day_left'), colours.stopped] as const)
      : left === 1
        ? ([t('one_day_left'), colours.stopped] as const)
        : left === null
          ? ([t('does_not_expire'), colours.exception] as const)
          : ([`${left} ${t('days_left')}`, colours.moving] as const)
    : state.reason === 'revoked'
      ? ([t('turned_off'), colours.textSecondary] as const)
      : ([t('expired'), colours.textSecondary] as const);

  return (
    <Card emphasis="plain">
      <View style={styles.linkTop}>
        <Text variant="title" style={styles.flex} numberOfLines={1}>
          {link.label}
        </Text>
        <Text variant="label" style={{ color: tint }}>
          {label}
        </Text>
      </View>

      <Text variant="label" tone="secondary" style={[mono, styles.gapTight]}>
        bkhl.ng/t/{link.token.slice(0, 8)}
      </Text>

      <View style={styles.linkFooter}>
        <Text variant="label" tone="secondary" style={styles.flex}>
          {t(link.scope === 'evidence' ? 'position_and_full_track' : 'position_only')}
        </Text>
        {state.ok ? (
          <Press
            onPress={onRevoke}
            accessibilityLabel={`${t('turn_off_the_link_for')} ${link.label}`}
            accessibilityHint={t('they_stop_seeing_it')}
            feedback="opacity"
            hitSlop={space.sm}
            style={[styles.revoke, { borderColor: colours.outline }]}
          >
            <Text variant="label" tone="exception">
              {t('turn_off')}
            </Text>
          </Press>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  gapTop: { marginTop: space.md },
  gapTight: { marginTop: space.xs },
  option: {
    flexDirection: 'row',
    // Top, not centre: at the largest text size a title wraps to two lines and
    // a centred radio floats into the gap between them.
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginBottom: space.sm,
  },
  radio: {
    width: 22,
    height: 22,
    marginTop: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill },
  rules: { gap: space.sm, marginTop: space.md },
  never: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    gap: space.sm,
  },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sms: { padding: space.md, borderRadius: radius.md },
  actions: { marginTop: space.sm },
  primary: {
    minHeight: target.standard,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  linkTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  linkFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  revoke: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

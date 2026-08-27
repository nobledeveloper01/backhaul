import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  check,
  daysLeft,
  eta,
  observe,
  shouldTrack,
  silentFor,
  visibleUnder,
  type ShareLink,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Corridor } from '../components/Corridor';
import { Empty } from '../components/Empty';
import { EtaRange } from '../components/EtaRange';
import { Icon } from '../components/Icon';
import { PositionAge } from '../components/PositionAge';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusChip } from '../components/StatusChip';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoShareLinks } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/**
 * The page at the end of a link.
 *
 * **This is the wedge.** Somebody with no account, who has never heard of
 * Backhaul, opens a link from an SMS and finds out where their goods are. If
 * this page is good, the product spreads one cargo owner at a time and the
 * marketplace gets its liquidity for free. If it asks them to sign up first, it
 * spreads to nobody.
 *
 * So: no account, no install, no tab bar, and one thing on the screen. The only
 * thing it asks for is at the bottom, after the answer has been given.
 */
export function FollowScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);

  /*
    Built locally, and it has to be.

    This is the *preview* — "see what they will see" — and the page a holder
    actually opens is `GET /v1/share/{token}`, unauthenticated, on a token this
    screen does not have. A token is shown once at issue and is never
    retrievable, which is what makes a share link a capability rather than a
    listing; a preview that could fetch one would have broken that. See
    ADR-0010.

    So the shipper sees a faithful rendering of the scope they picked, built
    from the trip in front of them. The one thing it cannot show is somebody
    else's clock, and the toggle exists for exactly that: the states worth
    authoring are a link that lapsed and one that was turned off, and neither
    happens while you are looking at it.
  */
  const links = useMemo(() => demoShareLinks(trip, now), [trip, now]);
  const [index, setIndex] = useState(0);
  const link: ShareLink | undefined = links[index % links.length];
  const state = check(link, now);

  const arrival = useMemo(
    () =>
      eta({
        track: trip.track.kept,
        destination: trip.destination,
        now,
        truckClass: trip.truck,
      }),
    [trip, now],
  );

  const tripState = trip.history[trip.history.length - 1]?.state ?? 'open';
  const observation = observe(trip.track.kept, now);
  const silence = silentFor(trip.track.kept, now);
  const visible = state.ok ? visibleUnder(state.link.scope) : null;
  const left = state.ok ? daysLeft(state.link, now) : null;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('following_a_delivery')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {/*
          A reviewer's control, not a product one. It is labelled as such
          rather than dressed up as a feature, because a page pretending to be
          the public one while carrying private controls is how a demo ends up
          shipped.
        */}
        <Press
          onPress={() => setIndex((was) => was + 1)}
          accessibilityLabel={t('show_next_link')}
          feedback="opacity"
          style={[styles.switcher, { borderColor: colours.outline }]}
        >
          <Icon name="swap" size="sm" colour={colours.textSecondary} />
          <Text variant="label" tone="secondary">
            {t('demo_showing_link')} {(index % links.length) + 1} {t('of_count')}{' '}
            {links.length}
          </Text>
        </Press>

        {/*
          The domain's own sentence says both things at once — "This link was
          turned off. Ask whoever sent it for a new one." — which is right for
          an API response and wrong here, where the title has already said the
          first half. The screen keeps the title and adds the part a stranger
          actually wants: why a link they were sent has stopped working.
        */}
        {!state.ok ? (
          <Empty
            icon="link"
            title={t(state.reason === 'revoked' ? 'link_turned_off' : 'link_expired')}
            detail={t(state.reason === 'revoked' ? 'ask_for_a_new_one' : 'links_stop_working')}
          />
        ) : (
          <>
            <View style={styles.headline}>
              <Text variant="headline">
                {trip.cargo} to {trip.destinationName}
              </Text>
              <Text variant="body" tone="secondary">
                Sent by Sahel Haulage · {trip.plate}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <StatusChip observation={observation} tracking={shouldTrack(tripState)} />
              <PositionAge silentForMs={silence} compact />
            </View>

            {visible?.position === true ? (
              <Card overline={t('where_it_is')} icon="route" emphasis="accent">
                <Corridor
                  origin={trip.origin}
                  destination={trip.destination}
                  track={trip.track}
                  originName={trip.originName}
                  destinationName={trip.destinationName}
                />
              </Card>
            ) : null}

            {visible?.eta === true ? <EtaRange eta={arrival} /> : null}

            {/*
              What the link does *not* carry, on the page itself. The recipient
              is usually the cargo owner, and the question they ask the sender
              first is whether this shows anything they would rather it did not.
            */}
            <Card overline={t('what_this_link_shows')} icon="link" emphasis="plain">
              <Line on label={t('where_it_is_and_arrival')} />
              <Line on={visible?.history === true} label={t('everywhere_it_has_been')} />
              <Line on={false} label={t('anybodys_phone_number')} />
              <Line on={false} label={t('what_the_load_is_worth')} />
              <Text variant="label" tone="secondary" style={styles.expiry}>
                {left === null
                  ? t('link_does_not_expire')
                  : left === 0
                    ? t('link_stops_today')
                    : `${left} ${t('link_stops_in_days')}`}
              </Text>
            </Card>

            <View style={[styles.pitch, { backgroundColor: colours.surfaceDim }]}>
              <Text variant="title">{t('sending_something_yourself')}</Text>
              <Text variant="body" tone="secondary">
                {t('track_any_truck')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Line({ on, label }: { on: boolean; label: string }) {
  const colours = useColours();
  return (
    <View style={styles.line}>
      <Icon name={on ? 'check' : 'close'} size="sm" colour={on ? colours.moving : colours.textSecondary} beside="body" />
      <Text variant="body" tone={on ? 'primary' : 'secondary'} style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
  },
  headline: { gap: space.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xs },
  expiry: { marginTop: space.sm },
  pitch: { padding: space.lg, borderRadius: radius.xl, gap: space.xs },
});

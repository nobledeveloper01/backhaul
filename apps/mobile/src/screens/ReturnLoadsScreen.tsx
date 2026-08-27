import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NO_LOAD_FILTER,
  advise,
  margin,
  walkAwayBelow,
  distance,
  format,
  fromNaira,
  quote,
  type LoadFilter,
  type Position,
  type Blocker,
  type Kobo,
  type TruckClass,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { SearchField } from '../components/SearchField';
import { Unready } from '../components/Unready';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import type { RankedLoadView } from '../api/client';
import { BLOCKER_WORDS, whyNoLoads, whyThisFare, whyThisLoad } from '../state/words';

const at = (lat: number, lon: number, when: Date): Position => ({
  lat,
  lon,
  accuracy: 20,
  at: when,
});

/**
 * What to take back — the reason this product is called Backhaul.
 *
 * An empty truck running 900 km home earns nothing and burns diesel the whole
 * way, so a load going that direction at a lower rate can beat a full-price
 * load going the wrong way. The ranking says so, then shows the empty
 * kilometres and the direction beside every row so a haulier can disagree with
 * it — which is the first thing a haulier does with a recommendation.
 *
 * **Nothing is filtered out.** A load the truck cannot take is greyed with the
 * reason rather than hidden: a carrier who cannot see why the 30-tonne load is
 * missing assumes the app is broken.
 */
export function ReturnLoadsScreen({
  onPost,
  onChain,
  onLanes,
  onPairs,
}: {
  readonly onPost: () => void;
  readonly onChain: () => void;
  readonly onLanes: () => void;
  readonly onPairs: () => void;
}) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);
  const { t } = useLanguage();

  const KANO = at(12.0022, 8.592, now);
  const LAGOS = at(6.455, 3.3841, now);


  const { api } = useSession();
  const [filter, setFilter] = useState<LoadFilter>(NO_LOAD_FILTER);

  /*
    The board is ranked by the server, and the filter goes with the request.

    Ranking on the phone would need every load on the board on the phone, which
    is the thing a board exists to avoid — and the ranking is the product, so
    two implementations of it is two answers to "where should this truck go
    next". Both sides run `rankLoads`; only one of them has the board.

    Filtered before ranked, on the server, for the reason it was filtered before
    ranked here: ranking a load out of a search the carrier typed leaves "1."
    missing from the list with no explanation.
  */
  const { query, refresh } = useMine(
    () =>
      api.loads({
        lat: KANO.lat,
        lon: KANO.lon,
        truck: 'trailer_30t',
        baseLat: LAGOS.lat,
        baseLon: LAGOS.lon,
        ...(filter.text.trim() === '' ? {} : { text: filter.text }),
        ...(filter.minimumOffer === null ? {} : { minimumOfferKobo: filter.minimumOffer }),
      }),
    [api, filter.text, filter.minimumOffer],
  );

  const ranked = query.state === 'ready' ? query.value : [];
  const takeable = ranked.filter((scored) => scored.blocked === null);
  const blocked = ranked.filter((scored) => scored.blocked !== null);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      <View style={styles.headerRow}>
        <Text variant="headline" style={styles.flex}>
          {t('loads_going_your_way')}
        </Text>
        <Press
          onPress={onPost}
          accessibilityLabel={t('post_a_load')}
          accessibilityHint={t('opens_to_bids')}
          feedback="opacity"
          style={[styles.post, { borderColor: colours.accent }]}
        >
          <Icon name="package" size="sm" colour={colours.accent} />
          <Text variant="label" tone="accent">
            {t('post')}
          </Text>
        </Press>
      </View>
      <View style={styles.lede}>
        <Icon name="truck" size="sm" colour={colours.textSecondary} />
        <Text variant="body" tone="secondary" style={styles.flex}>
          {t('your_trailer_is_free')}
        </Text>
      </View>

      <SearchField
        value={filter.text}
        onChange={(text) => setFilter((was) => ({ ...was, text }))}
        placeholder={t('search_loads')}
        accessibilityLabel={t('search_the_board')}
      />

      <View style={styles.filters}>
        <Chip
          label={t('a_million_and_up')}
          selected={filter.minimumOffer !== null}
          onPress={() =>
            setFilter((was) => ({
              ...was,
              minimumOffer: was.minimumOffer === null ? fromNaira(1_000_000) : null,
            }))
          }
        />
        <Chip
          label={t('trailer_only')}
          selected={filter.truckClasses.length > 0}
          onPress={() =>
            setFilter((was) => ({
              ...was,
              truckClasses: was.truckClasses.length > 0 ? [] : ['trailer_30t'],
            }))
          }
        />
        <Chip
          label={t('ready_today')}
          selected={filter.readyBefore !== null}
          onPress={() =>
            setFilter((was) => ({
              ...was,
              readyBefore:
                was.readyBefore === null ? new Date(now.getTime() + 24 * 3_600_000) : null,
            }))
          }
        />
      </View>

      {/*
        Three legs rather than one, offered where a carrier is already thinking
        about the run home. Buried on another tab, the feature that fixes the
        empty leg would sit two taps from the screen about the empty leg.
      */}
      <Press
        onPress={onChain}
        accessibilityLabel={t('chain_three_legs')}
        accessibilityHint={t('chain_note')}
        feedback="opacity"
        /*
          Quiet, deliberately. The ranked "best fit" load is this screen's one
          primary; a second accent-washed card above it left the screen with
          two things shouting and therefore none.
        */
        style={[
          styles.chain,
          { backgroundColor: colours.surfaceRaised, borderColor: colours.outline },
        ]}
      >
        <Icon name="swap" size="md" colour={colours.accent} />
        <View style={styles.flex}>
          <Text variant="title">{t('chain_three_legs')}</Text>
          <Text variant="label" tone="secondary">
            Kano → Kaduna → Lagos · {t('loaded_the_whole_way')}
          </Text>
        </View>
        <Icon name="chevron-right" size="md" colour={colours.outline} />
      </Press>

      <View style={styles.shortcuts}>
        <Shortcut
          icon="swap"
          title={t('share_a_trailer')}
          detail={t('two_part_loads_one_run')}
          onPress={onPairs}
        />
        <Shortcut
          icon="route"
          title={t('your_lanes')}
          detail={t('runs_you_make_again')}
          onPress={onLanes}
        />
      </View>

      {/*
        The chrome above stays; only the results wait.

        A carrier can still type into the search and change a filter while the
        board is on its way — what they must not read is "nothing on the board
        for that" when the phone never reached the board. `ranked` fell back to
        an empty list on every outcome that was not a value, so an unreachable
        server rendered as a market with nothing in it, under a sentence
        explaining which of *their* filters was to blame.
      */}
      <Unready query={query} onRetry={refresh} />

      {query.state !== 'ready' ? null : (
        <>
          {ranked.length === 0 ? (
            <Empty
              icon="search"
              title={t('nothing_on_the_board_for_that')}
              detail={whyNoLoads(filter, t)}
              action={{ label: t('clear_the_filter'), onPress: () => setFilter(NO_LOAD_FILTER) }}
            />
          ) : null}

          {takeable.map((scored, index) => (
            <LoadRow key={scored.load.id} scored={scored} rank={index + 1} />
          ))}

          {blocked.length > 0 ? (
            <>
              <Text variant="overline" tone="secondary" style={styles.blockedHead}>
                {t('not_for_this_truck').toUpperCase()}
              </Text>
              {blocked.map((scored) => (
                <LoadRow key={scored.load.id} scored={scored} rank={0} />
              ))}
            </>
          ) : null}
        </>
      )}

      <Text variant="label" tone="secondary" style={styles.footer}>
        {t('ranking_note')}
      </Text>
    </ScrollView>
  );
}

/** One of the two quiet entries above the board. */
function Shortcut({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: 'swap' | 'route';
  title: string;
  detail: string;
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
        styles.shortcut,
        { backgroundColor: colours.surfaceRaised, borderColor: colours.outline },
      ]}
    >
      <Icon name={icon} size="md" colour={colours.textSecondary} />
      <Text variant="title" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="label" tone="secondary" numberOfLines={1}>
        {detail}
      </Text>
    </Press>
  );
}

function LoadRow({ scored, rank }: { scored: RankedLoadView; rank: number }) {
  const colours = useColours();
  const { t } = useLanguage();
  const blocked = scored.blocked !== null;

  const from = scored.load.originName;
  const to = scored.load.destinationName;
  const cargo = scored.load.cargo;
  const truck = scored.load.requires as TruckClass;

  /*
    Priced here, from the coordinates the ranking used.

    The quote and the cost model are cheap, pure and parity-held, and running
    them locally means the carrier sees the arithmetic move when they change
    the diesel price rather than after a round trip. What could not be done
    locally is the ranking, which needs the whole board.
  */
  const laden = distance(
    { lat: scored.load.originLat, lon: scored.load.originLon, accuracy: 0, at: scored.load.readyBy },
    {
      lat: scored.load.destinationLat,
      lon: scored.load.destinationLon,
      accuracy: 0,
      at: scored.load.readyBy,
    },
  );

  const indicative = quote(truck, laden);
  const homeward = scored.progressHomeKm > 50;

  const costing = {
    truck,
    ladenM: laden,
    // The empty run to reach it. The whole argument of this screen.
    emptyM: scored.deadheadKm * 1_000,
    dieselPerLitre: fromNaira(1_100),
    levies: fromNaira(Math.round((laden / 1_000) * 45)),
    other: fromNaira(15_000),
  };

  const offered = (scored.load.offeredKobo ?? 0) as Kobo;
  const verdict = advise(offered, costing);

  return (
    <Card
      emphasis={blocked ? 'plain' : rank === 1 ? 'accent' : 'raised'}
      style={blocked ? styles.blocked : undefined}
    >
      <View style={styles.top}>
        <View style={styles.route}>
          <Text variant="title">{from}</Text>
          <Icon name="chevron-right" size="sm" colour={colours.textSecondary} />
          <Text variant="title">{to}</Text>
        </View>
        {!blocked && rank === 1 ? (
          <View style={[styles.best, { backgroundColor: colours.accent }]}>
            <Text variant="label" style={{ color: colours.onAccent }}>
              {t('best_fit')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <Icon name="package" size="sm" colour={colours.textSecondary} beside="body" />
        <Text variant="body" tone={blocked ? 'stale' : 'secondary'} style={styles.flex}>
          {cargo}
        </Text>
      </View>

      {blocked ? (
        <View style={styles.metaRow}>
          <Icon name="alert" size="sm" colour={colours.stale} beside="body" />
          <Text variant="body" tone="stale" style={styles.flex}>
            {t(BLOCKER_WORDS[(scored.blocked ?? 'expired') as Blocker])}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.metaRow}>
            <Icon name={homeward ? 'swap' : 'route'} size="sm" colour={colours.textSecondary} />
            <Text variant="body" tone="secondary" style={styles.flex}>
              {whyThisLoad(scored.deadheadKm * 1_000, scored.progressHomeKm * 1_000, true, t)}
            </Text>
          </View>

          <View style={styles.price}>
            {/*
              Not tabular. Tabular figures exist to stop a number shifting as
              its digits change, and this one does not change in place — while
              Menlo's ₦ is noticeably heavier than the system face at 36px.
              The settlement column keeps tabular, because that is a column.
            */}
            <Text variant="display">
              {scored.load.offeredNaira ?? '—'}
            </Text>
          </View>
          <Text variant="label" tone="secondary">
            {t('going_rate')} {format(indicative.low)} – {format(indicative.high)} ·{' '}
            {t('indicative')}
          </Text>

          {/*
            What it leaves *this* carrier, after diesel at today's price, the
            running cost of the truck and what the road takes. The going rate
            is what a shipper should pay; this is whether to say yes, and they
            are different questions.
          */}
          <View
            style={[
              styles.advice,
              { borderColor: verdict.take ? colours.moving : colours.stopped },
            ]}
          >
            <Icon
              name={verdict.take ? 'check' : 'alert'}
              size="sm"
              colour={verdict.take ? colours.moving : colours.stopped}
            />
            <Text
              variant="label"
              tone={verdict.take ? 'moving' : 'stopped'}
              style={styles.flex}
            >
              {whyThisFare(
                verdict.take,
                margin(offered, costing).fraction,
                offered < walkAwayBelow(costing),
                t,
              )}
            </Text>
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  shortcuts: { flexDirection: 'row', gap: space.sm },
  advice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  shortcut: {
    flex: 1,
    gap: 2,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.md },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  post: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  lede: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  route: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  best: { paddingHorizontal: space.md, paddingVertical: 3, borderRadius: radius.pill },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.xs },
  price: { marginTop: space.sm },
  blocked: { opacity: 0.6 },
  blockedHead: { marginTop: space.lg },
  footer: { marginTop: space.sm },
});

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NO_LOAD_FILTER,
  distance,
  filterLoads,
  format,
  fromNaira,
  quote,
  rankLoads,
  whyNothing,
  type Carrier,
  type Load,
  type LoadFilter,
  type LoadScore,
  type LoadSummary,
  type Position,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { SearchField } from '../components/SearchField';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';

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
}: {
  readonly onPost: () => void;
  readonly onChain: () => void;
}) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);

  const KANO = at(12.0022, 8.592, now);
  const LAGOS = at(6.455, 3.3841, now);

  const carrier: Carrier = { at: KANO, freeFrom: now, truck: 'trailer_30t', base: LAGOS };

  const loads: Load[] = useMemo(
    () => [
      {
        id: 'l1',
        origin: at(12.0022, 8.592, now),
        destination: at(6.455, 3.3841, now),
        weight: 26,
        requires: 'trailer_30t',
        offered: fromNaira(1_850_000),
        readyBy: new Date(now.getTime() + 6 * 3_600_000),
        expiresAt: new Date(now.getTime() + 40 * 3_600_000),
      },
      {
        id: 'l2',
        origin: at(11.8311, 13.151, now),
        destination: at(11.8, 13.2, now),
        weight: 24,
        requires: 'trailer_30t',
        offered: fromNaira(2_600_000),
        readyBy: new Date(now.getTime() + 20 * 3_600_000),
        expiresAt: new Date(now.getTime() + 60 * 3_600_000),
      },
      {
        id: 'l3',
        origin: at(10.5222, 7.4383, now),
        destination: at(7.3775, 3.947, now),
        weight: 28,
        requires: 'trailer_30t',
        offered: fromNaira(1_600_000),
        readyBy: new Date(now.getTime() + 30 * 3_600_000),
        expiresAt: new Date(now.getTime() + 70 * 3_600_000),
      },
      {
        id: 'l4',
        origin: at(12.0, 8.6, now),
        destination: at(6.5, 3.4, now),
        weight: 38,
        requires: 'lowbed',
        offered: fromNaira(4_200_000),
        readyBy: new Date(now.getTime() + 4 * 3_600_000),
        expiresAt: new Date(now.getTime() + 50 * 3_600_000),
      },
    ],
    [now],
  );

  const routes: Record<string, [string, string, string]> = {
    l1: ['Kano', 'Lagos', 'cement'],
    l2: ['Maiduguri', 'Gwoza', 'fertiliser'],
    l3: ['Kaduna', 'Ibadan', 'grain'],
    l4: ['Kano', 'Lagos', 'plant hire'],
  };

  const [filter, setFilter] = useState<LoadFilter>(NO_LOAD_FILTER);

  /*
    Filtered before ranking, not after. Ranking a load out of a search the
    carrier typed would leave "1." missing from the list with no explanation,
    and the ranks are what the screen is arguing with.
  */
  const summaries: LoadSummary[] = loads.map((load) => {
    const [from, to, cargo] = routes[load.id] ?? ['', '', ''];
    return {
      id: load.id,
      origin: from,
      destination: to,
      cargo,
      weightKg: load.weight * 1_000,
      offered: load.offered ?? fromNaira(0),
      readyFrom: load.readyBy,
      truckClass: load.requires,
      shipperTier: 'business',
    };
  });

  const allowed = new Set(filterLoads(summaries, filter).map((summary) => summary.id));
  const ranked = rankLoads(carrier, loads.filter((load) => allowed.has(load.id)), now);
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
          Loads going your way
        </Text>
        <Press
          onPress={onPost}
          accessibilityLabel="Post a load"
          accessibilityHint="Opens it to bids from verified carriers"
          feedback="opacity"
          style={[styles.post, { borderColor: colours.accent }]}
        >
          <Icon name="package" size="sm" colour={colours.accent} />
          <Text variant="label" tone="accent">
            Post
          </Text>
        </Press>
      </View>
      <View style={styles.lede}>
        <Icon name="truck" size="sm" colour={colours.textSecondary} />
        <Text variant="body" tone="secondary" style={styles.flex}>
          Your trailer is free in Kano. Home is Lagos, 830 km away — empty, that
          run earns nothing.
        </Text>
      </View>

      <SearchField
        value={filter.text}
        onChange={(text) => setFilter((was) => ({ ...was, text }))}
        placeholder="Town or cargo"
        accessibilityLabel="Search the load board"
      />

      <View style={styles.filters}>
        <Chip
          label="₦1m and up"
          selected={filter.minimumOffer !== null}
          onPress={() =>
            setFilter((was) => ({
              ...was,
              minimumOffer: was.minimumOffer === null ? fromNaira(1_000_000) : null,
            }))
          }
        />
        <Chip
          label="Trailer only"
          selected={filter.truckClasses.length > 0}
          onPress={() =>
            setFilter((was) => ({
              ...was,
              truckClasses: was.truckClasses.length > 0 ? [] : ['trailer_30t'],
            }))
          }
        />
        <Chip
          label="Ready today"
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
        accessibilityLabel="Chain three legs"
        accessibilityHint="Strings return loads together so the truck never runs empty"
        feedback="opacity"
        style={[styles.chain, { backgroundColor: colours.accentWash, borderColor: colours.accent }]}
      >
        <Icon name="swap" size="md" colour={colours.accent} />
        <View style={styles.flex}>
          <Text variant="title" tone="accent">
            Chain three legs
          </Text>
          <Text variant="label" tone="secondary">
            Kano → Kaduna → Lagos, loaded the whole way
          </Text>
        </View>
        <Icon name="chevron-right" size="md" colour={colours.accent} />
      </Press>

      {ranked.length === 0 ? (
        <Empty
          icon="search"
          title="Nothing on the board for that"
          detail={whyNothing(filter)}
          action={{ label: 'Clear the filter', onPress: () => setFilter(NO_LOAD_FILTER) }}
        />
      ) : null}

      {takeable.map((scored, index) => (
        <LoadRow
          key={scored.load.id}
          scored={scored}
          route={routes[scored.load.id] ?? ['', '', '']}
          rank={index + 1}
        />
      ))}

      {blocked.length > 0 ? (
        <>
          <Text variant="overline" tone="secondary" style={styles.blockedHead}>
            NOT FOR THIS TRUCK
          </Text>
          {blocked.map((scored) => (
            <LoadRow
              key={scored.load.id}
              scored={scored}
              route={routes[scored.load.id] ?? ['', '', '']}
              rank={0}
            />
          ))}
        </>
      ) : null}

      <Text variant="label" tone="secondary" style={styles.footer}>
        Ranked on what the trip pays, how far you run empty to reach it, and how
        much of the run home it covers.
      </Text>
    </ScrollView>
  );
}

function LoadRow({
  scored,
  route,
  rank,
}: {
  scored: LoadScore;
  route: [string, string, string];
  rank: number;
}) {
  const colours = useColours();
  const blocked = scored.blocked !== null;
  const [from, to, cargo] = route;

  const indicative = quote(scored.load.requires, distance(scored.load.origin, scored.load.destination));
  const homeward = scored.progressHome > 50_000;

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
              Best fit
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <Icon name="package" size="sm" colour={colours.textSecondary} />
        <Text variant="body" tone={blocked ? 'stale' : 'secondary'} style={styles.flex}>
          {cargo}
        </Text>
      </View>

      {blocked ? (
        <View style={styles.metaRow}>
          <Icon name="alert" size="sm" colour={colours.stale} />
          <Text variant="body" tone="stale" style={styles.flex}>
            {scored.because}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.metaRow}>
            <Icon name={homeward ? 'swap' : 'route'} size="sm" colour={colours.textSecondary} />
            <Text variant="body" tone="secondary" style={styles.flex}>
              {scored.because}
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
              {scored.load.offered === undefined ? '—' : format(scored.load.offered)}
            </Text>
          </View>
          <Text variant="label" tone="secondary">
            Going rate {format(indicative.low)} – {format(indicative.high)} · indicative
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  price: { marginTop: space.sm },
  blocked: { opacity: 0.6 },
  blockedHead: { marginTop: space.lg },
  footer: { marginTop: space.sm },
});

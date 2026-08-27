import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_REPOSITION_M,
  format,
  type Kobo,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Unready } from '../components/Unready';
import { Text } from '../components/Text';
import { radius, space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import type { ChainRefusalView, ChainView } from '../api/client';

interface Props {
  readonly onBack: () => void;
}

const km = (metres: number) => Math.round(metres / 1_000);

/**
 * Three legs instead of one, and the truck comes home loaded.
 *
 * `utilisation.ts` measures the problem — what fraction of the kilometres a
 * truck drove were paid for — and this is the answer to it. A trailer running
 * Lagos → Kano → Lagos empty on the way back is paid for half of what it burns.
 *
 * The screen shows the **rejected** legs as well as the taken ones. A proposal
 * that only shows what it chose asks a carrier to trust an opinion; showing the
 * one that pays four times as much and starts 800 km away, with the sentence
 * explaining why it was passed over, is what makes the choice checkable.
 */
/**
 * Where the truck is.
 *
 * Hard-coded, and it is the last thing on this screen that is: a carrier's
 * position comes from the tracker on their own phone, and the screen that
 * reads it is the driver face rather than this one. Named so the day it is
 * wired the change is one line.
 */
const KANO = { lat: 12.0022, lon: 8.592 };

export function ChainScreen({ onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const { api } = useSession();

  /*
    The chain is built on the server, from the whole board.

    Greedy at each step over every load on offer — which is a search this phone
    cannot run, because it does not have the board. The starting leg is the
    top-ranked load for this truck, which is the load a carrier is looking at
    when they ask "what else could I do with this run".
  */
  const { query: board } = useMine(
    () => api.loads({ lat: KANO.lat, lon: KANO.lon, truck: 'trailer_30t' }),
    [api],
  );

  const start = board.state === 'ready'
    ? (board.value.find((row) => row.blocked === null)?.load ?? null)
    : null;

  const { query: chain, refresh } = useMine<ChainView | null>(
    async () => (start === null ? { ok: true, value: null } : api.chain(start.id)),
    [api, start],
  );

  const { query: passed } = useMine<readonly ChainRefusalView[]>(
    async () => (start === null ? { ok: true, value: [] } : api.chainRefusals(start.id)),
    [api, start],
  );

  const built = chain.state === 'ready' ? chain.value : null;
  const rejected = passed.state === 'ready' ? passed.value : [];

  // What the first leg alone pays. The comparison the whole screen makes is
  // "this chain against running that one load and going home empty".
  const alone = built?.legs[0]?.paysKobo ?? 0;
  const laden = (built?.ladenPct ?? 0) / 100;
  const extra = ((built?.paysKobo ?? 0) - alone) as Kobo;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('chain_this_trip')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {/*
          Nothing derived from the answer until there is one.

          The binding above fell back to an empty list (or the walkthrough) on
          every outcome that was not a value, so a server this phone could not
          reach rendered as a fact about somebody's own records. See `Unready`.
        */}
        <Unready query={chain} onRetry={refresh} />

        {chain.state !== 'ready' ? null : (
          <>
            <Card emphasis="accent" overline={t('if_you_take_all_three')} icon="swap">
              <View style={styles.figureRow}>
                <View style={styles.flex}>
                  <Text variant="display" tabular>
                    {Math.round(laden * 100)}%
                  </Text>
                  <Text variant="body" tone="secondary">
                    {t('of_the_km_paid_for')}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="title" tabular>
                    {format(extra)}
                  </Text>
                  <Text variant="body" tone="secondary">
                    {t('more_than_running_home_empty')}
                  </Text>
                </View>
              </View>

              <Text variant="label" tone="secondary" style={styles.gapTop}>
                {built?.deadheadKm ?? 0} {t('km_empty_across_the_chain')}
              </Text>
            </Card>

            <Text variant="overline" tone="secondary" style={styles.heading}>
              {t('the_chain').toUpperCase()}
            </Text>

            {built === null ? (
              <Text variant="body" tone="secondary">
                {t('nothing_to_chain')}
              </Text>
            ) : null}

            {(built?.legs ?? []).map((leg, index) => {
              /*
                The empty run between one leg dropping and the next loading.

                The server's chain carries a total rather than a per-hop figure, so
                this is the total shared out — which is honest for one hop and a
                lie for three. It is the total on the first hop and zero after,
                rather than an average that would put a plausible-looking number
                against every gap.
              */
              const empty = index === 1 ? (built?.deadheadKm ?? 0) * 1_000 : 0;

              return (
              <View key={leg.loadId}>
                {index > 0 ? (
                  <View style={styles.hop}>
                    <View style={[styles.hopLine, { backgroundColor: colours.outline }]} />
                    <Text variant="label" tone="secondary">
                      {empty < 1_000
                        ? t('loads_where_last_dropped')
                        : `${km(empty)} ${t('km_empty_to_get_there')}`}
                    </Text>
                  </View>
                ) : null}

                <Card emphasis={index === 0 ? 'plain' : 'raised'}>
                  <View style={styles.legTop}>
                    <View
                      style={[
                        styles.pip,
                        {
                          backgroundColor: index === 0 ? colours.outline : colours.accent,
                        },
                      ]}
                    >
                      <Text variant="overline" style={{ color: colours.onAccent }}>
                        {index + 1}
                      </Text>
                    </View>
                    <Text variant="title" style={styles.flex}>
                      {leg.fromName} → {leg.toName}
                    </Text>
                    <Text variant="body" tabular>
                      {leg.paysNaira}
                    </Text>
                  </View>

                  <Text variant="body" tone="secondary" style={styles.gapTight}>
                    {leg.distanceKm} km
                    {index === 0 ? ` · ${t('already_carrying_this')}` : ''}
                  </Text>
                </Card>
              </View>
              );
            })}

            {rejected.length > 0 ? (
              <>
                <Text variant="overline" tone="secondary" style={styles.heading}>
                  {t('passed_over').toUpperCase()}
                </Text>

                {rejected.map((entry) => (
                  <Card key={entry.loadId} emphasis="plain">
                    <View style={styles.legTop}>
                      <Icon name="close" size="sm" colour={colours.textSecondary} beside="body" />
                      <Text variant="body" tone="secondary" style={styles.flex}>
                        {entry.detail}
                      </Text>
                    </View>
                  </Card>
                ))}

                <Text variant="label" tone="secondary">
                  {km(MAX_REPOSITION_M)} {t('km_of_empty_repositioning')}
                </Text>
              </>
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
  gapTop: { marginTop: space.md },
  gapTight: { marginTop: space.xs },
  figureRow: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-end' },
  legTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  pip: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  hopLine: { width: 2, height: 20, marginLeft: 10 },
});

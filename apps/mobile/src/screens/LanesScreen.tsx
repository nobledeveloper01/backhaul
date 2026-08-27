import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type Cadence,
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
import { useMine } from '../state/server';
import type { LaneView } from '../api/client';
import { whenDue } from '../state/words';
import { CADENCE_WORDS } from '../state/words';

interface Props {
  readonly onBack: () => void;
  readonly onPost: () => void;
}

/**
 * The runs a shipper makes over and over.
 *
 * The smallest feature in the product and the one with the most leverage: a
 * shipper with three saved lanes posts in two taps, and a lane that has run
 * eleven times knows what it costs. It is the first thing here that gets
 * better simply because time passed.
 *
 * Due lanes lead. Everything else is a list.
 */
export function LanesScreen({ onBack, onPost }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const { api } = useSession();

  /*
    The server's rows, not a domain `Lane` rebuilt from them.

    A lane's typical price is the median of its last six runs, and the server
    sends the median rather than the runs — so rebuilding a `Lane` here would
    have to invent a history for `typicalPrice` to take a median of, and the
    honest empty history makes it return null on every lane. The arithmetic is
    already done, by the same engine, held to the same answer by the parity
    fixtures. What is left is the ordering, which is presentation.
  */
  const { query, refresh } = useMine(() => api.lanes(), [api]);

  const lanes = query.state === 'ready' ? query.value : [];
  // `due()` rather than a filter: it sorts most-overdue first, which is what
  // makes the one filled button land on the lane that actually needs posting.
  // Filtering kept the demo's own order and put "due tomorrow" above "five
  // days overdue".
  const dueNow = [...lanes]
    .filter((lane) => lane.due)
    .sort((a, b) => (a.dueInMs ?? 0) - (b.dueInMs ?? 0));
  const rest = lanes.filter((lane) => !lane.due);

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('your_lanes')} onBack={onBack} />

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
            {dueNow.length > 0 ? (
              <>
                <Text variant="overline" tone="secondary">
                  {t('coming_round_again').toUpperCase()}
                </Text>
                {/*
                  Only the first due lane gets a filled button. Two of them side by
                  side is a screen with two primaries, which is a screen with none —
                  and the one that is overdue should be the one being pointed at.
                */}
                {dueNow.map((lane, index) => (
                  <Row
                    key={lane.id}
                    lane={lane}
                    onPost={onPost}
                    due
                    lead={index === 0}
                  />
                ))}
                <Text variant="label" tone="secondary">
                  {t('two_days_warning_note')}
                </Text>
              </>
            ) : null}

            <Text variant="overline" tone="secondary" style={styles.heading}>
              SAVED
            </Text>

            {rest.map((lane) => (
              <Row key={lane.id} lane={lane} onPost={onPost} due={false} lead={false} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({
  lane,
  onPost,
  due,
  lead,
}: {
  lane: LaneView;
  onPost: () => void;
  due: boolean;
  lead: boolean;
}) {
  const colours = useColours();
  const { t } = useLanguage();

  // Overdue is a different fact from due, and reading them in the same colour
  // makes "act now" and "you have a day" look alike.
  const overdue = (lane.dueInMs ?? 0) < 0;

  return (
    <Card emphasis={due ? 'accent' : 'raised'}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="title">{lane.name}</Text>
          <Text variant="body" tone="secondary">
            {lane.origin} → {lane.destination} · {lane.cargo}
          </Text>
        </View>
        <Text variant="label" tone={overdue ? 'stopped' : due ? 'accent' : 'secondary'}>
          {whenDue(lane.dueInMs, lane.cadence as Cadence, t)}
        </Text>
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <Text variant="label" tone="secondary">
            {t('usually')}
          </Text>
          {/*
            The median of the recent runs, not the average of everything. A
            mean over two years anchors a shipper to a number that stopped
            being true.
          */}
          <Text variant="title" tabular>
            {lane.typicalNaira ?? '—'}
          </Text>
          <Text variant="label" tone="secondary">
            {lane.typicalKobo === null
              ? t('after_three_runs')
              : `${lane.runs} ${t('runs_word')}`}
          </Text>
        </View>

        <View style={styles.fact}>
          <Text variant="label" tone="secondary">
            {t('how_often')}
          </Text>
          <Text variant="title">{t(CADENCE_WORDS[lane.cadence as Cadence])}</Text>
        </View>
      </View>

      <Press
        onPress={onPost}
        accessibilityLabel={`${t('post_lane')} — ${lane.name}`}
        accessibilityHint={t('lane_post_hint')}
        feedback="opacity"
        style={[
          styles.post,
          {
            backgroundColor: lead ? colours.accent : 'transparent',
            borderColor: lead ? colours.accent : colours.outline,
          },
        ]}
      >
        <Icon name="plus" size="sm" colour={lead ? colours.onAccent : colours.textSecondary} />
        <Text
          variant="label"
          style={{ color: lead ? colours.onAccent : colours.textSecondary }}
        >
          {t('post_this_run')}
        </Text>
      </Press>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  facts: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  fact: { flex: 1, gap: 2 },
  post: {
    marginTop: space.md,
    minHeight: target.standard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

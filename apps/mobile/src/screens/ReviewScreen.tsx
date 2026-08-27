import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CARRIER_CLAIMS,
  MINIMUM_ANSWERS,
  worthShowing,
  type CarrierClaim,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useMine } from '../state/server';
import { map } from '../api/client';
import { CARRIER_CLAIM_WORDS, CARRIER_QUESTIONS } from '../state/words';
import type { DemoTrip } from '../state/demo';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/**
 * What the shipper says about the carrier, afterwards.
 *
 * **Four questions, each answerable yes or no, and every one skippable.** Not
 * stars: a 4.2 compresses "arrived late twice" and "damaged the load" into one
 * number, and on a two-sided market the average drifts up until everyone is
 * 4.8 and it says nothing.
 *
 * Skipping is a real answer here, not a way out of the form. Somebody who never
 * needed to call the driver has nothing to say about whether the driver was
 * reachable, and counting that silence as a complaint would quietly punish a
 * carrier for a call that never happened.
 */
export function ReviewScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [answers, setAnswers] = useState<Partial<Record<CarrierClaim, boolean>>>({});

  const { api } = useSession();
  const [sent, setSent] = useState(false);

  /*
    The record is the carrier's, and it is public.

    A tally is what a *stranger* reads to decide whether to trade with
    somebody, so it comes from the route that serves strangers rather than from
    whatever this phone happens to remember. The answers being typed are added
    on top so the counts move as the shipper answers — which is the point of
    showing them here rather than after.
  */
  /*
    Who the carrier is comes from the trip, not from this screen's props.

    A `DemoTrip` carries a carrier's *name* — "Sahel Haulage" — which is what a
    screen renders and not what a record is keyed by. The id is on the trip
    read, sent only to the three parties.
  */
  const { query: detail } = useMine<string | null>(
    async () =>
      trip.live
        ? map(await api.trip(trip.id), (view) => view.carrierId)
        : { ok: true, value: null },
    [api, trip.id, trip.live],
  );

  const carrierId = detail.state === 'ready' ? detail.value : null;

  const { query, refresh } = useMine(
    async () =>
      carrierId === null
        ? ({ ok: true, value: { reviews: 0, tallies: [] } } as const)
        : api.record(carrierId, 'carrier'),
    [api, carrierId],
  );

  const held = query.state === 'ready' ? query.value.tallies : [];
  const answered = Object.keys(answers).length;

  const counted = useMemo(
    () =>
      held.map((row) => {
        const mine = answers[row.claim as CarrierClaim];
        return {
          claim: row.claim,
          yes: row.yes + (mine === true ? 1 : 0),
          asked: row.asked + (mine === undefined ? 0 : 1),
        };
      }),
    [held, answers],
  );

  const send = () => {
    if (answered === 0 || sent) return;
    void api.review(trip.id, answers as Record<string, boolean>, '').then((result) => {
      if (result.ok) {
        setSent(true);
        refresh();
      }
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('how_did_they_do_title')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Text variant="body" tone="secondary">
          {t('four_questions_note')}
        </Text>

        {CARRIER_CLAIMS.map((claim) => (
          <Card key={claim} emphasis={answers[claim] === undefined ? 'plain' : 'raised'}>
            <Text variant="title">{t(CARRIER_QUESTIONS[claim])}</Text>
            <View style={styles.answers}>
              <Answer
                label={t('yes')}
                icon="check"
                chosen={answers[claim] === true}
                tone={colours.moving}
                onPress={() => setAnswers((was) => ({ ...was, [claim]: true }))}
              />
              <Answer
                label={t('no')}
                icon="close"
                chosen={answers[claim] === false}
                tone={colours.exception}
                onPress={() => setAnswers((was) => ({ ...was, [claim]: false }))}
              />
              <Answer
                label={t('didnt_come_up')}
                icon="clock"
                chosen={false}
                tone={colours.textSecondary}
                onPress={() =>
                  setAnswers((was) => {
                    const next = { ...was };
                    delete next[claim];
                    return next;
                  })
                }
              />
            </View>
          </Card>
        ))}

        <Text variant="overline" tone="secondary" style={styles.heading}>
          {t('what_other_shippers_see').toUpperCase()}
        </Text>

        <Card>
          {counted.map((row) => (
            <View key={row.claim} style={styles.tally}>
              <Text variant="body" style={styles.flex}>
                {t(CARRIER_CLAIM_WORDS[row.claim as CarrierClaim])}
              </Text>
              {/*
                Counts, never a percentage. "2 of 2" and "34 of 34" are the same
                fraction and not the same evidence, and the denominator is the
                part a shipper actually decides on.
              */}
              {worthShowing(row) ? (
                <Text variant="body" tabular>
                  {row.yes} of {row.asked}
                </Text>
              ) : (
                <Text variant="label" tone="secondary">
                  Under {MINIMUM_ANSWERS} answers
                </Text>
              )}
            </View>
          ))}
        </Card>

        <Press
          onPress={send}
          disabled={answered === 0 || sent}
          accessibilityLabel={t('send_the_review')}
          style={[styles.send, { backgroundColor: colours.accent }]}
        >
          <Text variant="title" style={{ color: colours.onAccent }}>
            {sent
              ? t('review_sent')
              : answered === 0
                ? t('answer_one_to_send')
                : `${answered} ${t('answers_word')} · ${t('send')}`}
          </Text>
        </Press>
      </ScrollView>
    </View>
  );
}

function Answer({
  label,
  icon,
  chosen,
  tone,
  onPress,
}: {
  label: string;
  icon: 'check' | 'close' | 'clock';
  chosen: boolean;
  tone: string;
  onPress: () => void;
}) {
  const colours = useColours();

  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={[
        styles.answer,
        {
          backgroundColor: chosen ? colours.accentWash : colours.surfaceDim,
          borderColor: chosen ? tone : colours.outline,
        },
      ]}
    >
      <Icon name={icon} size="sm" colour={chosen ? tone : colours.textSecondary} />
      <Text
        variant="label"
        numberOfLines={1}
        style={{ color: chosen ? tone : colours.textSecondary }}
      >
        {label}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  answers: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  answer: {
    flex: 1,
    minHeight: target.standard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  send: {
    minHeight: target.standard,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
});

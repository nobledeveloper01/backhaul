import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  REQUIREMENTS,
  EXPIRY_WARNING_DAYS,
  MINIMUM_TRIPS_FOR_RATE,
  expiringSoon,
  nextStep,
  onTimeRate,
  tierOf,
  type Documents,
  type Record_,
  type Tier,
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
import { DOCUMENT_WORDS, TIER_WORDS } from '../state/words';
import { demoNow } from '../state/demo';
import { DEMO_DOCUMENTS, DEMO_RECORD, demoExpiries } from '../state/product';

interface Props {
  readonly onBack: () => void;
}

/**
 * The four, in the order they are earned.
 *
 * The names come from `DOCUMENT_WORDS` rather than sitting here in English.
 * They used to sit here, and the label a carrier read was the same four words
 * whichever of the four languages the rest of the screen was in.
 */
const PAPERS: readonly (keyof Documents)[] = [
  'identity',
  'licence',
  'registration',
  'insurance',
];

/**
 * What a carrier has proved, and what is left to prove.
 *
 * The second of the four failures the product statement names: neither side can
 * verify the other, so both retreat to people they already know, and the market
 * stays fragmented.
 *
 * The screen's real job is the **next step**. A tier badge with no path to the
 * one above it is a locked door; naming exactly what is missing — "goods-in
 * transit cover, and one more completed trip" — is the difference between a
 * carrier who upgrades and one who assumes the ladder is rigged.
 */
export function VerificationScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const { t } = useLanguage();

  const { api, who } = useSession();

  /*
    The tier is the server's answer, not this screen's.

    Both sides implement the ladder and the parity fixtures hold them to the
    same rung — but the *inputs* are a record of completed trips this phone has
    never seen. Computing it here from `DEMO_RECORD` computed a tier for
    somebody else.
  */
  const { query, refresh } = useMine(() => api.verification(), [api]);

  const held = query.state === 'ready' ? query.value : null;

  const documents: Documents = held === null
    ? DEMO_DOCUMENTS
    : {
        identity: held.hasIdentity,
        licence: held.hasLicence,
        registration: held.hasRegistration,
        insurance: held.hasInsurance,
      };

  const record: Record_ = held === null
    ? DEMO_RECORD
    : {
        tripsCompleted: held.tripsCompleted,
        tripsPromised: held.tripsPromised,
        tripsOnTime: held.tripsOnTime,
        incidents: held.incidents,
      };

  const tier = tierOf(documents, record);
  const step = nextStep(documents, record);
  const rate = onTimeRate(record);
  const soon = expiringSoon(demoExpiries(now), now);

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('verification')} onBack={onBack} />

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
            {/* No icon on the overline: the badge below is already a shield, and two
                of the same mark in one card is one too many. */}
            {/*
              The carrier's own name, from the session — not a constant.

              A verification card headed with somebody else's company was the one
              thing on this screen that could not be true, and it was the heading.
            */}
            <Card emphasis="accent" overline={who?.name.trim() || t('no_name_yet')}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: washFor(tier, colours) }]}>
                  <Icon name="shield" size="lg" colour={tintFor(tier, colours)} />
                </View>
                <View style={styles.flex}>
                  <Text variant="headline">{t(TIER_WORDS[tier])}</Text>
                  {/*
                    `record`, not `DEMO_RECORD`.

                    This line read the walkthrough's trip counts on every render,
                    including when the server had already answered with the real
                    ones — so a carrier's badge came from the API and the evidence
                    under it came from a fixture, and the two could disagree
                    without either looking wrong.
                  */}
                  <Text variant="body" tone="secondary">
                    {record.tripsCompleted} {t('trips_completed')}
                    {rate === null
                      ? ` · ${t('too_few_for_on_time')}`
                      : ` · ${record.tripsOnTime} ${t('of_count')} ${record.tripsCompleted} ${t('on_time')}`}
                  </Text>
                </View>
              </View>

              {/*
                A percentage from a handful of trips is true and misleading, and it
                is the number a shipper decides on. Below five, there is no figure.
              */}
              {rate === null ? (
                <Text variant="label" tone="secondary" style={styles.gapTop}>
                  {t('under_answers')} {MINIMUM_TRIPS_FOR_RATE} {t('trips_completed')}
                </Text>
              ) : null}
            </Card>

            {step !== null ? (
              <Card overline={`${t('to_reach')} ${t(TIER_WORDS[step.tier])}`} icon="route">
                {/*
                  The documents, from the enum rather than from the sentence.

                  `nextStep().missing` is a list of English phrases — the domain
                  writes them because that is what the server says and what the
                  parity fixtures pin, and rendering them straight put "a
                  government ID" under a Yorùbá heading. The enum crosses the
                  boundary; the words do not.
                */}
                {REQUIREMENTS[step.tier].docs
                  .filter((doc) => !documents[doc])
                  .map((doc) => (
                    <View key={doc} style={styles.missing}>
                      <Icon name="plus" size="sm" colour={colours.accent} beside="body" />
                      <Text variant="body" style={styles.flex}>
                        {t(DOCUMENT_WORDS[doc])}
                      </Text>
                    </View>
                  ))}
                {/*
                  And the two that are counts rather than documents, each with its
                  number beside the phrase rather than inside it.
                */}
                {record.tripsCompleted < REQUIREMENTS[step.tier].trips ? (
                  <View style={styles.missing}>
                    <Icon name="plus" size="sm" colour={colours.accent} beside="body" />
                    <Text variant="body" style={styles.flex}>
                      {REQUIREMENTS[step.tier].trips - record.tripsCompleted}{' '}
                      {t('more_completed_trips')}
                    </Text>
                  </View>
                ) : null}
                {REQUIREMENTS[step.tier].onTime > 0 && record.tripsCompleted > 0 ? (
                  <View style={styles.missing}>
                    <Icon name="plus" size="sm" colour={colours.accent} beside="body" />
                    <Text variant="body" style={styles.flex}>
                      {Math.round(REQUIREMENTS[step.tier].onTime * 100)}%{' '}
                      {t('on_time_delivery')}
                    </Text>
                  </View>
                ) : null}
              </Card>
            ) : (
              <Card overline={t('top_of_the_ladder')} icon="check">
                <Text variant="body">
                  {t('nothing_left_to_prove')}
                </Text>
              </Card>
            )}

            {/*
              Expiry dates are the walkthrough's, and the card says so.

              `VerificationView` carries four booleans and no dates: the server
              knows a licence is on file and not when it stops being valid. The
              expiry a truck's papers have lives on the vehicle and is served —
              this card is about the *carrier's* four documents, which is a
              different set and has nowhere to read a date from. Labelled rather
              than dropped, because the warning window is the thing worth
              explaining and the rule behind it is real.
            */}
            {soon.length > 0 ? (
              <Card overline={t('expiring')} icon="clock" emphasis="plain">
                <Text variant="label" tone="stale" style={styles.gapBottom}>
                  {t('walkthrough_figures')}
                </Text>
                {soon.map((entry) => (
                  <View key={entry.kind} style={styles.missing}>
                    <Icon
                      name={entry.days < 0 ? 'alert' : 'clock'}
                      size="sm"
                      colour={entry.days < 0 ? colours.exception : colours.stopped}
                    />
                    <Text variant="body" style={styles.flex}>
                      {t(DOCUMENT_WORDS[entry.kind])}
                      {entry.days < 0
                        ? ` · ${Math.abs(entry.days)} ${t('days_ago_expired')}`
                        : ` · ${entry.days} ${t('expires_in_days')}`}
                    </Text>
                  </View>
                ))}
                <Text variant="label" tone="secondary" style={styles.gapTop}>
                  {EXPIRY_WARNING_DAYS} {t('warned_days_ahead')}
                </Text>
              </Card>
            ) : null}

            <Text variant="overline" tone="secondary" style={styles.heading}>
              {t('trucks_and_papers').toUpperCase()}
            </Text>

            {PAPERS.map((paper) => {
              const held = documents[paper];
              return (
                <Press
                  key={paper}
                  /*
                    Records that a paper is held, not that it is genuine.

                    Verification is a human step, and a tick that put a Trusted
                    badge on an upload nobody looked at would be the platform
                    vouching for something it has not seen. The server says the
                    same thing in its own documentation.
                  */
                  onPress={() => {
                    void api.recordPaper(paper, !held).then(() => refresh());
                  }}
                  accessibilityLabel={t(DOCUMENT_WORDS[paper])}
                  accessibilityHint={held ? t('on_file_tap_to_remove') : t('tap_to_upload')}
                  feedback="opacity"
                  style={[
                    styles.paper,
                    {
                      backgroundColor: colours.surfaceRaised,
                      // The tick carries the state; a green border on every paper
                      // on file turned the list into a wall of green with nothing
                      // standing out.
                      borderColor: colours.outline,
                    },
                  ]}
                >
                  <Icon
                    name={held ? 'check' : 'camera'}
                    size="md"
                    colour={held ? colours.moving : colours.textSecondary}
                  />
                  <View style={styles.flex}>
                    <Text variant="body">{t(DOCUMENT_WORDS[paper])}</Text>
                    <Text variant="label" tone="secondary">
                      {t(held ? 'on_file' : 'not_uploaded')}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size="md" colour={colours.outline} />
                </Press>
              );
            })}

            <Text variant="label" tone="secondary">
              {t('tier_note')}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function tintFor(tier: Tier, colours: ReturnType<typeof useColours>): string {
  switch (tier) {
    case 'trusted':
      return colours.trustedTier;
    case 'business':
      return colours.accent;
    case 'verified':
      return colours.moving;
    case 'unverified':
      return colours.textSecondary;
  }
}

function washFor(tier: Tier, colours: ReturnType<typeof useColours>): string {
  switch (tier) {
    case 'trusted':
      return colours.staleWash;
    case 'business':
      return colours.accentWash;
    case 'verified':
      return colours.movingWash;
    case 'unverified':
      return colours.surfaceDim;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  heading: { marginTop: space.md },
  gapBottom: { marginBottom: space.xs },
  gapTop: { marginTop: space.md },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xs },
  paper: {
    minHeight: target.standard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

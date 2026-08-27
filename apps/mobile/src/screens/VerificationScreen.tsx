import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EXPIRY_WARNING_DAYS,
  MINIMUM_TRIPS_FOR_RATE,
  expiringSoon,
  nextStep,
  onTimeRate,
  tierOf,
  type Documents,
  type Tier,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { TIER_WORDS } from '../state/words';
import { demoNow } from '../state/demo';
import { DEMO_DOCUMENTS, DEMO_RECORD, demoExpiries } from '../state/product';

interface Props {
  readonly onBack: () => void;
}

const PAPERS: readonly { readonly key: keyof Documents; readonly label: string }[] = [
  { key: 'identity', label: 'Government ID' },
  { key: 'licence', label: "Driver's licence" },
  { key: 'registration', label: 'Company registration' },
  { key: 'insurance', label: 'Goods-in-transit cover' },
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

  const [documents, setDocuments] = useState<Documents>(DEMO_DOCUMENTS);

  const tier = tierOf(documents, DEMO_RECORD);
  const step = nextStep(documents, DEMO_RECORD);
  const rate = onTimeRate(DEMO_RECORD);
  const soon = expiringSoon(demoExpiries(now), now);

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('verification')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        {/* No icon on the overline: the badge below is already a shield, and two
            of the same mark in one card is one too many. */}
        <Card emphasis="accent" overline="Sahel Haulage">
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: washFor(tier, colours) }]}>
              <Icon name="shield" size="lg" colour={tintFor(tier, colours)} />
            </View>
            <View style={styles.flex}>
              <Text variant="headline">{t(TIER_WORDS[tier])}</Text>
              <Text variant="body" tone="secondary">
                {DEMO_RECORD.tripsCompleted} trips completed
                {rate === null
                  ? ` · too few for an on-time figure`
                  : ` · ${DEMO_RECORD.tripsOnTime} of ${DEMO_RECORD.tripsCompleted} on time`}
              </Text>
            </View>
          </View>

          {/*
            A percentage from a handful of trips is true and misleading, and it
            is the number a shipper decides on. Below five, there is no figure.
          */}
          {rate === null ? (
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              On-time delivery is shown from {MINIMUM_TRIPS_FOR_RATE} trips.
            </Text>
          ) : null}
        </Card>

        {step !== null ? (
          <Card overline={`${t('to_reach')} ${t(TIER_WORDS[step.tier])}`} icon="route">
            {step.missing.map((missing) => (
              <View key={missing} style={styles.missing}>
                <Icon name="plus" size="sm" colour={colours.accent} />
                <Text variant="body" style={styles.flex}>
                  {missing}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card overline={t('top_of_the_ladder')} icon="check">
            <Text variant="body">
              {t('nothing_left_to_prove')}
            </Text>
          </Card>
        )}

        {soon.length > 0 ? (
          <Card overline="Expiring" icon="clock" emphasis="plain">
            {soon.map((entry) => (
              <View key={entry.kind} style={styles.missing}>
                <Icon
                  name={entry.days < 0 ? 'alert' : 'clock'}
                  size="sm"
                  colour={entry.days < 0 ? colours.exception : colours.stopped}
                />
                <Text variant="body" style={styles.flex}>
                  {PAPERS.find((paper) => paper.key === entry.kind)?.label ?? entry.kind}
                  {entry.days < 0
                    ? ` expired ${Math.abs(entry.days)} days ago`
                    : ` expires in ${entry.days} days`}
                </Text>
              </View>
            ))}
            <Text variant="label" tone="secondary" style={styles.gapTop}>
              Warned {EXPIRY_WARNING_DAYS} days ahead rather than on the morning
              it lapses — losing a tier mid-trip loses work already committed to.
            </Text>
          </Card>
        ) : null}

        <Text variant="overline" tone="secondary" style={styles.heading}>
          PAPERS
        </Text>

        {PAPERS.map((paper) => {
          const held = documents[paper.key];
          return (
            <Press
              key={paper.key}
              onPress={() =>
                setDocuments((was) => ({ ...was, [paper.key]: !was[paper.key] }))
              }
              accessibilityLabel={paper.label}
              accessibilityHint={held ? 'On file. Tap to remove' : 'Tap to upload'}
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
                <Text variant="body">{paper.label}</Text>
                <Text variant="label" tone="secondary">
                  {held ? 'On file' : 'Not uploaded'}
                </Text>
              </View>
              <Icon name="chevron-right" size="md" colour={colours.outline} />
            </Press>
          );
        })}

        <Text variant="label" tone="secondary">
          {t('tier_note')}
        </Text>
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
  gapTop: { marginTop: space.md },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
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

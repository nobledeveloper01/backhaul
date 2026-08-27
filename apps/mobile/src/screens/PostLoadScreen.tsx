import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CAPACITY,
  format,
  quote,
  smallestClassFor,
  type TruckClass,
} from '@backhaul/domain';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly onBack: () => void;
}

/** Corridors a shipper picks from, with the road distance somebody would drive. */
const CORRIDORS: readonly { from: string; to: string; metres: number }[] = [
  { from: 'Lagos', to: 'Ibadan', metres: 130_000 },
  { from: 'Lagos', to: 'Abuja', metres: 750_000 },
  { from: 'Lagos', to: 'Kano', metres: 1_000_000 },
  { from: 'Port Harcourt', to: 'Abuja', metres: 620_000 },
  { from: 'Kano', to: 'Lagos', metres: 1_000_000 },
];

/**
 * Posting a load.
 *
 * The quote updates as the shipper types, which is the whole reason this screen
 * is worth having: the alternative is a broker's number with nothing to check
 * it against, and price opacity is one of the four failures the product
 * statement names.
 *
 * The truck class is **derived from the weight**, not chosen. A shipper knows
 * what they are sending; making them also know that 26 tonnes needs a
 * `trailer_30t` is asking them to do the platform's job.
 */
export function PostLoadScreen({ onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();

  const [corridorIndex, setCorridorIndex] = useState(2);
  const [weightText, setWeightText] = useState('26');
  const [cargo, setCargo] = useState('Cement');

  const corridor = CORRIDORS[corridorIndex] ?? CORRIDORS[0];

  // A half-typed number is not a weight. `Number('')` is 0, which would silently
  // pick a pickup for an empty field.
  const weight = Number.parseFloat(weightText);
  const validWeight = Number.isFinite(weight) && weight > 0;
  const truck: TruckClass | null = validWeight ? smallestClassFor(weight) : null;

  const estimate = useMemo(
    () => (truck === null || corridor === undefined ? null : quote(truck, corridor.metres)),
    [truck, corridor],
  );

  const tooHeavy = validWeight && truck === null;

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title="Post a load" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Card overline="Route" icon="route">
          <View style={styles.chips}>
            {CORRIDORS.map((option, i) => {
              const selected = i === corridorIndex;
              return (
                <Press
                  key={`${option.from}-${option.to}`}
                  onPress={() => setCorridorIndex(i)}
                  accessibilityLabel={`${option.from} to ${option.to}`}
                  feedback="opacity"
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colours.accentWash : colours.surface,
                      borderColor: selected ? colours.accent : colours.outline,
                    },
                  ]}
                >
                  <Text variant="label" tone={selected ? 'accent' : 'secondary'}>
                    {option.from} → {option.to}
                  </Text>
                </Press>
              );
            })}
          </View>
          <Text variant="label" tone="secondary" style={styles.gap}>
            {Math.round((corridor?.metres ?? 0) / 1000)} km by road
          </Text>
        </Card>

        <Card overline="Cargo" icon="package">
          {/* A visible label, not a placeholder. A placeholder disappears the
              moment somebody types, taking the question with it. */}
          <Text variant="label" tone="secondary">
            WHAT IS IT
          </Text>
          <TextInput
            value={cargo}
            onChangeText={setCargo}
            accessibilityLabel="What the cargo is"
            style={[
              styles.input,
              { borderColor: colours.outline, color: colours.textPrimary },
            ]}
            placeholderTextColor={colours.textSecondary}
          />

          <Text variant="label" tone="secondary" style={styles.gap}>
            HOW HEAVY, IN TONNES
          </Text>
          <TextInput
            value={weightText}
            onChangeText={setWeightText}
            keyboardType="decimal-pad"
            accessibilityLabel="Weight in tonnes"
            style={[
              styles.input,
              {
                borderColor: tooHeavy ? colours.exception : colours.outline,
                color: colours.textPrimary,
              },
            ]}
          />

          {tooHeavy ? (
            // The error says what to do about it, not just that something is
            // wrong. Every error path in this product has a forward path.
            <View style={styles.errorRow}>
              <Icon name="alert" size="sm" colour={colours.exception} />
              <Text variant="body" tone="exception" style={styles.flex}>
                Nothing on Backhaul carries more than {CAPACITY.lowbed} tonnes in
                one load. Split it, or post it as two.
              </Text>
            </View>
          ) : truck !== null ? (
            <View style={styles.errorRow}>
              <Icon name="truck" size="sm" colour={colours.textSecondary} />
              <Text variant="body" tone="secondary" style={styles.flex}>
                Needs a {truck.replace(/_/g, ' ')} — the smallest truck that
                carries it.
              </Text>
            </View>
          ) : null}
        </Card>

        {estimate !== null ? (
          <Card overline="What it should cost" icon="naira" emphasis="accent">
            {/*
              Stacked, not "low – high" on one line. Two seven-figure naira
              amounts and a dash are about 24 characters at 36pt, which
              overflows a phone and was truncating mid-figure.
            */}
            <Text variant="display">{format(estimate.low)}</Text>
            <View style={styles.toRow}>
              <Text variant="title" tone="secondary">
                to
              </Text>
              <Text variant="headline">{format(estimate.high)}</Text>
            </View>
            <Text variant="body" tone="secondary" style={styles.gap}>
              {estimate.basis}
            </Text>
            {/*
              `isIndicative` is on the result so no screen can render the figure
              without it. This is the sentence that keeps it honest.
            */}
            <Text variant="label" tone="stale" style={styles.gap}>
              Indicative only. Rates move with diesel, with the season, and with
              which way the truck is already going.
            </Text>
          </Card>
        ) : null}

        <Press
          onPress={() => {}}
          accessibilityLabel="Post this load"
          accessibilityHint="Opens it to bids from verified carriers"
          disabled={estimate === null || cargo.trim() === ''}
          style={[styles.post, { backgroundColor: colours.accent }]}
        >
          <Text variant="title" style={{ color: colours.onAccent }}>
            Post it for bids
          </Text>
        </Press>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  flex: { flex: 1 },
  gap: { marginTop: space.sm },
  toRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  input: {
    minHeight: target.standard,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
    marginTop: space.xs,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.md,
  },
  post: {
    minHeight: target.standard + 4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
});

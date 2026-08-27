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
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { newId } from '../state/ids';

interface Props {
  readonly onBack: () => void;
}

/** Corridors a shipper picks from, with the road distance somebody would drive. */
/**
 * The corridors this screen offers, with where each end is.
 *
 * The coordinates are here because a posted load carries them: "going your
 * way" is a claim about where a load starts and ends, and a board entry
 * without them cannot be ranked, priced or drawn. Five corridors rather than a
 * map, because a shipper posting from an office types a route they run rather
 * than dropping a pin.
 */
const CORRIDORS: readonly {
  from: string;
  to: string;
  metres: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}[] = [
  { from: 'Lagos', to: 'Ibadan', metres: 130_000, fromLat: 6.4531, fromLon: 3.3958, toLat: 7.3775, toLon: 3.947 },
  { from: 'Lagos', to: 'Abuja', metres: 750_000, fromLat: 6.4531, fromLon: 3.3958, toLat: 9.0765, toLon: 7.3986 },
  { from: 'Lagos', to: 'Kano', metres: 1_000_000, fromLat: 6.4531, fromLon: 3.3958, toLat: 12.0022, toLon: 8.5919 },
  { from: 'Port Harcourt', to: 'Abuja', metres: 620_000, fromLat: 4.8156, fromLon: 7.0498, toLat: 9.0765, toLon: 7.3986 },
  { from: 'Kano', to: 'Lagos', metres: 1_000_000, fromLat: 12.0022, fromLon: 8.5919, toLat: 6.4531, toLon: 3.3958 },
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
  const { t } = useLanguage();
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

  const { api } = useSession();
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [failed, setFailed] = useState(false);

  /*
    Posted only once the server has it.

    A load that reads "Posted" and is not on the board is a shipper waiting for
    bids that cannot arrive, and they will not find out until they wonder why
    it has been quiet.

    Ready in an hour and open for two days. Both are defaults a posting screen
    has to pick, and neither is a rule — the moment a shipper needs to say
    "Thursday" this becomes a field.
  */
  const post = () => {
    if (truck === null || corridor === undefined || posting) return;

    setPosting(true);
    setFailed(false);

    const now = Date.now();

    void api
      .postLoad(newId(), {
        originName: corridor.from,
        destinationName: corridor.to,
        originLat: corridor.fromLat,
        originLon: corridor.fromLon,
        destinationLat: corridor.toLat,
        destinationLon: corridor.toLon,
        cargo,
        weightTonnes: weight,
        requires: truck,
        offeredKobo: estimate?.mid ?? null,
        readyBy: new Date(now + 3_600_000),
        expiresAt: new Date(now + 2 * 86_400_000),
      })
      .then((result) => {
        setPosting(false);
        if (result.ok) setPosted(true);
        else setFailed(true);
      });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScreenHeader title={t('post_a_load')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Card overline={t('the_route')} icon="route">
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

        <Card overline={t('the_cargo')} icon="package">
          {/* A visible label, not a placeholder. A placeholder disappears the
              moment somebody types, taking the question with it. */}
          <Text variant="label" tone="secondary">
            {t('what_is_it').toUpperCase()}
          </Text>
          <TextInput
            value={cargo}
            onChangeText={setCargo}
            accessibilityLabel={t('what_the_cargo_is')}
            style={[
              styles.input,
              { borderColor: colours.outline, color: colours.textPrimary },
            ]}
            placeholderTextColor={colours.textSecondary}
          />

          <Text variant="label" tone="secondary" style={styles.gap}>
            {t('how_heavy_in_tonnes').toUpperCase()}
          </Text>
          <TextInput
            value={weightText}
            onChangeText={setWeightText}
            keyboardType="decimal-pad"
            accessibilityLabel={t('weight_in_tonnes')}
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
          <Card overline={t('what_it_should_cost')} icon="naira" emphasis="accent">
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
              {t('indicative_only')}
            </Text>
          </Card>
        ) : null}

        {failed ? (
          <Text variant="label" tone="exception">
            {t('not_posted')}
          </Text>
        ) : null}

        <Press
          onPress={post}
          accessibilityLabel={t('post_this_load')}
          accessibilityHint={t('opens_to_bids')}
          disabled={estimate === null || cargo.trim() === '' || posting || posted}
          style={[styles.post, { backgroundColor: colours.accent }]}
        >
          <Text variant="title" style={{ color: colours.onAccent }}>
            {posted ? t('posted') : posting ? t('posting') : t('post_this_load')}
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

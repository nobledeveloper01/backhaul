import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { Text } from './Text';
import { space } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';

export interface Series {
  /** One value per step. Nulls are gaps, and are drawn as gaps. */
  readonly values: readonly (number | null)[];
  readonly label: string;
  /** Rendered under the peak, e.g. "km/h". */
  readonly unit: string;
}

interface Props {
  readonly series: Series;
  readonly height?: number;
}

/**
 * A small line chart, drawn by hand.
 *
 * No charting library. The requirement is one series over time on a phone, and
 * every library that does that also does forty other things and brings a
 * megabyte of them to a handset with 2 GB of memory.
 *
 * **A gap is drawn as a gap.** A null in the series means no data — a stretch
 * with no signal — and the line stops and restarts. Interpolating across it
 * would draw a confident straight line through exactly the part of the trip
 * nobody can account for, which is the same failure as inventing a position.
 */
export function Sparkline({ series, height = 72 }: Props) {
  const colours = useColours();
  const { t } = useLanguage();

  const width = 300;
  const pad = 6;
  const values = series.values;

  const present = values.filter((v): v is number => v !== null);
  const peak = present.length === 0 ? 0 : Math.max(...present);
  const floor = present.length === 0 ? 0 : Math.min(...present);
  // A flat series would divide by zero and collapse to the top edge.
  const span = peak - floor === 0 ? 1 : peak - floor;

  const x = (i: number) =>
    values.length <= 1 ? pad : pad + ((width - pad * 2) * i) / (values.length - 1);
  const y = (v: number) =>
    height - pad - ((height - pad * 2) * (v - floor)) / span;

  // Broken into runs so a gap is a gap rather than a line across one.
  const runs: string[] = [];
  let current = '';
  values.forEach((value, i) => {
    if (value === null) {
      if (current !== '') runs.push(current);
      current = '';
      return;
    }
    current += `${current === '' ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(value).toFixed(1)} `;
  });
  if (current !== '') runs.push(current);

  const gaps: { from: number; to: number }[] = [];
  let gapStart: number | null = null;
  values.forEach((value, i) => {
    if (value === null && gapStart === null) gapStart = i;
    if (value !== null && gapStart !== null) {
      gaps.push({ from: x(gapStart), to: x(i) });
      gapStart = null;
    }
  });
  if (gapStart !== null) gaps.push({ from: x(gapStart), to: x(values.length - 1) });

  const lastIndex = lastPresent(values);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Where data is missing, shaded — before the line, so it sits behind. */}
        {gaps.map((gap, i) => (
          <Rect
            key={`gap-${i}`}
            x={gap.from}
            y={pad}
            width={Math.max(2, gap.to - gap.from)}
            height={height - pad * 2}
            fill={colours.staleWash}
          />
        ))}

        <Line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke={colours.outline}
          strokeWidth={1}
        />

        {runs.map((d, i) => (
          <Path
            key={`run-${i}`}
            d={d}
            stroke={colours.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}

        {lastIndex !== null ? (
          <Circle
            cx={x(lastIndex)}
            cy={y(values[lastIndex] as number)}
            r={3.5}
            fill={colours.accent}
          />
        ) : null}
      </Svg>

      <View style={styles.caption}>
        <Text variant="label" tone="secondary">
          {series.label}
        </Text>
        <Text variant="label" tone="secondary" tabular>
          {present.length === 0 ? '—' : `${Math.round(peak)} ${series.unit} · ${t('peak')}`}
        </Text>
      </View>

      {gaps.length > 0 ? (
        <Text variant="label" tone="stale" style={styles.note}>
          {t('shaded_no_signal')}
        </Text>
      ) : null}
    </View>
  );
}

function lastPresent(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && values[i] !== undefined) return i;
  }
  return null;
}

const styles = StyleSheet.create({
  caption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
    gap: space.md,
  },
  note: { marginTop: space.xs },
});

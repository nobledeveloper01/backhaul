import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { CleanedTrack, Position } from '@backhaul/domain';
import { distance } from '@backhaul/domain';

import { Text } from './Text';
import { space } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly origin: Position;
  readonly destination: Position;
  readonly track: CleanedTrack;
  readonly originName: string;
  readonly destinationName: string;
}

/**
 * Where the truck is on the corridor.
 *
 * **This is not a map, and it is not pretending to be one.** A tile map is
 * phase 2 and needs a tile budget and a native SDK. What a shipper actually
 * asks is "how far along, and is it moving?", and a corridor drawn to scale
 * answers that on a 2 GB handset with no tiles to download over a connection
 * that is already the problem.
 *
 * Progress is **measured distance along the track**, not the straight line to
 * the destination — a detour a driver was made to take is distance they drove,
 * and a bar that goes backwards when a truck rounds a hill is a bar nobody
 * trusts twice.
 */
export function Corridor({ origin, destination, track, originName, destinationName }: Props) {
  const colours = useColours();

  const total = distance(origin, destination);
  const travelled = travelledAlong(track);
  const fraction = total === 0 ? 0 : Math.min(1, travelled / total);

  const width = 300;
  const y = 34;
  const left = 14;
  const right = width - 14;
  const x = left + (right - left) * fraction;

  // Gaps in the track, drawn where they happened rather than summarised
  // underneath. A shipper looking at a long unexplained stretch is asking
  // where it was, and the answer is a position on this line.
  const gaps = gapsAlong(track, total, left, right);

  return (
    <View>
      <Svg width="100%" height={68} viewBox={`0 0 ${width} 68`}>
        <Line x1={left} y1={y} x2={right} y2={y} stroke={colours.outline} strokeWidth={6} strokeLinecap="round" />
        <Line x1={left} y1={y} x2={x} y2={y} stroke={colours.moving} strokeWidth={6} strokeLinecap="round" />

        {gaps.map((gap, i) => (
          <Rect
            key={`gap-${i}`}
            x={gap.from}
            y={y - 3}
            width={Math.max(2, gap.to - gap.from)}
            height={6}
            fill={colours.stale}
            rx={3}
          />
        ))}

        <Circle cx={left} cy={y} r={5} fill={colours.textSecondary} />
        <Circle cx={right} cy={y} r={5} fill={colours.textSecondary} />

        <Circle cx={x} cy={y} r={10} fill={colours.surface} stroke={colours.moving} strokeWidth={3} />
        <Path
          d={`M ${x - 4} ${y} h 8 M ${x} ${y - 4} v 8`}
          stroke={colours.moving}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>

      <View style={styles.ends}>
        <View style={styles.end}>
          <Text variant="label" tone="secondary">{originName}</Text>
        </View>
        <View style={styles.middle}>
          <Text variant="label" tone="secondary" tabular>
            {Math.round(travelled / 1000)} of {Math.round(total / 1000)} km
          </Text>
        </View>
        <View style={styles.endRight}>
          <Text variant="label" tone="secondary">{destinationName}</Text>
        </View>
      </View>

      {gaps.length > 0 ? (
        <Text variant="label" tone="stale" style={styles.note}>
          {gaps.length === 1 ? '1 stretch' : `${gaps.length} stretches`} with no signal, marked in grey
        </Text>
      ) : null}
    </View>
  );
}

function travelledAlong(track: CleanedTrack): number {
  let total = 0;
  for (let i = 1; i < track.kept.length; i++) {
    const from = track.kept[i - 1];
    const to = track.kept[i];
    if (from === undefined || to === undefined) continue;
    total += distance(from, to);
  }
  return total;
}

/** A gap is a stretch where the fixes stopped for longer than the policy allows. */
const GAP_MS = 20 * 60_000;

function gapsAlong(
  track: CleanedTrack,
  total: number,
  left: number,
  right: number,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  if (total === 0) return out;

  let along = 0;
  for (let i = 1; i < track.kept.length; i++) {
    const from = track.kept[i - 1];
    const to = track.kept[i];
    if (from === undefined || to === undefined) continue;

    const leg = distance(from, to);
    const silence = to.at.getTime() - from.at.getTime();

    if (silence >= GAP_MS) {
      const startFraction = Math.min(1, along / total);
      const endFraction = Math.min(1, (along + leg) / total);
      out.push({
        from: left + (right - left) * startFraction,
        to: left + (right - left) * endFraction,
      });
    }
    along += leg;
  }
  return out;
}

const styles = StyleSheet.create({
  ends: { flexDirection: 'row', alignItems: 'center', marginTop: space.xs },
  end: { flex: 1, alignItems: 'flex-start' },
  middle: { flex: 1, alignItems: 'center' },
  endRight: { flex: 1, alignItems: 'flex-end' },
  note: { marginTop: space.sm },
});

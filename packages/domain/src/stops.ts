/**
 * Where the truck stopped, and for how long.
 *
 * A stop is what a demurrage claim is made of, what a shipper asks about when a
 * trip runs late, and what distinguishes "the driver was held at a depot" from
 * "the driver went home for the night". None of that is answerable from a list
 * of coordinates, so it is computed once, here, from a cleaned track.
 *
 * Deliberately *not* the same thing as `observe()`. That answers "what is the
 * truck doing right now" from the last few fixes; this reads a whole trip
 * afterwards and returns every stop in it.
 */

import { distance, type Metres, type Position } from './geo.ts';
import { STALL_RADIUS_M } from './tracking.ts';

export interface Stop {
  readonly from: Date;
  readonly to: Date;
  readonly durationMs: number;
  /** The centre of the fixes that make up the stop. */
  readonly at: Position;
  /** How many fixes were taken while stopped. */
  readonly fixes: number;
  /**
   * True when the stop is bounded by the end of the track rather than by the
   * truck moving off.
   *
   * An open stop is still happening, or the trip ended in it. Its duration is a
   * lower bound, and a screen that renders it as a finished stop is claiming
   * the truck moved when nothing says it did.
   */
  readonly openEnded: boolean;
}

/**
 * The least time a cluster must last to count as a stop.
 *
 * Ten minutes. Shorter than the forty-five that makes a *stall*, because a
 * stall is an alarm and a stop is a fact — a fuel stop, a checkpoint and a
 * meal are all worth showing on a trip's history, and none of them is worth
 * waking a shipper for.
 *
 * Below ten minutes a "stop" is traffic, and a trip through Lagos would be
 * nothing but stops.
 */
export const MINIMUM_STOP_MS = 10 * 60_000;

/**
 * Every stop in a track.
 *
 * A stop is a run of consecutive fixes that all sit within `STALL_RADIUS_M` of
 * the first one — the same radius the live observation uses, so a truck that is
 * "stopped" on the driver's screen is in a stop on the trip's history rather
 * than in some second, slightly different category.
 *
 * The track must be cleaned first. Feeding raw fixes here invents stops
 * wherever the phone reported a bad position twice.
 */
export function stops(track: readonly Position[]): readonly Stop[] {
  const found: Stop[] = [];

  let anchorIndex = 0;
  while (anchorIndex < track.length) {
    const anchor = track[anchorIndex];
    if (anchor === undefined) break;

    let end = anchorIndex;
    for (let i = anchorIndex + 1; i < track.length; i++) {
      const fix = track[i];
      if (fix === undefined) break;
      if (distance(anchor, fix) > STALL_RADIUS_M) break;
      end = i;
    }

    const last = track[end];
    if (last !== undefined && end > anchorIndex) {
      const durationMs = last.at.getTime() - anchor.at.getTime();
      if (durationMs >= MINIMUM_STOP_MS) {
        found.push({
          from: anchor.at,
          to: last.at,
          durationMs,
          at: centre(track.slice(anchorIndex, end + 1)) ?? anchor,
          fixes: end - anchorIndex + 1,
          openEnded: end === track.length - 1,
        });
      }
    }

    // Resume *after* the cluster, not one past the anchor. Advancing by one
    // would find the same stop again from every fix inside it.
    anchorIndex = end > anchorIndex ? end + 1 : anchorIndex + 1;
  }

  return found;
}

/** Total time stopped, across every stop. */
export function timeStopped(all: readonly Stop[]): number {
  return all.reduce((total, stop) => total + stop.durationMs, 0);
}

/** The longest stop, or null when the truck never stopped. */
export function longest(all: readonly Stop[]): Stop | null {
  let worst: Stop | null = null;
  for (const stop of all) {
    if (worst === null || stop.durationMs > worst.durationMs) {
      worst = stop;
    }
  }
  return worst;
}

/**
 * A stop's position, averaged over its fixes.
 *
 * A plain mean of latitude and longitude. Correct enough over the couple of
 * hundred metres a stop spans, and wrong near the poles and the date line —
 * neither of which is on a Nigerian corridor, and both of which are called out
 * here so nobody reuses this for a route.
 */
function centre(cluster: readonly Position[]): Position | null {
  if (cluster.length === 0) return null;

  let lat = 0;
  let lon = 0;
  let accuracy = 0;
  for (const fix of cluster) {
    lat += fix.lat;
    lon += fix.lon;
    accuracy += fix.accuracy;
  }

  const first = cluster[0];
  if (first === undefined) return null;

  return {
    lat: lat / cluster.length,
    lon: lon / cluster.length,
    accuracy: accuracy / cluster.length,
    at: first.at,
  };
}

/** Distance between two stops, for a screen that lists them in order. */
export function between(a: Stop, b: Stop): Metres {
  return distance(a.at, b.at);
}

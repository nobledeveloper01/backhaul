/**
 * Places a trip is meant to pass through, and whether it did.
 *
 * A geofence answers the question that separates "the truck is stopped" from
 * "the truck is stopped *at the depot*" — and that difference is the whole
 * gap between an alert worth sending and one that fires on every scheduled
 * stop. `observe()` already takes an `atWaypoint` flag; this is what decides
 * what to pass it.
 *
 * It also decides when demurrage starts, which makes it the most financially
 * consequential arithmetic in the product after settlement.
 */

import { distance, type Metres, type Position } from './geo.ts';

export type WaypointKind = 'origin' | 'destination' | 'checkpoint' | 'rest';

export interface Waypoint {
  readonly id: string;
  readonly name: string;
  readonly at: Position;
  readonly kind: WaypointKind;
  /**
   * How close counts as "there".
   *
   * Per waypoint, not global: a depot yard is a couple of hundred metres and a
   * border post is a queue that can stretch for two kilometres.
   */
  readonly radius: Metres;
}

/**
 * The smallest radius worth setting.
 *
 * Below this, a fix's own uncertainty is larger than the fence, so arrival
 * would depend on which way the phone happened to be wrong. 150 m is roughly
 * one and a half times the accuracy floor.
 */
export const MINIMUM_RADIUS_M = 150;

export interface Visit {
  readonly waypoint: Waypoint;
  readonly arrived: Date;
  /** Null while the truck is still inside the fence. */
  readonly left: Date | null;
  readonly durationMs: number;
  /** Fixes recorded inside the fence. */
  readonly fixes: number;
}

/**
 * Whether a fix is inside a fence.
 *
 * The fix's own accuracy widens the fence, for the same reason `isWithin`
 * does: a truck reported 190 m from a gate by a fix accurate to ±90 m may well
 * be in the yard, and refusing to admit arrival on that basis strands a driver
 * at a barrier while demurrage runs.
 */
export function inside(fix: Position, waypoint: Waypoint): boolean {
  return distance(fix, waypoint.at) <= waypoint.radius + fix.accuracy;
}

/**
 * Every visit to every waypoint, in the order they happened.
 *
 * A truck that leaves and comes back — around a block, out of a queue and in
 * again — records two visits rather than one long one. Merging them would
 * inflate a demurrage claim, and the two are distinguishable from the track.
 *
 * The track must be cleaned first: a single bad fix inside a fence would
 * otherwise be an arrival, and a bad fix outside one a departure.
 */
export function visits(
  track: readonly Position[],
  waypoints: readonly Waypoint[],
): readonly Visit[] {
  const found: Visit[] = [];

  for (const waypoint of waypoints) {
    let arrivedAt: Date | null = null;
    let lastInside: Date | null = null;
    let fixes = 0;

    for (const fix of track) {
      if (inside(fix, waypoint)) {
        if (arrivedAt === null) {
          arrivedAt = fix.at;
          fixes = 0;
        }
        lastInside = fix.at;
        fixes++;
        continue;
      }

      if (arrivedAt !== null && lastInside !== null) {
        found.push({
          waypoint,
          arrived: arrivedAt,
          left: fix.at,
          // Measured to the first fix *outside*, not to the last one inside:
          // the truck was still there for some part of the gap between them,
          // and a demurrage claim should not lose that on a rounding.
          durationMs: fix.at.getTime() - arrivedAt.getTime(),
          fixes,
        });
        arrivedAt = null;
        lastInside = null;
        fixes = 0;
      }
    }

    // Still inside when the track ends.
    if (arrivedAt !== null && lastInside !== null) {
      found.push({
        waypoint,
        arrived: arrivedAt,
        left: null,
        durationMs: lastInside.getTime() - arrivedAt.getTime(),
        fixes,
      });
    }
  }

  return [...found].sort((a, b) => a.arrived.getTime() - b.arrived.getTime());
}

/**
 * Whether the truck is at a waypoint right now.
 *
 * What gets passed to `observe()` as `atWaypoint`. A truck parked for six
 * hours at the depot it was told to load at is waiting, not stalled, and this
 * is the only thing that knows the difference.
 */
export function atWaypointNow(
  recent: readonly Position[],
  waypoints: readonly Waypoint[],
): Waypoint | null {
  const last = recent.at(-1);
  if (last === undefined) return null;
  return waypoints.find((waypoint) => inside(last, waypoint)) ?? null;
}

/**
 * Waiting time that counts toward demurrage.
 *
 * Only at the origin and the destination. A queue at a checkpoint is nobody's
 * fault and nobody's bill; time held at a depot is exactly what demurrage is
 * for, and the distinction has to live somewhere a screen cannot fudge.
 */
export function chargeableWaiting(all: readonly Visit[]): number {
  return all
    .filter(
      (visit) =>
        visit.waypoint.kind === 'origin' || visit.waypoint.kind === 'destination',
    )
    .reduce((total, visit) => total + visit.durationMs, 0);
}

/** Waypoints the trip has not reached yet, in the order given. */
export function remaining(
  all: readonly Visit[],
  waypoints: readonly Waypoint[],
): readonly Waypoint[] {
  const seen = new Set(all.map((visit) => visit.waypoint.id));
  return waypoints.filter((waypoint) => !seen.has(waypoint.id));
}

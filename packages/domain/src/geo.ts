/**
 * Positions, distances, and what a fix is worth.
 *
 * Everything here is pure arithmetic over a `Position`. Nothing in this file
 * knows that a phone exists — the native tracking module produces `Position`
 * values and this decides what they mean, which is what keeps the meaning
 * testable without a truck.
 */

/** Metres. Distances are integers because nothing downstream needs a fraction
 * of a metre and floats accumulate. */
export type Metres = number;

export interface Position {
  readonly lat: number;
  readonly lon: number;
  /** Metres of horizontal uncertainty as reported by the OS. */
  readonly accuracy: Metres;
  readonly at: Date;
  /** Metres per second, when the OS supplies it. */
  readonly speed?: number;
  /** Battery at the moment of the fix, 0–1. Carried because a trip that goes
   * dark at 3% is a flat phone, not a driver hiding, and the difference
   * decides whether anyone gets accused of anything. */
  readonly battery?: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Haversine, not the flat-earth approximation. The approximation is faster and
 * fine over a city, and Lagos to Maiduguri is 1,600 km — far enough that its
 * error is measured in kilometres, and kilometres are what a haulage rate is
 * multiplied by.
 */
export function distance(a: Position, b: Position): Metres {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Total length of a path, in metres. */
export function pathLength(path: readonly Position[]): Metres {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    if (from === undefined || to === undefined) continue;
    total += distance(from, to);
  }
  return total;
}

/**
 * Why a fix should not be trusted.
 *
 * Named rather than boolean, because the UI says different things for each and
 * a dispute pack has to print the reason beside the excluded fix.
 */
export type FixProblem =
  /** The OS itself says it does not know where the phone is. */
  | 'too_imprecise'
  /** Dated before the fix preceding it. */
  | 'out_of_order'
  /** Implies a speed no truck reaches — usually a cell-tower fix snapping
   * across a state line. */
  | 'implausible_jump';

/**
 * Beyond this, a fix says nothing useful about which road a truck is on.
 *
 * 100 m is a generous floor deliberately: on a highway with no buildings a
 * phone often reports 40–80 m, and rejecting those would throw away most of
 * the trip to gain precision nobody is using. It is the difference between a
 * useful fix and a wrong one, not between a good fix and a better one.
 */
export const MAX_USEFUL_ACCURACY_M = 100;

/**
 * The fastest a loaded truck plausibly moves, in metres per second.
 *
 * 45 m/s is 162 km/h. No loaded trailer does that on a Nigerian highway, so
 * anything above it is a bad fix rather than a fast truck. Set well above the
 * real ceiling on purpose: excluding a genuine fix loses evidence, while
 * admitting a rare bad one is visible as a spike anyone can see.
 */
export const MAX_PLAUSIBLE_SPEED_MS = 45;

/**
 * Checks a fix against the one before it.
 *
 * Returns null when the fix is usable. The previous fix may be absent — the
 * first fix of a trip has nothing to be implausible against, and is judged on
 * accuracy alone.
 */
export function problemWith(
  fix: Position,
  previous: Position | undefined,
): FixProblem | null {
  if (!Number.isFinite(fix.accuracy) || fix.accuracy > MAX_USEFUL_ACCURACY_M) {
    return 'too_imprecise';
  }
  if (previous === undefined) return null;

  const seconds = (fix.at.getTime() - previous.at.getTime()) / 1000;
  if (seconds < 0) return 'out_of_order';
  if (seconds === 0) {
    // Same instant, different place. Distinguishable from a duplicate only by
    // the distance, and a duplicate is not a problem.
    return distance(previous, fix) > MAX_USEFUL_ACCURACY_M
      ? 'implausible_jump'
      : null;
  }

  // The jump has to clear the combined uncertainty of both fixes before it
  // counts as movement at all. Two 90 m fixes of a parked truck can otherwise
  // read as 180 m of travel.
  const moved = distance(previous, fix);
  const slack = previous.accuracy + fix.accuracy;
  if (moved <= slack) return null;

  return (moved - slack) / seconds > MAX_PLAUSIBLE_SPEED_MS
    ? 'implausible_jump'
    : null;
}

export interface CleanedTrack {
  readonly kept: readonly Position[];
  readonly dropped: readonly { readonly fix: Position; readonly problem: FixProblem }[];
}

/**
 * Filters a raw track, keeping what was dropped and why.
 *
 * The dropped fixes are returned rather than discarded because a driver whose
 * distance is disputed is owed the answer to "what did you throw away?", and
 * because a track that is 40% dropped is a broken phone that somebody should
 * be told about rather than a quietly shorter trip.
 *
 * A dropped fix is not used as the baseline for the next one. Otherwise a
 * single cell-tower fix 300 km away makes the *next* good fix look like an
 * implausible jump too, and one bad reading takes the rest of the leg with it.
 */
export function clean(raw: readonly Position[]): CleanedTrack {
  const kept: Position[] = [];
  const dropped: { fix: Position; problem: FixProblem }[] = [];

  for (const fix of raw) {
    const problem = problemWith(fix, kept.at(-1));
    if (problem === null) kept.push(fix);
    else dropped.push({ fix, problem });
  }

  return { kept, dropped };
}

/**
 * Distance actually covered, from a cleaned track.
 *
 * This is the figure a per-kilometre rate multiplies, so it is deliberately
 * the *measured* path and never the straight line between origin and
 * destination. A detour a driver was made to take is distance they drove.
 */
export function distanceTravelled(track: CleanedTrack): Metres {
  return pathLength(track.kept);
}

/**
 * How much of the track survived cleaning, 0–1.
 *
 * Reported alongside every figure derived from a track, for the same reason
 * Grid reports supply coverage: a distance computed from 30% of the fixes is
 * not wrong, but nobody should be shown it without knowing that.
 */
export function fixQuality(track: CleanedTrack): number {
  const total = track.kept.length + track.dropped.length;
  if (total === 0) return 0;
  return track.kept.length / total;
}

/** Whether a position is within `radius` metres of a point. */
export function isWithin(fix: Position, of: Position, radius: Metres): boolean {
  // Compared against the radius plus the fix's own uncertainty: a truck
  // reported 90 m away by a fix accurate to ±90 m may well be in the yard,
  // and refusing to admit arrival on that basis strands the driver.
  return distance(fix, of) <= radius + fix.accuracy;
}

/**
 * Is the truck going somewhere it should not be?
 *
 * The obvious implementation is cross-track distance: draw a line from origin
 * to destination and measure how far the truck is from it. **That is wrong
 * here, and wrong in a way that would have shipped.** The straight line from
 * Lagos to Kano runs through Kwara farmland; the road goes Ibadan–Ilorin–
 * Jebba–Mokwa–Tegina–Kaduna and is up to 90 km off that line for hours at a
 * time. A cross-track alarm would fire on every trip that went the right way,
 * and an alarm that fires on every trip is an alarm nobody reads.
 *
 * The honest signal without a corpus of real routes is **progress**: a truck
 * that has been getting further from its destination for long enough, while
 * moving, is going somewhere else. That is true whatever road it is on, and it
 * is the thing a shipper actually wants to be told.
 *
 * When a route *is* declared as waypoints, `offRoute` can say more — but it
 * measures against the declared points, never against a line nobody drives.
 */

import { distance, type Metres, type Position } from './geo.ts';
import { inside, type Waypoint } from './waypoints.ts';

/**
 * How much further away it has to get before that means anything.
 *
 * 25 km. Smaller than a wrong turn that matters and larger than every legitimate
 * loop this corridor makes — the Lokoja bypass, the Jebba bridge approach, and
 * every diversion around a broken-down trailer.
 */
export const DEVIATION_M: Metres = 25_000;

/**
 * How long it has to keep doing it.
 *
 * Ninety minutes. Long enough that a detour around a flooded stretch has
 * rejoined by the time it would fire, short enough that a hijacked truck is
 * reported while it is still findable.
 */
export const DEVIATION_WINDOW_MS = 90 * 60_000;

export type DeviationVerdict =
  | { readonly kind: 'on_course' }
  /** Not enough track to say anything. Not the same as "on course". */
  | { readonly kind: 'unknown'; readonly detail: string }
  | {
      readonly kind: 'deviating';
      /** How much further from the destination than at the start of the window. */
      readonly furtherM: Metres;
      readonly sinceMs: number;
      readonly detail: string;
    };

/**
 * Whether the truck has been moving away from where it is going.
 *
 * Compares the current distance-to-destination against the smallest it has been
 * inside the window. The *smallest*, not the first: a truck that closed on the
 * destination and then turned around has deviated by the amount it has given
 * back, and measuring from the window's first fix would let a turn hide behind
 * whatever progress preceded it.
 */
export function deviation(
  track: readonly Position[],
  destination: Position,
  now: Date,
): DeviationVerdict {
  const window = track.filter(
    (fix) => now.getTime() - fix.at.getTime() <= DEVIATION_WINDOW_MS,
  );

  const latest = window.at(-1);
  const first = window[0];

  if (latest === undefined || first === undefined) {
    return { kind: 'unknown', detail: 'No positions in the last hour and a half.' };
  }

  // Two fixes ninety minutes apart is a coverage gap, not a course. Calling
  // that a deviation would turn a dead zone into an accusation.
  if (window.length < 4) {
    return {
      kind: 'unknown',
      detail: 'Too few positions to say which way it is heading.',
    };
  }

  const spanned = latest.at.getTime() - first.at.getTime();
  if (spanned < DEVIATION_WINDOW_MS / 2) {
    return { kind: 'unknown', detail: 'Not enough of the window is covered yet.' };
  }

  const closest = Math.min(...window.map((fix) => distance(fix, destination)));
  const nowAway = distance(latest, destination);
  const further = nowAway - closest;

  if (further < DEVIATION_M) {
    return { kind: 'on_course' };
  }

  return {
    kind: 'deviating',
    furtherM: further,
    sinceMs: spanned,
    detail:
      `${Math.round(further / 1_000)} km further from the destination than it was, ` +
      'and still going.',
  };
}

/**
 * Whether the truck is anywhere near a declared route.
 *
 * Only meaningful when somebody actually declared one. Measures to the nearest
 * waypoint rather than to a line between them, for the same reason as above:
 * the line is not the road.
 *
 * `null` when there is no route to be off — which is different from being on
 * one, and the caller has to say so rather than rendering a reassuring tick.
 */
export function offRoute(
  fix: Position,
  route: readonly Waypoint[],
  tolerance: Metres = DEVIATION_M,
): boolean | null {
  if (route.length === 0) return null;

  const nearest = Math.min(...route.map((waypoint) => distance(fix, waypoint.at)));
  const atOne = route.some((waypoint) => inside(fix, waypoint));

  return !atOne && nearest > tolerance;
}

/**
 * The next waypoint the truck should be heading for.
 *
 * The first one it has not reached, in the order given. Used to say "expected
 * at the weighbridge" rather than "expected somewhere", which is the difference
 * between an alert somebody can act on and one they can only worry about.
 */
export function heading(
  visited: readonly string[],
  route: readonly Waypoint[],
): Waypoint | null {
  return route.find((waypoint) => !visited.includes(waypoint.id)) ?? null;
}

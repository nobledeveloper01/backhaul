/**
 * What the driver was actually paid.
 *
 * A driver's relationship with this product is asymmetric: they carry the
 * tracking, they take the risk on the road, and until now the app told them
 * nothing they could use. A statement they can hold up — this many trips, this
 * many kilometres, this much paid, this much still owed for what I spent at
 * checkpoints — is the first thing here that is *for them*.
 *
 * It is also the quietest retention feature in the product. A driver who can
 * see their own record is a driver who does not force-quit the tracker.
 */

import { add, subtract, type Kobo } from './money.ts';
import type { Metres } from './geo.ts';

export interface Earning {
  readonly tripId: string;
  readonly corridor: string;
  readonly deliveredAt: Date;
  readonly distanceM: Metres;
  /** The driver's own pay for the trip. Not the fare. */
  readonly pay: Kobo;
  /** Advanced before the trip, against expenses. */
  readonly advance: Kobo;
  /** What they spent on the road, from `levies.ts`. */
  readonly spent: Kobo;
  /** Settled, or still owed. */
  readonly paidAt: Date | null;
}

export interface Statement {
  readonly from: Date;
  readonly to: Date;
  readonly trips: number;
  readonly distanceM: Metres;
  readonly earned: Kobo;
  /** Out of pocket: what they spent beyond what they were advanced. */
  readonly outOfPocket: Kobo;
  /** Earned plus out-of-pocket, minus what has been settled. */
  readonly outstanding: Kobo;
  readonly settled: Kobo;
}

/**
 * A statement over a window.
 *
 * The window is passed in rather than derived from the data: "this month" is a
 * question about a calendar, and a function that guesses which month somebody
 * means from the trips it happens to have been given will be wrong in the first
 * week of every one.
 */
export function statement(
  earnings: readonly Earning[],
  from: Date,
  to: Date,
): Statement {
  const inWindow = earnings.filter(
    (earning) =>
      earning.deliveredAt.getTime() >= from.getTime() &&
      earning.deliveredAt.getTime() <= to.getTime(),
  );

  const earned = add(...inWindow.map((earning) => earning.pay));

  // Only where they spent *more* than the advance. A trip where they came back
  // with change is not a credit against a trip where they did not — those are
  // two separate settlements and netting them across trips is how a driver
  // ends up owed money nobody can account for.
  const outOfPocket = add(
    ...inWindow.map((earning) =>
      Math.max(0, earning.spent - earning.advance) as Kobo,
    ),
  );

  const settled = add(
    ...inWindow
      .filter((earning) => earning.paidAt !== null)
      .map((earning) => earning.pay),
  );

  return {
    from,
    to,
    trips: inWindow.length,
    distanceM: inWindow.reduce((total, earning) => total + earning.distanceM, 0),
    earned,
    outOfPocket,
    outstanding: subtract(add(earned, outOfPocket), settled),
    settled,
  };
}

/**
 * What a kilometre earned, over the window.
 *
 * The number a driver can compare between months and between carriers, and the
 * one nobody has ever been able to give them. Null below a threshold, for the
 * same reason `onTimeRate` is: a rate from one short trip is arithmetic, not
 * information.
 */
export const MINIMUM_TRIPS_FOR_PER_KM = 3;

export function perKilometre(found: Statement): Kobo | null {
  if (found.trips < MINIMUM_TRIPS_FOR_PER_KM || found.distanceM === 0) return null;
  return Math.round(found.earned / (found.distanceM / 1_000)) as Kobo;
}

/**
 * Trips whose pay is still outstanding, oldest first.
 *
 * Oldest first because that is the one to ask about. A list sorted newest-first
 * puts the trip from six weeks ago — the one that has actually gone wrong — at
 * the bottom where nobody scrolls.
 */
export function unpaid(earnings: readonly Earning[]): readonly Earning[] {
  return [...earnings]
    .filter((earning) => earning.paidAt === null)
    .sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime());
}

/**
 * How long the oldest unpaid trip has been waiting.
 *
 * Null when everything is settled — which the screen renders as a sentence,
 * not as a zero.
 */
export function longestWaitMs(earnings: readonly Earning[], now: Date): number | null {
  const oldest = unpaid(earnings)[0];
  return oldest === undefined ? null : now.getTime() - oldest.deliveredAt.getTime();
}

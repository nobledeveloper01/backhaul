/**
 * Which load, and whose bid.
 *
 * Tracking is the wedge; this is the business. Two rankings, pointing in
 * opposite directions:
 *
 * - `rankLoads` — what a carrier should take next;
 * - `rankBids` — whose offer a shipper should accept.
 *
 * Both return every candidate, scored and with the score explained, rather
 * than a filtered shortlist. A ranking that silently drops options is one the
 * user cannot argue with, and the first thing a haulier does with a
 * recommendation is argue with it.
 */

import { distance, type Metres, type Position } from './geo.ts';
import { quote, type TruckClass, type Tonnes, fits } from './pricing.ts';
import { type Kobo } from './money.ts';

export interface Load {
  readonly id: string;
  readonly origin: Position;
  readonly destination: Position;
  readonly weight: Tonnes;
  readonly requires: TruckClass;
  /** What the shipper is offering, or undefined if it is open to bids. */
  readonly offered?: Kobo;
  /** Collection must start by this time. */
  readonly readyBy: Date;
  readonly expiresAt: Date;
}

export interface Carrier {
  /** Where the truck is, or will be when it is free. */
  readonly at: Position;
  /** When it is free. */
  readonly freeFrom: Date;
  readonly truck: TruckClass;
  /**
   * Where the truck is trying to get back to.
   *
   * This is the whole product. An empty truck running 900 km home earns
   * nothing and burns diesel the entire way; a load going that direction at
   * half price is better than a full-price load going the wrong way. Without a
   * base, this reduces to ordinary proximity matching.
   */
  readonly base?: Position;
}

/**
 * Why a load did not score well — or could not be taken at all.
 *
 * `blocked` is the important distinction: a load that cannot physically be
 * taken is shown greyed with the reason, not hidden. A carrier who cannot see
 * why the 30-tonne load is not on their list assumes the app is broken.
 */
export type Blocker = 'too_heavy' | 'wrong_class' | 'expired' | 'cannot_reach';

export interface LoadScore {
  readonly load: Load;
  /** 0–1. Meaningless in isolation; the ordering is the product. */
  readonly score: number;
  readonly blocked: Blocker | null;
  /** Empty kilometres to reach the pickup. */
  readonly deadhead: Metres;
  /** Metres of the run home this load covers. Negative means it takes the
   * truck further away. */
  readonly progressHome: Metres;
  /** One line, rendered under the load on the carrier's list. */
  readonly because: string;
}

/** Deadhead beyond this is not worth scoring against; the load is not local. */
export const MAX_DEADHEAD_M = 400_000;

/**
 * Ranks available loads for a carrier.
 *
 * Sorted best first. Blocked loads sort last regardless of score, because a
 * load that cannot be taken should never sit above one that can, however
 * attractive it looks.
 */
export function rankLoads(
  carrier: Carrier,
  loads: readonly Load[],
  now: Date,
): readonly LoadScore[] {
  return loads
    .map((load) => scoreLoad(carrier, load, now))
    .sort((a, b) => {
      if ((a.blocked === null) !== (b.blocked === null)) {
        return a.blocked === null ? -1 : 1;
      }
      return b.score - a.score;
    });
}

function scoreLoad(carrier: Carrier, load: Load, now: Date): LoadScore {
  const deadhead = distance(carrier.at, load.origin);
  const haul = distance(load.origin, load.destination);

  const progressHome =
    carrier.base === undefined
      ? 0
      : distance(carrier.at, carrier.base) -
        distance(load.destination, carrier.base);

  const blocked = blockerFor(carrier, load, deadhead, now);
  if (blocked !== null) {
    return {
      load,
      score: 0,
      blocked,
      deadhead,
      progressHome,
      because: explainBlocker(blocked),
    };
  }

  // Three things decide it, and the weights say which matters:
  //
  //   value    what the trip pays against what it costs to reach
  //   homeward how much of the empty run home this load covers
  //   urgency  how soon it has to be collected
  //
  // Homeward is weighted almost as heavily as value on purpose. It is the
  // asymmetry the product is named after, and a matcher that treats a return
  // load as just another load is a load board.
  const value = valueScore(load, haul, deadhead);
  const homeward = homewardScore(progressHome, haul, carrier.base !== undefined);
  const urgency = urgencyScore(load, now);

  const score = clamp(0.45 * value + 0.4 * homeward + 0.15 * urgency);

  return { load, score, blocked: null, deadhead, progressHome, because: explain(deadhead, progressHome, carrier.base !== undefined) };
}

function blockerFor(
  carrier: Carrier,
  load: Load,
  deadhead: Metres,
  now: Date,
): Blocker | null {
  if (load.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (!fits(carrier.truck, load.weight)) return 'too_heavy';
  if (carrier.truck !== load.requires) return 'wrong_class';
  if (deadhead > MAX_DEADHEAD_M) return 'cannot_reach';
  return null;
}

/**
 * Paid distance against total distance.
 *
 * A 500 km haul reached by 50 km of empty running is 91% productive. The same
 * haul reached by 400 km of empty running is 56%, and no rate makes that up.
 */
function valueScore(load: Load, haul: Metres, deadhead: Metres): number {
  const total = haul + deadhead;
  if (total === 0) return 0;
  const productive = haul / total;

  // A shipper offering above the indicative range is worth noticing; one
  // offering below it is worth noticing too, in the other direction.
  const indicative = quote(load.requires, haul).mid;
  const premium =
    load.offered === undefined || indicative === 0
      ? 1
      : clamp(load.offered / indicative, 0.5, 1.5);

  return clamp(productive * premium);
}

/**
 * How much of the run home this load covers, as a fraction of its own length.
 *
 * A load that goes exactly the right way scores 1. One that goes sideways
 * scores 0.5 — neutral, not punished, because a paying sideways load still
 * beats an empty truck. One that goes backwards scores toward 0.
 *
 * With no base, this returns a flat 0.5 rather than 0: a carrier who has not
 * told us where home is should not have every load marked down.
 */
function homewardScore(
  progressHome: Metres,
  haul: Metres,
  hasBase: boolean,
): number {
  if (!hasBase || haul === 0) return 0.5;
  return clamp(0.5 + progressHome / (2 * haul));
}

/** Loads that must move today outrank loads that can wait a week. */
function urgencyScore(load: Load, now: Date): number {
  const hours = (load.readyBy.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return 1;
  if (hours >= 72) return 0;
  return 1 - hours / 72;
}

function explain(deadhead: Metres, progressHome: Metres, hasBase: boolean): string {
  const empty = `${Math.round(deadhead / 1000)} km empty to the pickup`;
  if (!hasBase) return `${empty}.`;
  if (progressHome > 50_000) {
    return `${empty}, and it covers ${Math.round(progressHome / 1000)} km of the run home.`;
  }
  if (progressHome < -50_000) {
    return `${empty}, but it takes you ${Math.round(-progressHome / 1000)} km further from base.`;
  }
  return `${empty}; neither toward base nor away from it.`;
}

function explainBlocker(blocked: Blocker): string {
  switch (blocked) {
    case 'too_heavy':
      return 'Heavier than your truck carries.';
    case 'wrong_class':
      return 'The shipper asked for a different class of truck.';
    case 'expired':
      return 'This load has expired.';
    case 'cannot_reach':
      return `More than ${MAX_DEADHEAD_M / 1000} km of empty running away.`;
  }
}

export interface Bid {
  readonly id: string;
  readonly carrierId: string;
  readonly amount: Kobo;
  /** Completed trips, and how many of them arrived when promised. */
  readonly tripsCompleted: number;
  readonly tripsOnTime: number;
  /** Where the truck is now. */
  readonly at: Position;
  readonly placedAt: Date;
}

export interface BidScore {
  readonly bid: Bid;
  readonly score: number;
  /** 0–1, or null when the carrier has too little history to have one. */
  readonly reliability: number | null;
  readonly kmToPickup: number;
  readonly because: string;
}

/** Below this many completed trips, a carrier has no meaningful record. */
export const MINIMUM_TRIPS_FOR_RELIABILITY = 5;

/**
 * How far above the cheapest bid a carrier may ask before price scores zero.
 *
 * A quarter. A carrier asking 25% more than the cheapest offer had better be
 * winning on record alone, and at that point the shipper should be looking at
 * the two figures themselves rather than at a ranking.
 */
export const PREMIUM_TOLERANCE = 0.25;

/**
 * Ranks bids for a shipper.
 *
 * The cheapest bid is not the best bid, and this is where the product either
 * earns trust or loses it. A carrier with forty on-time trips asking 10% more
 * than one with none is the better answer, and the ranking says so — but it
 * shows the price and the record side by side so the shipper can overrule it.
 *
 * A new carrier is not scored as unreliable. They are scored as *unknown*,
 * which sits between good and bad rather than at the bottom: a marketplace
 * that never surfaces a new carrier never gets a second one.
 */
export function rankBids(bids: readonly Bid[], pickup: Position): readonly BidScore[] {
  if (bids.length === 0) return [];

  const cheapest = Math.min(...bids.map((b) => b.amount as number));

  return bids
    .map((bid) => {
      // A **proportional premium over the cheapest bid**, not a position
      // within the spread.
      //
      // Scoring by position in the spread was the first version, and it is
      // wrong in a way that only shows up with real numbers: with two bids of
      // ₦1,800,000 and ₦2,000,000 the dearer one scores zero on price — as
      // though it were infinitely expensive — because it happens to be the
      // top of a two-bid range. That handed every load to the cheapest bidder
      // regardless of record, which is the exact failure this ranking exists
      // to avoid.
      //
      // Proportional keeps what the spread version was reaching for: ₦50,000
      // apart is a lot on a city run and nothing on a Kano haul, and a
      // percentage says so without letting the range set the sensitivity.
      const premium = cheapest === 0 ? 0 : (bid.amount - cheapest) / cheapest;
      const price = clamp(1 - premium / PREMIUM_TOLERANCE);

      const reliability =
        bid.tripsCompleted >= MINIMUM_TRIPS_FOR_RELIABILITY
          ? clamp(bid.tripsOnTime / bid.tripsCompleted)
          : null;

      const kmToPickup = distance(bid.at, pickup) / 1000;
      // Within 50 km is as good as at the door; beyond 300 km the truck is
      // unlikely to arrive when it says.
      const proximity = clamp(1 - Math.max(0, kmToPickup - 50) / 250);

      const score = clamp(
        0.4 * price + 0.4 * (reliability ?? 0.6) + 0.2 * proximity,
      );

      return {
        bid,
        score,
        reliability,
        kmToPickup: Math.round(kmToPickup),
        because:
          reliability === null
            ? `New to Backhaul — ${bid.tripsCompleted} completed trip` +
              `${bid.tripsCompleted === 1 ? '' : 's'}, no record yet.`
            : `${Math.round(reliability * 100)}% on time across ` +
              `${bid.tripsCompleted} trips.`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function clamp(value: number, low = 0, high = 1): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

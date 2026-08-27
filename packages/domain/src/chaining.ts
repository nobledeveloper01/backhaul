/**
 * Stringing loads together so a truck never runs empty.
 *
 * `utilisation.ts` measures the problem — what fraction of the kilometres a
 * truck drove were paid for — and this is the answer to it. A trailer that
 * runs Lagos → Kano → Lagos empty on the way back is paid for half of what it
 * burns. A trailer that runs Lagos → Kano → Kaduna → Lagos with a load on each
 * leg is a different business.
 *
 * A chain is only worth proposing if each leg **starts near where the last one
 * ended, soon after it ended**. Everything here is that one idea, made careful
 * about the two ways it goes wrong: a deadhead longer than the leg it feeds,
 * and a connection too tight to make.
 */

import { distance, type Metres, type Position } from './geo.ts';
import { add, type Kobo } from './money.ts';

export interface ChainLeg {
  readonly loadId: string;
  readonly from: Position;
  readonly to: Position;
  readonly fromName: string;
  readonly toName: string;
  /** Earliest the load can be picked up. */
  readonly readyFrom: Date;
  /** Latest it may be delivered. Null means no deadline was given. */
  readonly deliverBy: Date | null;
  readonly pays: Kobo;
  readonly distanceM: Metres;
}

export interface Chain {
  readonly legs: readonly ChainLeg[];
  /** Kilometres driven with nothing on board, between legs. */
  readonly deadheadM: Metres;
  readonly laden: Metres;
  readonly pays: Kobo;
}

/**
 * How far a truck will reposition between legs.
 *
 * 120 km. Beyond that the fuel and the day spent are rarely covered by the leg
 * being repositioned for, and a proposal that loses money is worse than no
 * proposal — it teaches a carrier that the suggestions are not worth reading.
 */
export const MAX_REPOSITION_M = 120_000;

/**
 * How long a repositioning drive is assumed to take.
 *
 * 45 km/h, which is the observed corridor average rather than a road speed.
 * Used only to decide whether a connection is makeable; nothing here is
 * presented as an arrival time.
 */
export const REPOSITION_SPEED_MS = 12.5;

/**
 * The slack a connection needs beyond the drive itself.
 *
 * Three hours. Loading, paperwork, and the fact that the previous leg's
 * delivery window is the *latest* it may arrive, not when it will.
 */
export const CONNECTION_SLACK_MS = 3 * 60 * 60_000;

export type ChainRefusal = 'too_far' | 'too_tight' | 'wrong_order';

export type Fit =
  | { readonly ok: true; readonly repositionM: Metres }
  | { readonly ok: false; readonly reason: ChainRefusal; readonly detail: string };

/**
 * Whether one leg can follow another.
 *
 * Answers with a reason rather than a boolean, so a carrier looking at a load
 * that *nearly* fits is told which of the two things is wrong — the distance
 * is something they might accept, and the timing is not.
 */
export function canFollow(previous: ChainLeg, next: ChainLeg): Fit {
  const reposition = distance(previous.to, next.from);

  if (reposition > MAX_REPOSITION_M) {
    return {
      ok: false,
      reason: 'too_far',
      detail: `${Math.round(reposition / 1_000)} km empty from ${previous.toName} to ${next.fromName}.`,
    };
  }

  const previousEnds = previous.deliverBy;
  if (previousEnds === null) {
    // No deadline on the first leg means nothing can be said about the
    // connection. Allowed on distance alone; the carrier judges the rest.
    return { ok: true, repositionM: reposition };
  }

  if (next.readyFrom.getTime() < previous.readyFrom.getTime()) {
    return {
      ok: false,
      reason: 'wrong_order',
      detail: `${next.fromName} loads before ${previous.fromName} does.`,
    };
  }

  const earliestArrival =
    previousEnds.getTime() + (reposition / REPOSITION_SPEED_MS) * 1_000 + CONNECTION_SLACK_MS;

  if (next.deliverBy !== null && earliestArrival > next.deliverBy.getTime()) {
    return {
      ok: false,
      reason: 'too_tight',
      detail: `Too tight — ${next.toName} is due before the truck could get there.`,
    };
  }

  return { ok: true, repositionM: reposition };
}

/** Totals a chain: what it pays, what it drives laden, what it drives empty. */
export function summarise(legs: readonly ChainLeg[]): Chain {
  let deadhead = 0;
  let laden = 0;
  let pays = 0 as Kobo;

  legs.forEach((leg, index) => {
    laden += leg.distanceM;
    pays = add(pays, leg.pays);
    const previous = legs[index - 1];
    if (previous !== undefined) deadhead += distance(previous.to, leg.from);
  });

  return { legs, deadheadM: deadhead, laden, pays };
}

/**
 * The best chain that can be built from a starting leg and a pool of loads.
 *
 * Greedy: at each step take the leg that adds the most money per kilometre
 * driven, including the empty ones. Greedy rather than optimal on purpose — the
 * pool a carrier sees is a few dozen loads, an optimal search is a
 * travelling-salesman problem, and being *approximately* right instantly is
 * worth more than being exactly right after a spinner.
 *
 * `maxChainLegs` is not a performance limit. Chains longer than three legs are
 * planning fiction: by the third handover the first leg's timings have moved.
 */
export const MAX_CHAIN_LEGS = 3;

export function chain(
  start: ChainLeg,
  pool: readonly ChainLeg[],
  maxChainLegs: number = MAX_CHAIN_LEGS,
): Chain {
  const chosen: ChainLeg[] = [start];
  const taken = new Set<string>([start.loadId]);

  while (chosen.length < maxChainLegs) {
    const last = chosen[chosen.length - 1];
    if (last === undefined) break;

    let best: { leg: ChainLeg; value: number } | null = null;

    for (const candidate of pool) {
      if (taken.has(candidate.loadId)) continue;
      const fit = canFollow(last, candidate);
      if (!fit.ok) continue;

      const driven = candidate.distanceM + fit.repositionM;
      if (driven === 0) continue;
      const value = candidate.pays / driven;

      if (best === null || value > best.value) best = { leg: candidate, value };
    }

    if (best === null) break;
    chosen.push(best.leg);
    taken.add(best.leg.loadId);
  }

  return summarise(chosen);
}

/**
 * What fraction of a chain's kilometres are paid for.
 *
 * The number the whole feature exists to move. Deliberately the same shape as
 * `utilisation()` so a carrier can compare a proposed chain against what they
 * actually ran last month.
 */
export function ladenFraction(chain_: Chain): number {
  const total = chain_.laden + chain_.deadheadM;
  return total === 0 ? 0 : chain_.laden / total;
}

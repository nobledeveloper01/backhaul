/**
 * The trucks themselves.
 *
 * `trust.ts` verifies a *carrier*; this verifies the thing that actually
 * carries the goods. They are not the same question, and conflating them is
 * how a Trusted carrier ends up moving somebody's cargo on a trailer whose
 * roadworthiness lapsed in March.
 *
 * Nigerian road haulage papers are a real, specific list — and every one of
 * them expires. Expiry is the whole feature: a document that was valid when it
 * was uploaded says nothing about today.
 */

import { EXPIRY_WARNING_DAYS } from './trust.ts';
import type { TruckClass } from './pricing.ts';

export type Paper =
  /** Vehicle licence. The annual one. */
  | 'licence'
  /** Roadworthiness certificate. */
  | 'roadworthiness'
  /** Third-party or comprehensive motor insurance. */
  | 'insurance'
  /** Hackney/haulage permit. */
  | 'permit';

export const PAPERS: readonly Paper[] = ['licence', 'roadworthiness', 'insurance', 'permit'];

export interface Vehicle {
  readonly id: string;
  /** As painted on the truck. */
  readonly plate: string;
  readonly truck: TruckClass;
  readonly carrierId: string;
  /** Expiry per paper. A paper not held at all is absent, not an old date. */
  readonly papers: Readonly<Partial<Record<Paper, Date>>>;
  /** Withdrawn from service by its owner. Not a document problem. */
  readonly retiredAt: Date | null;
}

export type Standing =
  /** Every paper present and in date. */
  | 'road_legal'
  /** In date, but something lapses inside the warning window. */
  | 'expiring'
  /** At least one paper has run out. */
  | 'lapsed'
  /** At least one has never been provided. */
  | 'incomplete'
  | 'retired';

export interface Assessment {
  readonly standing: Standing;
  /** Papers that have run out, soonest-expired first. */
  readonly lapsed: readonly { readonly paper: Paper; readonly days: number }[];
  /** Papers that will run out inside the warning window. */
  readonly expiring: readonly { readonly paper: Paper; readonly days: number }[];
  readonly missing: readonly Paper[];
}

/**
 * Where a truck stands, on a given day.
 *
 * `now` is an argument, as everywhere: a dispute is argued about what was true
 * on the day of the trip, not about what is true when somebody opens the app.
 */
export function assess(vehicle: Vehicle, now: Date): Assessment {
  if (vehicle.retiredAt !== null && vehicle.retiredAt.getTime() <= now.getTime()) {
    return { standing: 'retired', lapsed: [], expiring: [], missing: [] };
  }

  const missing: Paper[] = [];
  const lapsed: { paper: Paper; days: number }[] = [];
  const expiring: { paper: Paper; days: number }[] = [];

  for (const paper of PAPERS) {
    const on = vehicle.papers[paper];
    if (on === undefined) {
      missing.push(paper);
      continue;
    }

    // Truncated toward zero, not floored.
    //
    // Flooring is right for a date in the future — 18.9 days left is "18 days
    // left", which is the conservative way round. It is wrong for one in the
    // past: a certificate that lapsed nine days and one second ago floors to
    // −10 and the screen says "10 days out of date". Truncating gets both
    // ends right, and the difference is a whole day in a sentence somebody
    // may act on.
    const days = Math.trunc((on.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) lapsed.push({ paper, days });
    else if (days <= EXPIRY_WARNING_DAYS) expiring.push({ paper, days });
  }

  lapsed.sort((a, b) => a.days - b.days);
  expiring.sort((a, b) => a.days - b.days);

  // Order matters: a lapsed paper is a worse fact than a missing one, because
  // a missing paper means the truck was never offered for work and a lapsed
  // one means it is working on something that stopped being true.
  const standing: Standing =
    lapsed.length > 0
      ? 'lapsed'
      : missing.length > 0
        ? 'incomplete'
        : expiring.length > 0
          ? 'expiring'
          : 'road_legal';

  return { standing, lapsed, expiring, missing };
}

/**
 * Whether this truck may be assigned to a trip today.
 *
 * `expiring` still may — a certificate with three weeks left is valid, and
 * refusing work on it would take a truck off the road for being *about* to
 * have a problem. `lapsed` and `incomplete` may not.
 */
export function mayCarry(assessment: Assessment): boolean {
  return assessment.standing === 'road_legal' || assessment.standing === 'expiring';
}

/**
 * Whether a truck already on a trip should be stopped.
 *
 * **No.** A paper that lapses mid-trip does not make the cargo safer by the
 * side of the road. It is recorded against the trip and it blocks the *next*
 * assignment, which is where the pressure belongs — on the office, not on a
 * driver eight hundred kilometres from home.
 */
export function mustStopMidTrip(): false {
  return false;
}

/** Plain words for a badge. */
export function describeStanding(standing: Standing): string {
  switch (standing) {
    case 'road_legal':
      return 'Road legal';
    case 'expiring':
      return 'Papers expiring';
    case 'lapsed':
      return 'Papers lapsed';
    case 'incomplete':
      return 'Papers missing';
    case 'retired':
      return 'Retired';
  }
}

export function describePaper(paper: Paper): string {
  switch (paper) {
    case 'licence':
      return 'Vehicle licence';
    case 'roadworthiness':
      return 'Roadworthiness';
    case 'insurance':
      return 'Insurance';
    case 'permit':
      return 'Haulage permit';
  }
}

/**
 * The fleet, worst first.
 *
 * A fleet screen sorted by plate is a fleet screen nobody scrolls to the bottom
 * of, and the truck at the bottom is the one with the lapsed certificate.
 */
export function byUrgency(
  vehicles: readonly Vehicle[],
  now: Date,
): readonly { readonly vehicle: Vehicle; readonly assessment: Assessment }[] {
  const rank: Readonly<Record<Standing, number>> = {
    lapsed: 0,
    incomplete: 1,
    expiring: 2,
    road_legal: 3,
    retired: 4,
  };

  return [...vehicles]
    .map((vehicle) => ({ vehicle, assessment: assess(vehicle, now) }))
    .sort((a, b) => {
      const byStanding = rank[a.assessment.standing] - rank[b.assessment.standing];
      if (byStanding !== 0) return byStanding;
      // Within a standing, whatever expires soonest.
      const soonest = (entry: typeof a) =>
        entry.assessment.lapsed[0]?.days ?? entry.assessment.expiring[0]?.days ?? 9_999;
      return soonest(a) - soonest(b);
    });
}

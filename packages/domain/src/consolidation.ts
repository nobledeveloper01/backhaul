/**
 * Two half-loads on one truck.
 *
 * A 12-tonne consignment on a 30-tonne trailer pays for the trailer and wastes
 * 18 tonnes of it. The shipper knows they are overpaying and the carrier knows
 * they are underloaded, and neither can fix it alone: matching two strangers'
 * part-loads is exactly the thing a marketplace is for and a phone call is not.
 *
 * `matching.ts` ranks whole loads against a truck. This asks a different
 * question — which *pairs* fit together — and it is stricter, because a
 * consolidation that goes wrong strands two consignments instead of one.
 */

import { distance, type Metres } from './geo.ts';
import { add, percent, type Kobo } from './money.ts';
import { CAPACITY, type TruckClass } from './pricing.ts';
import type { LoadSummary } from './search.ts';

/**
 * How far apart two pickups may be.
 *
 * 50 km. Beyond that the collection detour eats the saving, and the second
 * shipper is waiting on a truck that is somewhere else entirely.
 */
export const PICKUP_SPREAD_M: Metres = 50_000;

/**
 * And two deliveries.
 *
 * 80 km — more generous than the pickup, because by then both consignments are
 * aboard and the detour costs a drive rather than a rendezvous.
 */
export const DROP_SPREAD_M: Metres = 80_000;

/**
 * How much of the truck must actually be used.
 *
 * 70%. Below that the pair is still not worth the coordination: two shippers,
 * two sets of paperwork, two consignees and two chances of a delay, for a
 * trailer that is still mostly air.
 */
export const MINIMUM_FILL = 0.7;

/**
 * What consolidating saves, and who gets it.
 *
 * The pair pays less than two whole-truck fares and more than one. 30% off each
 * — so both shippers see a real reduction — while the carrier still carries
 * 140% of a single fare for one run. Nobody is doing anybody a favour, which is
 * why it works.
 */
export const SHIPPER_DISCOUNT_PCT = 30;

export interface PairLoad extends LoadSummary {
  readonly origin_: { readonly lat: number; readonly lon: number };
  readonly destination_: { readonly lat: number; readonly lon: number };
}

export type PairRefusal =
  | 'too_heavy'
  | 'pickups_too_far'
  | 'drops_too_far'
  | 'wrong_truck'
  | 'too_empty';

export type PairVerdict =
  | {
      readonly ok: true;
      readonly fill: number;
      readonly collectM: Metres;
      readonly deliverM: Metres;
    }
  | { readonly ok: false; readonly reason: PairRefusal; readonly detail: string };

/**
 * Whether two loads can share a truck.
 *
 * Answers with a reason, like every other refusal in this package: a carrier
 * looking at a pair that *nearly* works needs to know which of the five things
 * is wrong, because one of them they might solve with a phone call.
 */
export function canShare(
  a: PairLoad,
  b: PairLoad,
  truck: TruckClass,
): PairVerdict {
  if (a.truckClass !== b.truckClass) {
    return {
      ok: false,
      reason: 'wrong_truck',
      detail: 'These two ask for different kinds of truck.',
    };
  }

  const tonnes = (a.weightKg + b.weightKg) / 1_000;
  const capacity = CAPACITY[truck];

  if (tonnes > capacity) {
    return {
      ok: false,
      reason: 'too_heavy',
      detail: `${Math.round(tonnes)} t together, and this truck takes ${capacity} t.`,
    };
  }

  const fill = tonnes / capacity;
  if (fill < MINIMUM_FILL) {
    return {
      ok: false,
      reason: 'too_empty',
      detail:
        `Together they still only fill ${Math.round(fill * 100)}% of the truck — ` +
        'not worth two sets of paperwork.',
    };
  }

  const collect = distance(
    { ...a.origin_, accuracy: 0, at: a.readyFrom },
    { ...b.origin_, accuracy: 0, at: b.readyFrom },
  );

  if (collect > PICKUP_SPREAD_M) {
    return {
      ok: false,
      reason: 'pickups_too_far',
      detail: `${Math.round(collect / 1_000)} km between the two pickups.`,
    };
  }

  const deliver = distance(
    { ...a.destination_, accuracy: 0, at: a.readyFrom },
    { ...b.destination_, accuracy: 0, at: b.readyFrom },
  );

  if (deliver > DROP_SPREAD_M) {
    return {
      ok: false,
      reason: 'drops_too_far',
      detail: `${Math.round(deliver / 1_000)} km between the two deliveries.`,
    };
  }

  return { ok: true, fill, collectM: collect, deliverM: deliver };
}

export interface Pairing {
  readonly a: PairLoad;
  readonly b: PairLoad;
  readonly fill: number;
  /** What each shipper pays. */
  readonly shipperPays: readonly [Kobo, Kobo];
  /** What the carrier collects for the run. */
  readonly carrierGets: Kobo;
}

export function price(a: PairLoad, b: PairLoad, fill: number): Pairing {
  const discount = (offered: Kobo) => subtractPct(offered, SHIPPER_DISCOUNT_PCT);
  const paysA = discount(a.offered);
  const paysB = discount(b.offered);

  return {
    a,
    b,
    fill,
    shipperPays: [paysA, paysB],
    carrierGets: add(paysA, paysB),
  };
}

function subtractPct(amount: Kobo, pct: number): Kobo {
  return (amount - percent(amount, pct)) as Kobo;
}

/**
 * Every pair worth proposing, fullest first.
 *
 * Quadratic, and deliberately so: a load board a carrier is looking at is a few
 * dozen rows, and every clever index would need maintaining for a saving
 * nobody can perceive.
 */
export function pairs(
  loads: readonly PairLoad[],
  truck: TruckClass,
): readonly Pairing[] {
  const found: Pairing[] = [];

  for (let i = 0; i < loads.length; i++) {
    for (let j = i + 1; j < loads.length; j++) {
      const a = loads[i];
      const b = loads[j];
      if (a === undefined || b === undefined) continue;

      const verdict = canShare(a, b, truck);
      if (!verdict.ok) continue;

      found.push(price(a, b, verdict.fill));
    }
  }

  return found.sort((x, y) => y.fill - x.fill);
}

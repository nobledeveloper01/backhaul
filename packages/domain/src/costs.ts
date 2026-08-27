/**
 * What a trip actually leaves the carrier with.
 *
 * The fare is not the earnings. Diesel on a Lagos–Kano round trip is the
 * largest single cost in this business and it moves weekly; the driver is paid;
 * the road takes its levies; the truck depreciates and eventually needs tyres.
 * A carrier who prices from the fare alone takes work that loses money and
 * cannot tell which work it was.
 *
 * `pricing.ts` answers what a shipper should pay. This answers whether the
 * carrier should say yes — and they are different questions with different
 * inputs, which is why they are different files.
 */

import { add, subtract, type Kobo } from './money.ts';
import type { Metres } from './geo.ts';
import type { TruckClass } from './pricing.ts';

/**
 * Litres per 100 km, laden, on a mixed corridor.
 *
 * Real figures for these classes on Nigerian roads, not manufacturer numbers —
 * a loaded 30-tonne trailer on the Kaduna road does not do what the brochure
 * says. Laden: the empty leg burns less, and `runningCost` takes that into
 * account rather than pretending a return trip costs the same as the outward.
 */
export const LITRES_PER_100KM: Readonly<Record<TruckClass, number>> = {
  pickup: 12,
  canter: 22,
  truck_15t: 32,
  trailer_30t: 45,
  lowbed: 52,
} as const;

/** An empty truck burns about three quarters of what a loaded one does. */
export const EMPTY_FUEL_FRACTION = 0.75;

/**
 * Everything that is not fuel, per kilometre.
 *
 * Tyres, servicing, the driver's own pay, and the sinking fund a truck needs to
 * be replaced. Per kilometre rather than per trip because that is how it
 * actually accrues, and per class because a trailer's tyres are not a canter's.
 */
export const RUNNING_PER_KM: Readonly<Record<TruckClass, Kobo>> = {
  pickup: 4_000 as Kobo,
  canter: 7_500 as Kobo,
  truck_15t: 11_000 as Kobo,
  trailer_30t: 16_000 as Kobo,
  lowbed: 19_000 as Kobo,
} as const;

export interface CostInput {
  readonly truck: TruckClass;
  /** Loaded kilometres. */
  readonly ladenM: Metres;
  /** Empty kilometres, out or back. */
  readonly emptyM: Metres;
  /** What a litre costs today. It moves, so it is never a constant here. */
  readonly dieselPerLitre: Kobo;
  /** What the road took. From `levies.ts`, not estimated. */
  readonly levies: Kobo;
  /** Anything else the carrier knows about: a night's parking, a repair. */
  readonly other: Kobo;
}

export interface Costs {
  readonly fuel: Kobo;
  readonly running: Kobo;
  readonly levies: Kobo;
  readonly other: Kobo;
  readonly total: Kobo;
  readonly litres: number;
}

export function runningCost(input: CostInput): Costs {
  const laden = input.ladenM / 1_000;
  const empty = input.emptyM / 1_000;

  const litres =
    (laden * LITRES_PER_100KM[input.truck]) / 100 +
    (empty * LITRES_PER_100KM[input.truck] * EMPTY_FUEL_FRACTION) / 100;

  const fuel = Math.round(litres * input.dieselPerLitre) as Kobo;
  const running = Math.round((laden + empty) * RUNNING_PER_KM[input.truck]) as Kobo;

  return {
    fuel,
    running,
    levies: input.levies,
    other: input.other,
    total: add(fuel, running, input.levies, input.other),
    litres: Math.round(litres),
  };
}

export interface Margin {
  readonly revenue: Kobo;
  readonly costs: Costs;
  readonly profit: Kobo;
  /** Profit as a share of revenue, −1 to 1. Null when the fare is zero. */
  readonly fraction: number | null;
}

export function margin(revenue: Kobo, input: CostInput): Margin {
  const costs = runningCost(input);
  const profit = subtract(revenue, costs.total);

  return {
    revenue,
    costs,
    profit,
    fraction: revenue === 0 ? null : profit / revenue,
  };
}

/**
 * The lowest fare worth taking.
 *
 * Costs plus a floor, because working for exactly cost is working for nothing
 * and a truck that runs at cost cannot be replaced. 15% is deliberately modest:
 * it is a floor for deciding, not a target for pricing.
 */
export const FLOOR_MARGIN = 0.15;

export function walkAwayBelow(input: CostInput): Kobo {
  const costs = runningCost(input);
  return Math.round(costs.total / (1 - FLOOR_MARGIN)) as Kobo;
}

/**
 * Whether to take it, and why in one sentence.
 *
 * The sentence matters more than the boolean: a carrier who is told "no" with
 * no figure attached will take the load anyway and find out afterwards.
 */
export function advise(
  offered: Kobo,
  input: CostInput,
): { readonly take: boolean; readonly detail: string } {
  const found = margin(offered, input);
  const floor = walkAwayBelow(input);

  if (found.profit <= 0) {
    return {
      take: false,
      detail:
        `This loses money: ${Math.round(found.costs.litres)} litres of diesel and ` +
        'the running cost come to more than the fare.',
    };
  }

  if (offered < floor) {
    return {
      take: false,
      detail: 'It covers the trip, but not enough to put anything back into the truck.',
    };
  }

  return {
    take: true,
    detail: `About ${Math.round((found.fraction ?? 0) * 100)}% over what the run costs.`,
  };
}

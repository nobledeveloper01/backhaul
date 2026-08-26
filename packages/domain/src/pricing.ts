/**
 * What a load is worth, what waiting costs, and who ends up with what.
 *
 * Two different jobs, kept in one file because they share a currency and a
 * rounding rule:
 *
 * - a **reference price**, so a shipper posting a load and a driver reading it
 *   are arguing from the same starting number;
 * - a **settlement**, which is the number that actually moves.
 *
 * The reference price is advisory and says so. The settlement is not.
 */

import {
  ZERO,
  add,
  format,
  percent,
  scale,
  subtract,
  type Kobo,
} from './money.ts';

/** Tonnes. Nigerian haulage quotes by truck class, and class is tonnage. */
export type Tonnes = number;

export type TruckClass = 'pickup' | 'canter' | 'truck_15t' | 'trailer_30t' | 'lowbed';

export const CAPACITY: Readonly<Record<TruckClass, Tonnes>> = {
  pickup: 1,
  canter: 5,
  truck_15t: 15,
  trailer_30t: 30,
  lowbed: 40,
};

/**
 * Indicative rate per kilometre, in kobo, for the whole truck.
 *
 * **Per truck, not per tonne.** The first version of this priced by
 * tonne-kilometre, which is how freight is costed in most of the world and is
 * not how anybody in Nigerian haulage talks. It quoted ₦398,400 for a
 * Lagos–Kano trailer run that goes for something over two million naira, and
 * the error only became visible when a real route was put through it. A
 * haulier quotes a truck against a road; the tonnage decides which truck, and
 * nothing after that.
 *
 * **These are a starting point for a negotiation, not a tariff.** Rates move
 * with diesel, with the season, and with which way the truck is already
 * going — a Lagos-to-Kano load and the Kano-to-Lagos backhaul that follows it
 * are not the same price, and the product is named after that asymmetry.
 *
 * Every figure derived from these carries `isIndicative`, and nothing built on
 * them is ever presented as a quote.
 */
export const RATE_PER_KM: Readonly<Record<TruckClass, Kobo>> = {
  pickup: 90_000 as Kobo,
  canter: 140_000 as Kobo,
  truck_15t: 190_000 as Kobo,
  trailer_30t: 270_000 as Kobo,
  lowbed: 420_000 as Kobo,
};

/**
 * The minimum any trip costs, whatever the distance says.
 *
 * A pickup eight kilometres across Lagos prices at ₦7,200 per kilometre alone,
 * which no driver would take and which makes the whole estimate look
 * unserious. The floor is the cost of showing up: a truck, a driver and a day.
 */
export const MINIMUM_FARE: Readonly<Record<TruckClass, Kobo>> = {
  pickup: 2_500_000 as Kobo,
  canter: 6_000_000 as Kobo,
  truck_15t: 12_000_000 as Kobo,
  trailer_30t: 35_000_000 as Kobo,
  lowbed: 60_000_000 as Kobo,
};

/** Whether a load fits the truck it is being offered to. */
export function fits(truck: TruckClass, weight: Tonnes): boolean {
  return weight <= CAPACITY[truck];
}

/**
 * The smallest class that carries the load, or null if nothing does.
 *
 * Smallest, not cheapest-per-tonne: an over-large truck is more expensive per
 * trip and harder to find, and a shipper who wanted a trailer can ask for one.
 */
export function smallestClassFor(weight: Tonnes): TruckClass | null {
  const ordered = (Object.keys(CAPACITY) as TruckClass[]).sort(
    (a, b) => CAPACITY[a] - CAPACITY[b],
  );
  return ordered.find((truck) => fits(truck, weight)) ?? null;
}

export interface Quote {
  readonly low: Kobo;
  readonly mid: Kobo;
  readonly high: Kobo;
  /** True whenever the figure came from the table above, which is always. */
  readonly isIndicative: true;
  /** Set when the floor decided the price rather than the distance. */
  readonly atMinimum: boolean;
  /** One sentence, rendered beside the figure. */
  readonly basis: string;
}

/** How far either side of the midpoint the range runs. */
const SPREAD = 0.18;

/**
 * An indicative range for moving a truck over a distance.
 *
 * A range, never a single number. A single number reads as a price, and this
 * is the middle of a distribution that diesel moves every few weeks.
 *
 * Weight is not an argument, and that is the model rather than an omission: a
 * half-empty trailer costs a full trailer to move. Weight decides the class —
 * see `smallestClassFor` — and stops mattering there.
 */
export function quote(truck: TruckClass, distanceMetres: number): Quote {
  const km = Math.max(0, distanceMetres) / 1000;

  const rate = RATE_PER_KM[truck];
  const byDistance = scale(rate, km);
  const floor = MINIMUM_FARE[truck];

  const atMinimum = byDistance < floor;
  const mid = atMinimum ? floor : byDistance;

  return {
    low: scale(mid, 1 - SPREAD),
    mid,
    high: scale(mid, 1 + SPREAD),
    isIndicative: true,
    atMinimum,
    basis: atMinimum
      ? `Minimum fare for a ${truck.replace(/_/g, ' ')}; the distance alone ` +
        `prices below what the trip costs to run.`
      : `${Math.round(km)} km at ${format(rate)} a kilometre.`,
  };
}

/**
 * Free waiting time at each end, in milliseconds.
 *
 * Loading a trailer takes hours in a Nigerian depot and nobody bills for the
 * first few. Demurrage starts when a delay stops being normal.
 */
export const FREE_WAITING_MS = 4 * 60 * 60_000;

/** Charged per hour, or part of an hour, beyond the free window. */
export const DEMURRAGE_PER_HOUR: Readonly<Record<TruckClass, Kobo>> = {
  pickup: 150_000 as Kobo,
  canter: 300_000 as Kobo,
  truck_15t: 500_000 as Kobo,
  trailer_30t: 750_000 as Kobo,
  lowbed: 1_000_000 as Kobo,
};

export interface Demurrage {
  readonly chargeableHours: number;
  readonly amount: Kobo;
  readonly basis: string;
}

/**
 * What the waiting cost.
 *
 * Part-hours round **up**, and that is a deliberate asymmetry: the truck is
 * unavailable for the whole hour it is sitting in, and rounding down would
 * make a fifty-minute delay free.
 */
export function demurrage(truck: TruckClass, waitedMs: number): Demurrage {
  const chargeable = Math.max(0, waitedMs - FREE_WAITING_MS);
  if (chargeable === 0) {
    return {
      chargeableHours: 0,
      amount: ZERO,
      basis: `Within the ${FREE_WAITING_MS / 3_600_000} free hours.`,
    };
  }
  const hours = Math.ceil(chargeable / 3_600_000);
  const rate = DEMURRAGE_PER_HOUR[truck];
  return {
    chargeableHours: hours,
    amount: scale(rate, hours),
    basis: `${hours} h beyond the free window at ${format(rate)} an hour.`,
  };
}

/** What Backhaul takes, as a percentage of the agreed fare. */
export const COMMISSION_PCT = 8;

export interface Settlement {
  readonly agreed: Kobo;
  readonly demurrage: Kobo;
  readonly gross: Kobo;
  readonly commission: Kobo;
  readonly advance: Kobo;
  /** What the carrier is actually paid on completion. */
  readonly toCarrier: Kobo;
}

/**
 * What each party ends up with.
 *
 * Commission is taken on the agreed fare only, never on demurrage. Demurrage
 * is compensation for a delay Backhaul did not cause and did not resolve, and
 * taking a cut of it would mean the platform earns more the worse the trip
 * goes.
 *
 * Every line is whole naira. Grid learned this on a rendered page rather than
 * in a test: shares allocated to the kobo are arithmetically correct and
 * produce figures that visibly do not add up beside a claim that they balance.
 */
export function settle(
  agreed: Kobo,
  demurrageAmount: Kobo,
  advance: Kobo,
): Settlement {
  const gross = add(agreed, demurrageAmount);
  const commission = whole(percent(agreed, COMMISSION_PCT));
  const toCarrier = subtract(subtract(gross, commission), advance);
  return {
    agreed,
    demurrage: demurrageAmount,
    gross,
    commission,
    advance,
    toCarrier,
  };
}

/** Rounds to the naira, so every displayed line adds up to every other. */
function whole(amount: Kobo): Kobo {
  return (Math.round(amount / 100) * 100) as Kobo;
}

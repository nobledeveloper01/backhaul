/**
 * How much of a fleet's driving is paid for.
 *
 * The number the product exists to move. A truck that runs 830 km loaded and
 * 830 km empty is at 50% utilisation, and every point of that is diesel, tyres
 * and a driver's day paid for by nothing.
 *
 * > *"An extra loaded return leg per truck per month is a material change to
 * > their income."*
 *
 * This is where that claim becomes a figure a fleet owner can check.
 */

import { format, roundTo, type Kobo, ZERO, add } from './money.ts';
import type { Metres } from './geo.ts';

export interface Leg {
  /** Distance actually driven, from a cleaned track. */
  readonly metres: Metres;
  /** False when the truck was running empty — repositioning, or going home. */
  readonly loaded: boolean;
  /** What the leg earned. Zero for an empty one, by definition. */
  readonly earned: Kobo;
}

export interface Utilisation {
  readonly loadedMetres: Metres;
  readonly emptyMetres: Metres;
  readonly totalMetres: Metres;
  /** Loaded share of distance driven, 0–1. */
  readonly ratio: number;
  readonly earned: Kobo;
  /**
   * Naira per kilometre **driven**, not per kilometre paid.
   *
   * The honest version of a rate. A haulier quoting ₦2,700 a kilometre who
   * runs half of them empty is really earning ₦1,350, and this is the figure
   * that says so.
   */
  readonly perKmDriven: Kobo;
  /** How many legs went into it, so a thin sample can be labelled. */
  readonly legs: number;
}

/** Below this many legs, the figure is not worth presenting as a trend. */
export const MINIMUM_LEGS = 4;

/**
 * Projections round to ₦5,000, like every other indicative figure.
 *
 * Duplicated from `pricing.ts` rather than imported, to keep `utilisation.ts`
 * from depending on the rate table for a constant.
 */
const INDICATIVE_STEP = 500_000;

export function utilisation(legs: readonly Leg[]): Utilisation {
  let loadedMetres = 0;
  let emptyMetres = 0;
  let earned: Kobo = ZERO;

  for (const leg of legs) {
    if (leg.loaded) {
      loadedMetres += leg.metres;
      earned = add(earned, leg.earned);
    } else {
      emptyMetres += leg.metres;
    }
  }

  const totalMetres = loadedMetres + emptyMetres;

  return {
    loadedMetres,
    emptyMetres,
    totalMetres,
    // Zero rather than NaN. A fleet with no legs is at 0% utilisation, and a
    // screen rendering "NaN%" is worse than one rendering a truthful nothing.
    ratio: totalMetres === 0 ? 0 : loadedMetres / totalMetres,
    earned,
    perKmDriven:
      totalMetres === 0
        ? ZERO
        : (Math.round(earned / (totalMetres / 1000)) as Kobo),
    legs: legs.length,
  };
}

/**
 * What one more loaded return leg would be worth.
 *
 * The whole pitch, as a number. Takes the empty kilometres already driven and
 * the fleet's own realised rate per loaded kilometre, and says what filling
 * one of those runs would have earned.
 *
 * Returns null below `MINIMUM_LEGS`, or with no empty running at all. A
 * projection from two legs is a guess with a decimal point on it.
 */
export function worthOfOneReturnLeg(
  current: Utilisation,
  averageLegMetres: Metres,
): Kobo | null {
  if (current.legs < MINIMUM_LEGS) return null;
  if (current.emptyMetres === 0) return null;
  if (current.loadedMetres === 0) return null;

  const ratePerKmLoaded = current.earned / (current.loadedMetres / 1000);
  const km = Math.min(averageLegMetres, current.emptyMetres) / 1000;

  // Rounded to ₦5,000, like every other indicative figure. "₦1,688,036" reads
  // as a quote; it is a projection from eight legs and the last three digits
  // are precision it does not have.
  return roundTo(Math.round(ratePerKmLoaded * km) as Kobo, INDICATIVE_STEP);
}

/** "62% loaded" — the one figure, formatted. */
export function describeRatio(current: Utilisation): string {
  return `${Math.round(current.ratio * 100)}% loaded`;
}

/** "₦1,350 a kilometre driven" — the honest rate, formatted. */
export function describeRate(current: Utilisation): string {
  return `${format(current.perKmDriven)} a kilometre driven`;
}

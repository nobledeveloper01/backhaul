/**
 * What a driver pays on the road.
 *
 * Between Lagos and Kano a trailer passes police checkpoints, state revenue
 * points, union desks, weighbridges and park levies. Each one takes cash, none
 * of them gives a receipt anybody keeps, and the total is a real and
 * substantial part of what a trip costs. It is currently carried in a driver's
 * head, settled from an advance, and argued about afterwards.
 *
 * Recording it does two things nothing else in the product does: it makes the
 * driver's reimbursement arguable from evidence rather than from memory, and —
 * once there are enough trips — it makes the *corridor's* real cost knowable,
 * which is the number a carrier needs to price a lane and does not have.
 *
 * **This is a ledger, not a judgement.** Nothing here decides whether a payment
 * should have been made.
 */

import { add, format, type Kobo } from './money.ts';

export type LevyKind =
  | 'police'
  | 'state_revenue'
  | 'union'
  | 'weighbridge'
  | 'park'
  | 'ferry'
  | 'other';

export interface Levy {
  readonly id: string;
  readonly tripId: string;
  readonly kind: LevyKind;
  readonly amount: Kobo;
  readonly at: Date;
  /** Where it happened, from the tracker. Null when there was no fix. */
  readonly near: { readonly lat: number; readonly lon: number } | null;
  /** What the driver typed, if anything. */
  readonly note: string;
  /** A photograph of a receipt, where one was given. Usually not. */
  readonly photoId: string | null;
}

/**
 * The most a single entry may be without a note.
 *
 * ₦20,000. Above it the driver is asked what it was for — not to challenge
 * them, but because an unexplained large entry is the one the office queries a
 * week later, and answering it then costs more than answering it now.
 */
export const NOTE_ABOVE: Kobo = 2_000_000 as Kobo;

export function needsNote(amount: Kobo): boolean {
  return amount > NOTE_ABOVE;
}

export function total(levies: readonly Levy[]): Kobo {
  return add(...levies.map((levy) => levy.amount));
}

/** Totals per kind, largest first. This is the shape of the problem. */
export function byKind(
  levies: readonly Levy[],
): readonly { readonly kind: LevyKind; readonly amount: Kobo; readonly count: number }[] {
  const sums = new Map<LevyKind, { amount: number; count: number }>();

  for (const levy of levies) {
    const seen = sums.get(levy.kind) ?? { amount: 0, count: 0 };
    sums.set(levy.kind, { amount: seen.amount + levy.amount, count: seen.count + 1 });
  }

  return [...sums.entries()]
    .map(([kind, sums_]) => ({ kind, amount: sums_.amount as Kobo, count: sums_.count }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * What is owed back to the driver.
 *
 * The advance minus what they spent — and it goes **negative** when they spent
 * more than they were given, which is the common case on a long run and the
 * whole reason a driver keeps a mental tally at all. A function that floored
 * this at zero would hide exactly the number the driver cares about.
 */
export function reconcile(
  advance: Kobo,
  levies: readonly Levy[],
): { readonly spent: Kobo; readonly balance: Kobo; readonly owedToDriver: boolean } {
  const spent = total(levies);
  const balance = (advance - spent) as Kobo;
  return { spent, balance, owedToDriver: balance < 0 };
}

/**
 * The cost of a corridor, from the trips that have run it.
 *
 * The median, not the mean: one trip where a truck was held for two days and
 * paid ₦180,000 would drag an average into uselessness, and the figure is
 * meant to answer "what does this normally cost".
 *
 * Refuses below five trips. A corridor cost from two runs is an anecdote, and
 * an anecdote priced into a lane is a carrier losing money on a rate they
 * believed.
 */
export const MINIMUM_TRIPS_FOR_CORRIDOR = 5;

export function corridorCost(totals: readonly Kobo[]): Kobo | null {
  if (totals.length < MINIMUM_TRIPS_FOR_CORRIDOR) return null;

  const sorted = [...totals].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] as Kobo;
  }

  const lower = sorted[middle - 1] ?? 0;
  const upper = sorted[middle] ?? 0;
  return Math.round((lower + upper) / 2) as Kobo;
}

export function describeLevy(kind: LevyKind): string {
  switch (kind) {
    case 'police':
      return 'Police checkpoint';
    case 'state_revenue':
      return 'State revenue';
    case 'union':
      return 'Union';
    case 'weighbridge':
      return 'Weighbridge';
    case 'park':
      return 'Park levy';
    case 'ferry':
      return 'Ferry';
    case 'other':
      return 'Other';
  }
}

/** One line for the trip screen. */
export function describeTotal(levies: readonly Levy[]): string {
  if (levies.length === 0) return 'Nothing recorded on the road yet.';
  const stops = levies.length === 1 ? '1 stop' : `${levies.length} stops`;
  return `${format(total(levies))} over ${stops}.`;
}

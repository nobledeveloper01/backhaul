/**
 * The same run, every week.
 *
 * Most freight is not a one-off. A distributor moves a trailer of cement from
 * Lagos to Kano every Tuesday; a mill takes grain from Kaduna to Ibadan twice
 * a month. Today each of those is posted from scratch, priced from scratch and
 * argued from scratch, and the fact that it is the fortieth time is worth
 * nothing to anybody.
 *
 * A lane is that repetition, named. It is the smallest feature here and the
 * one with the most leverage: a shipper with three saved lanes posts in two
 * taps, and a **carrier who has run a lane eleven times is a different
 * proposition from one who has never seen it** — which is the first thing in
 * this product that gets better simply because time passed.
 */

import type { Kobo } from './money.ts';
import type { TruckClass } from './pricing.ts';

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'ad_hoc';

export interface Lane {
  readonly id: string;
  readonly shipperId: string;
  /** What a person calls it: "Tuesday cement". */
  readonly name: string;
  readonly origin: string;
  readonly destination: string;
  readonly cargo: string;
  readonly weightKg: number;
  readonly truck: TruckClass;
  readonly cadence: Cadence;
  /** What it has actually gone for, most recent last. */
  readonly history: readonly Kobo[];
  readonly lastRunAt: Date | null;
}

export const CADENCE_MS: Readonly<Record<Cadence, number>> = {
  weekly: 7 * 86_400_000,
  fortnightly: 14 * 86_400_000,
  monthly: 30 * 86_400_000,
  // Not a schedule. Never produces a "due" prompt.
  ad_hoc: 0,
} as const;

/**
 * Whether this lane is about to come round again.
 *
 * Two days of warning, so a shipper posts before the day rather than on it —
 * a load posted the morning it must move is a load that goes to whoever is
 * nearest rather than to whoever is best.
 */
export const DUE_WARNING_MS = 2 * 86_400_000;

export function dueIn(lane: Lane, now: Date): number | null {
  if (lane.cadence === 'ad_hoc' || lane.lastRunAt === null) return null;
  return lane.lastRunAt.getTime() + CADENCE_MS[lane.cadence] - now.getTime();
}

export function isDue(lane: Lane, now: Date): boolean {
  const remaining = dueIn(lane, now);
  return remaining !== null && remaining <= DUE_WARNING_MS;
}

/**
 * What this lane has been going for.
 *
 * The **median of the last six**, not the average of everything. A lane's price
 * drifts, and a mean over two years anchors a shipper to a number that stopped
 * being true — while one panic-priced trip during a fuel shortage would drag an
 * average for a year.
 */
export const RECENT_RUNS = 6;

export const MINIMUM_RUNS_FOR_TYPICAL = 3;

export function typicalPrice(lane: Lane): Kobo | null {
  if (lane.history.length < MINIMUM_RUNS_FOR_TYPICAL) return null;

  const recent = [...lane.history].slice(-RECENT_RUNS).sort((a, b) => a - b);
  const middle = Math.floor(recent.length / 2);

  if (recent.length % 2 === 1) return recent[middle] as Kobo;

  const lower = recent[middle - 1] ?? 0;
  const upper = recent[middle] ?? 0;
  return Math.round((lower + upper) / 2) as Kobo;
}

/**
 * Whether this run is priced unusually against the lane's own history.
 *
 * A quarter either way. Not an error and not a refusal — a shipper who is
 * paying 40% over their own usual rate may have a reason, and a platform that
 * blocks it is a platform they work around. It is a sentence, shown once.
 */
export const UNUSUAL_FRACTION = 0.25;

export function isUnusual(lane: Lane, offered: Kobo): boolean {
  const typical = typicalPrice(lane);
  if (typical === null || typical === 0) return false;
  return Math.abs(offered - typical) / typical > UNUSUAL_FRACTION;
}

/**
 * Lanes worth showing at the top, most overdue first.
 *
 * Ad-hoc lanes never appear here. A list that prompts about something with no
 * schedule is a list that prompts about everything.
 */
export function due(lanes: readonly Lane[], now: Date): readonly Lane[] {
  return lanes
    .filter((lane) => isDue(lane, now))
    .sort((a, b) => (dueIn(a, now) ?? 0) - (dueIn(b, now) ?? 0));
}

/** How often, in words. */
export function describeCadence(cadence: Cadence): string {
  switch (cadence) {
    case 'weekly':
      return 'Every week';
    case 'fortnightly':
      return 'Every two weeks';
    case 'monthly':
      return 'Every month';
    case 'ad_hoc':
      return 'When needed';
  }
}

/** When it is next expected, in words a person would say. */
export function describeDue(lane: Lane, now: Date): string {
  const remaining = dueIn(lane, now);
  if (remaining === null) return describeCadence(lane.cadence);

  const days = Math.round(remaining / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

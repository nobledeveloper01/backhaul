/**
 * When the money moves.
 *
 * `pricing.ts` decides what a trip is worth. This decides *when* each part of
 * it changes hands, which is a different question and the one that actually
 * blocks trade between strangers: a carrier will not load without an advance,
 * a shipper will not pay in full before delivery, and neither will go first
 * with somebody they have never met.
 *
 * Milestones make that tractable. Each one has a **condition the platform can
 * verify from evidence it already holds** — not from somebody saying it
 * happened. A milestone that releases on a phone call is a milestone that
 * releases on an argument.
 */

import { percent, subtract, type Kobo } from './money.ts';
import type { TripState } from './trip.ts';

export type MilestoneKind = 'advance' | 'in_transit' | 'delivered' | 'retention';

export interface Milestone {
  readonly kind: MilestoneKind;
  /** Share of the fare. The four sum to 100. */
  readonly pct: number;
  /** What must be true, in words both parties read the same way. */
  readonly condition: string;
}

/**
 * The default schedule.
 *
 * 30 on loading, 20 on the road, 40 on delivery, 10 held.
 *
 * The advance is real money on the day the truck loads, because that is what
 * the diesel is bought with — a schedule that pays nothing until delivery is a
 * schedule only carriers with working capital can accept, which is not the
 * market this exists for.
 *
 * The retention is the smallest number that still means anything. It exists so
 * a shortage discovered at the market has something to be settled against; at
 * 25% it would be a carrier financing the shipper's counting.
 */
export const SCHEDULE: readonly Milestone[] = [
  {
    kind: 'advance',
    pct: 30,
    condition: 'The truck reached the depot and loading started.',
  },
  {
    kind: 'in_transit',
    pct: 20,
    condition: 'The trip has been moving with positions arriving for six hours.',
  },
  {
    kind: 'delivered',
    pct: 40,
    condition: 'Proof of delivery captured: photographs, a signature and a name.',
  },
  {
    kind: 'retention',
    pct: 10,
    condition: 'Seven days after delivery with no exception raised.',
  },
];

/** How long the retention is held. */
export const RETENTION_DAYS = 7;

/** Six hours of arriving positions before the second milestone releases. */
export const IN_TRANSIT_MS = 6 * 60 * 60_000;

/**
 * What the platform knows, at the moment a release is being decided.
 *
 * Named `EscrowConditions` rather than `Conditions` because `tracking.ts`
 * already has the latter — the fourth such collision in this package. ADR-0011
 * says what to do about it.
 */
export interface EscrowConditions {
  readonly state: TripState;
  /** How long the trip has been in transit with positions arriving. */
  readonly movingForMs: number;
  readonly podSealed: boolean;
  readonly deliveredAt: Date | null;
  readonly exceptionRaised: boolean;
}

/**
 * Whether a milestone's condition is met, from evidence the platform holds.
 *
 * Every branch reads something the tracker, the trip machine or the proof
 * engine produced. None of them reads an opinion.
 */
export function isMet(kind: MilestoneKind, conditions: EscrowConditions, now: Date): boolean {
  const started =
    conditions.state !== 'open' && conditions.state !== 'assigned';

  switch (kind) {
    case 'advance':
      return started;

    case 'in_transit':
      return started && conditions.movingForMs >= IN_TRANSIT_MS;

    case 'delivered':
      // Not the `delivered` state — the *proof*. A state is a claim somebody
      // made; the proof is photographs, a signature and a position.
      return conditions.podSealed;

    case 'retention': {
      if (conditions.deliveredAt === null || !conditions.podSealed) return false;
      // An open exception holds the retention. That is the entire reason it
      // exists, and releasing it on a timer regardless would make it theatre.
      if (conditions.exceptionRaised) return false;
      const elapsed = now.getTime() - conditions.deliveredAt.getTime();
      return elapsed >= RETENTION_DAYS * 86_400_000;
    }
  }
}

export interface Release {
  readonly milestone: Milestone;
  readonly amount: Kobo;
  readonly met: boolean;
}

/**
 * The whole schedule against a trip, with what each part is worth.
 *
 * Returns every milestone, met or not. A schedule that showed only what has
 * been released would answer "how much have I had" and never "when do I get
 * the rest", which is the question a carrier is actually asking.
 */
export function schedule(
  agreed: Kobo,
  conditions: EscrowConditions,
  now: Date,
): readonly Release[] {
  return SCHEDULE.map((milestone) => ({
    milestone,
    amount: percent(agreed, milestone.pct),
    met: isMet(milestone.kind, conditions, now),
  }));
}

export function released(releases: readonly Release[]): Kobo {
  return releases
    .filter((release) => release.met)
    .reduce((total, release) => (total + release.amount) as Kobo, 0 as Kobo);
}

export function heldBack(agreed: Kobo, releases: readonly Release[]): Kobo {
  return subtract(agreed, released(releases));
}

/**
 * The next thing that has to happen for money to move.
 *
 * The sentence a carrier wants on the screen. Null when everything has been
 * released — and then the screen says that instead, rather than an empty space
 * where a next step used to be.
 */
export function nextRelease(releases: readonly Release[]): Release | null {
  return releases.find((release) => !release.met) ?? null;
}

/**
 * Whether the schedule adds up.
 *
 * Asserted rather than assumed: a schedule that sums to 95 quietly keeps 5% of
 * every trip, and nobody would notice for months.
 */
export function sumsTo100(milestones: readonly Milestone[] = SCHEDULE): boolean {
  return milestones.reduce((total, milestone) => total + milestone.pct, 0) === 100;
}

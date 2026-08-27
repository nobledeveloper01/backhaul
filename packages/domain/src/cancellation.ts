/**
 * Who pays when a trip does not happen.
 *
 * Cancellation is where a marketplace either has rules or has arguments. A
 * shipper who cancels after a truck has driven 200 km to load has cost
 * somebody real money; a carrier who accepts a load and does not turn up has
 * cost a shipper a day. Both happen, and a platform with no position on either
 * is a platform whose disputes all end in a phone call to nobody.
 *
 * The rules here are deliberately **kind to the party that has not started
 * yet, and expensive for the one that pulls out late** — because the whole
 * value of an accepted bid is that it can be relied on.
 */

import { percent, type Kobo } from './money.ts';
import type { TripState } from './trip.ts';

export type CancelledBy = 'shipper' | 'carrier';

/**
 * What the fee is, as a share of the agreed fare, at each stage.
 *
 * A table rather than a chain of ifs: it is the thing both parties will argue
 * about, and an argument about a rule nobody can read is unwinnable.
 */
export const SHIPPER_FEE_PCT: Readonly<Partial<Record<TripState, number>>> = {
  /** Nobody has done anything. Free, and it should be. */
  assigned: 0,
  /** The truck is at the depot. Its day is gone. */
  loading: 50,
  /** Loaded and moving. This is not a cancellation, it is a return trip. */
  in_transit: 100,
};

export const CARRIER_FEE_PCT: Readonly<Partial<Record<TripState, number>>> = {
  /** Pulling out before loading. The shipper has to re-book, and that costs. */
  assigned: 20,
  /** Walking away at the depot with the goods on the ground. */
  loading: 50,
  /** Abandoning a loaded trip. There is no honest number for this; it is a
   * dispute, and the fee is a floor rather than a settlement. */
  in_transit: 100,
};

/**
 * Free-cancellation window after a bid is accepted.
 *
 * Two hours. Long enough for either side to discover the mistake they made
 * accepting, short enough that it is not a way to hold a truck for the morning
 * while shopping around.
 */
export const GRACE_MS = 2 * 60 * 60_000;

export type CancelOutcome =
  | { readonly ok: false; readonly reason: 'terminal'; readonly detail: string }
  | {
      readonly ok: true;
      readonly feePct: number;
      readonly fee: Kobo;
      readonly withinGrace: boolean;
      readonly detail: string;
    };

/**
 * What cancelling costs, right now.
 *
 * Returns the sentence as well as the number. A fee that appears without an
 * explanation is a fee somebody disputes, and the explanation has to be the
 * same one on both sides of the transaction.
 */
export function cancel(options: {
  readonly by: CancelledBy;
  readonly state: TripState;
  readonly agreed: Kobo;
  readonly acceptedAt: Date;
  readonly now: Date;
}): CancelOutcome {
  const { by, state, agreed, acceptedAt, now } = options;

  if (state === 'delivered' || state === 'cancelled') {
    return {
      ok: false,
      reason: 'terminal',
      detail: `This trip is already ${state} and cannot be cancelled.`,
    };
  }

  const withinGrace = now.getTime() - acceptedAt.getTime() <= GRACE_MS;

  // The grace period covers the stage where nothing has happened yet, and only
  // that stage. A truck already at the depot is a truck whose day is spent,
  // however recently the bid was accepted.
  if (withinGrace && state === 'assigned') {
    return {
      ok: true,
      feePct: 0,
      fee: 0 as Kobo,
      withinGrace: true,
      detail: 'Nothing to pay — this was cancelled within two hours of being accepted.',
    };
  }

  const table = by === 'shipper' ? SHIPPER_FEE_PCT : CARRIER_FEE_PCT;
  const feePct = table[state] ?? 0;
  const fee = percent(agreed, feePct);

  return {
    ok: true,
    feePct,
    fee,
    withinGrace,
    detail: explain(by, state, feePct),
  };
}

function explain(by: CancelledBy, state: TripState, feePct: number): string {
  if (feePct === 0) {
    return 'Nothing to pay at this stage.';
  }

  const stage =
    state === 'loading'
      ? 'the truck was at the depot'
      : state === 'in_transit'
        ? 'the load was already on the road'
        : 'the truck had been assigned';

  return by === 'shipper'
    ? `${feePct}% of the fare, because ${stage}.`
    : `${feePct}% of the fare, paid to the shipper, because ${stage}.`;
}

/**
 * Whether a no-show counts against the carrier's record.
 *
 * Only from `assigned` onward, and only for the carrier: a shipper cancelling
 * their own load is not somebody else's risk. It feeds `trust.ts` as an
 * incident, which costs one tier — a carrier who lets somebody down should be
 * harder to book, not unbookable.
 */
export function countsAgainstRecord(by: CancelledBy, state: TripState): boolean {
  return by === 'carrier' && state !== 'open';
}

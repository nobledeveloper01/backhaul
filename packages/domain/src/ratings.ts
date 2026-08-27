/**
 * What each side says about the other after a trip.
 *
 * **Not stars.** A five-star average is a number nobody can act on and
 * everybody games: it compresses "arrived late twice" and "damaged the load"
 * into the same 4.2, and on a two-sided market it drifts upward until
 * everyone is 4.8 and the rating carries no information at all.
 *
 * So a review here is a small set of **facts a person can answer yes or no to**,
 * and what a reader sees is how often each was true. "Loaded on time: 9 of 11
 * trips" tells a shipper something. "4.6 stars" does not.
 */

export type CarrierClaim =
  /** The truck turned up when it said it would. */
  | 'arrived_to_load'
  /** The driver could be reached during the trip. */
  | 'reachable'
  /** The goods arrived in the condition they left in. */
  | 'cargo_intact'
  /** No money was asked for beyond what was agreed. */
  | 'no_extras';

export type ShipperClaim =
  /** The load was ready when the truck got there. */
  | 'load_ready'
  /** The described weight and goods were the actual weight and goods. */
  | 'as_described'
  /** Paid within the terms agreed. */
  | 'paid_on_time'
  /** Somebody was there to receive it. */
  | 'receiver_present';

export const CARRIER_CLAIMS: readonly CarrierClaim[] = [
  'arrived_to_load',
  'reachable',
  'cargo_intact',
  'no_extras',
];

export const SHIPPER_CLAIMS: readonly ShipperClaim[] = [
  'load_ready',
  'as_described',
  'paid_on_time',
  'receiver_present',
];

export interface Review<Claim extends string> {
  readonly tripId: string;
  readonly at: Date;
  /**
   * Only the claims the reviewer answered.
   *
   * A missing answer is missing, not a no. Somebody who did not tick "the
   * driver could be reached" may simply never have needed to call.
   */
  readonly answers: Readonly<Partial<Record<Claim, boolean>>>;
  readonly note: string;
}

/**
 * How long after delivery a review may be left.
 *
 * A week. Long enough for a shortage to surface; short enough that the review
 * is about the trip rather than about the invoice argument that followed it.
 */
export const REVIEW_WINDOW_DAYS = 7;

export function reviewable(deliveredAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - deliveredAt.getTime();
  return elapsed >= 0 && elapsed <= REVIEW_WINDOW_DAYS * 86_400_000;
}

export interface Tally {
  readonly claim: string;
  readonly yes: number;
  readonly asked: number;
}

/**
 * How often each claim was true, across every review.
 *
 * Returned as counts, never as a percentage, because the denominator is the
 * part that matters: "2 of 2" and "34 of 34" are the same fraction and not the
 * same evidence, and a screen that renders only the fraction has thrown away
 * the difference.
 */
export function tally<Claim extends string>(
  reviews: readonly Review<Claim>[],
  claims: readonly Claim[],
): readonly Tally[] {
  return claims.map((claim) => {
    let yes = 0;
    let asked = 0;
    for (const review of reviews) {
      const answer = review.answers[claim];
      if (answer === undefined) continue;
      asked++;
      if (answer) yes++;
    }
    return { claim, yes, asked };
  });
}

/**
 * The fewest answers before a tally is worth rendering.
 *
 * Three. Below that a single bad trip reads as a pattern, and the person it
 * reads that way about has no way to outrun it — which is how a marketplace
 * ends up with new carriers who can never get a first load.
 */
export const MINIMUM_ANSWERS = 3;

export function worthShowing(tally_: Tally): boolean {
  return tally_.asked >= MINIMUM_ANSWERS;
}

/** Human words for a claim, in the second person a reviewer reads. */
export function askCarrier(claim: CarrierClaim): string {
  switch (claim) {
    case 'arrived_to_load':
      return 'Did the truck arrive when it said it would?';
    case 'reachable':
      return 'Could you reach the driver during the trip?';
    case 'cargo_intact':
      return 'Did the goods arrive in the condition they left in?';
    case 'no_extras':
      return 'Was the agreed price the price you paid?';
  }
}

export function askShipper(claim: ShipperClaim): string {
  switch (claim) {
    case 'load_ready':
      return 'Was the load ready when you got there?';
    case 'as_described':
      return 'Were the goods what they were described as?';
    case 'paid_on_time':
      return 'Were you paid within the terms agreed?';
    case 'receiver_present':
      return 'Was somebody there to receive it?';
  }
}

/** Short words for a tally on somebody's profile. */
export function labelCarrier(claim: CarrierClaim): string {
  switch (claim) {
    case 'arrived_to_load':
      return 'Arrived to load on time';
    case 'reachable':
      return 'Reachable on the road';
    case 'cargo_intact':
      return 'Goods arrived intact';
    case 'no_extras':
      return 'No charges beyond the quote';
  }
}

export function labelShipper(claim: ShipperClaim): string {
  switch (claim) {
    case 'load_ready':
      return 'Load ready on arrival';
    case 'as_described':
      return 'Goods as described';
    case 'paid_on_time':
      return 'Paid within terms';
    case 'receiver_present':
      return 'Receiver present';
  }
}

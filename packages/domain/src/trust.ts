/**
 * Whether a stranger with a truck can be trusted with eight million naira of
 * somebody's goods.
 *
 * The second of the four failures the product statement names: *"Neither side
 * can verify the other."* Both parties currently retreat to people they
 * already know, which is precisely what keeps the market fragmented.
 *
 * Everything here is **computed, never self-reported**. A carrier cannot set
 * their own on-time percentage any more than they can set their own
 * kilometres, because a rating somebody can type in is a rating worth nothing.
 */

export type Tier = 'unverified' | 'verified' | 'business' | 'trusted';

export interface Documents {
  readonly identity: boolean;
  readonly licence: boolean;
  /** Company registration. What separates a person from a business. */
  readonly registration: boolean;
  /** Goods-in-transit cover. Backhaul verifies it; it does not underwrite. */
  readonly insurance: boolean;
}

export interface Record_ {
  readonly tripsCompleted: number;
  /**
   * Of those, the ones that had a promised arrival to be judged against.
   *
   * The denominator of the punctuality figure, and not the same number as
   * `tripsCompleted`. A trip that was tracked but never traded has no promise
   * on it, and counting it either way is a lie: as on time it flatters a
   * carrier who was never held to anything, and as late it punishes them for
   * a deadline nobody set.
   *
   * The server had `onTime = completed` — every carrier, every trip, one
   * hundred per cent — which sailed a carrier to Trusted on document count
   * alone and made the reliability term in the bid ranking a constant.
   */
  readonly tripsPromised: number;
  /** Of the promised ones, how many arrived by the promise. */
  readonly tripsOnTime: number;
  /** Reports upheld against them. One is a bad day; three is a pattern. */
  readonly incidents: number;
}

/**
 * What each tier requires.
 *
 * Written as a table rather than a chain of ifs so the whole ladder is legible
 * at once — this is the thing a carrier will argue with, and an argument about
 * a rule nobody can read is unwinnable.
 */
export const REQUIREMENTS = {
  unverified: { docs: [] as (keyof Documents)[], trips: 0, onTime: 0 },
  verified: { docs: ['identity', 'licence'] as (keyof Documents)[], trips: 0, onTime: 0 },
  business: {
    docs: ['identity', 'licence', 'registration'] as (keyof Documents)[],
    trips: 5,
    onTime: 0.7,
  },
  trusted: {
    docs: ['identity', 'licence', 'registration', 'insurance'] as (keyof Documents)[],
    trips: 20,
    onTime: 0.9,
  },
} as const;

/**
 * The highest tier this carrier has earned.
 *
 * **An incident drops a carrier one tier**, and does not zero them. Somebody
 * whose truck was robbed is not thereby untrustworthy, and a system that
 * treats one bad trip as career-ending is one that carriers will lie to.
 */
export function tierOf(documents: Documents, record: Record_): Tier {
  /*
    One answer about punctuality, and it can be "not enough to say".

    `onTimeRate` is the same function the screen shows a percentage from, and
    it returns null below five promised trips — so a tier that names a
    punctuality bar is not earned on one kept promise any more than a badge is
    printed from one. A tier is a claim this platform makes to a shipper about
    a stranger, and the ladder fails closed rather than making it on nothing.
  */
  const rate = onTimeRate(record);

  const ladder: readonly Tier[] = ['trusted', 'business', 'verified', 'unverified'];

  const earned =
    ladder.find((tier) => {
      const need = REQUIREMENTS[tier];
      return (
        need.docs.every((doc) => documents[doc]) &&
        record.tripsCompleted >= need.trips &&
        (need.onTime === 0 || (rate !== null && rate >= need.onTime))
      );
    }) ?? 'unverified';

  if (record.incidents === 0) return earned;

  const index = ladder.indexOf(earned);
  // One step down per incident, floored at unverified.
  const dropped = Math.min(ladder.length - 1, index + record.incidents);
  return ladder[dropped] ?? 'unverified';
}

/** What is missing between here and the next tier up. */
export function nextStep(
  documents: Documents,
  record: Record_,
): { readonly tier: Tier; readonly missing: readonly string[] } | null {
  const current = tierOf(documents, record);
  const ladder: readonly Tier[] = ['unverified', 'verified', 'business', 'trusted'];
  const next = ladder[ladder.indexOf(current) + 1];
  if (next === undefined) return null;

  const need = REQUIREMENTS[next];
  const rate = onTimeRate(record);
  const missing: string[] = [];

  const names: Record<keyof Documents, string> = {
    identity: 'a government ID',
    licence: "a driver's licence",
    registration: 'company registration',
    insurance: 'goods-in-transit cover',
  };

  for (const doc of need.docs) {
    if (!documents[doc]) missing.push(names[doc]);
  }
  if (record.tripsCompleted < need.trips) {
    const short = need.trips - record.tripsCompleted;
    missing.push(`${short} more completed trip${short === 1 ? '' : 's'}`);
  }
  /*
    Punctuality, and the two different things standing in its way.

    A tier that names a punctuality bar cannot be earned without punctuality
    evidence — otherwise a carrier nobody ever gave a deadline to walks into
    Trusted, which is the defect this whole shape exists to close. But being
    short of evidence is not the same as being late, and telling somebody they
    need "90% on-time delivery" when they have never been given a delivery date
    is an accusation and a dead end.

    So: too little evidence names the evidence; enough evidence and a poor
    record names the record.
  */
  if (need.onTime > 0 && rate === null) {
    const short = MINIMUM_TRIPS_FOR_RATE - record.tripsPromised;
    missing.push(`${short} more trip${short === 1 ? '' : 's'} with an agreed delivery date`);
  } else if (rate !== null && rate < need.onTime) {
    missing.push(`${Math.round(need.onTime * 100)}% on-time delivery`);
  }

  return { tier: next, missing };
}

/**
 * A document that is about to stop being valid.
 *
 * Insurance and licences expire, and a tier resting on an expired document is
 * a tier that is lying. Warned ahead rather than revoked on the day, because a
 * carrier who loses a tier mid-trip loses work they have already committed to.
 */
export const EXPIRY_WARNING_DAYS = 30;

export function expiringSoon(
  expiries: readonly { readonly kind: keyof Documents; readonly on: Date }[],
  now: Date,
): readonly { readonly kind: keyof Documents; readonly days: number }[] {
  return expiries
    .map((entry) => ({
      kind: entry.kind,
      days: Math.floor((entry.on.getTime() - now.getTime()) / 86_400_000),
    }))
    .filter((entry) => entry.days <= EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.days - b.days);
}

/**
 * On-time, as a fraction, or null.
 *
 * Null below five trips rather than a percentage from a handful. "100% on
 * time" from one delivery is technically true and completely misleading, and
 * it is the number a shipper will decide on.
 */
export const MINIMUM_TRIPS_FOR_RATE = 5;

export function onTimeRate(record: Record_): number | null {
  // Counted over trips that had a promise. Five *deliveries* with no deadline
  // between them is not five pieces of evidence about punctuality, and the
  // shape of this answer — a rate or nothing — is what stops a screen showing
  // a percentage nobody earned.
  if (record.tripsPromised < MINIMUM_TRIPS_FOR_RATE) return null;
  return record.tripsOnTime / record.tripsPromised;
}

/**
 * The ladder, lowest first. One order, named once.
 *
 * `tierOf` walks it downward to find the highest tier earned and upward to
 * drop a tier per incident; `meets` compares two rungs. Three readings of one
 * ordering, and a fourth spelling of it somewhere else is how a carrier ends
 * up admitted by one rule and refused by another.
 */
export const LADDER: readonly Tier[] = ['unverified', 'verified', 'business', 'trusted'];

/**
 * Whether a carrier at `held` may take work that asks for `required`.
 *
 * Above the bar counts. A shipper who asks for Verified is saying "not a
 * stranger off the street", not "exactly this rung" — refusing a Trusted
 * carrier from a Verified load would be the platform enforcing a distinction
 * nobody meant.
 *
 * The comparison is here rather than in the API because both sides do it: the
 * board greys a load a carrier cannot take, and the bid endpoint refuses it.
 * Those must agree, or the app shows a load it will then be told it cannot
 * have — which reads as a bug in the platform rather than a bar the shipper
 * set.
 */
export function meets(held: Tier, required: Tier): boolean {
  return LADDER.indexOf(held) >= LADDER.indexOf(required);
}

/** "Verified", "Business", "Trusted" — for a badge. */
export function describeTier(tier: Tier): string {
  switch (tier) {
    case 'unverified':
      return 'Not verified';
    case 'verified':
      return 'Verified';
    case 'business':
      return 'Business';
    case 'trusted':
      return 'Trusted';
  }
}

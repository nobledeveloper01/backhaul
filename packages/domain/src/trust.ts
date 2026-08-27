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
  const onTime = record.tripsCompleted === 0 ? 0 : record.tripsOnTime / record.tripsCompleted;

  const ladder: readonly Tier[] = ['trusted', 'business', 'verified', 'unverified'];

  const earned =
    ladder.find((tier) => {
      const need = REQUIREMENTS[tier];
      return (
        need.docs.every((doc) => documents[doc]) &&
        record.tripsCompleted >= need.trips &&
        onTime >= need.onTime
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
  const onTime = record.tripsCompleted === 0 ? 0 : record.tripsOnTime / record.tripsCompleted;
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
  if (onTime < need.onTime && record.tripsCompleted > 0) {
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
  if (record.tripsCompleted < MINIMUM_TRIPS_FOR_RATE) return null;
  return record.tripsOnTime / record.tripsCompleted;
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

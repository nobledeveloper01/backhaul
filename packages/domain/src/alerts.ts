/**
 * What actually reaches somebody's phone.
 *
 * Every engine here can produce a condition worth knowing about — a stall, a
 * silence, a deviation, an incident, a link about to expire. **None of them
 * should decide whether to interrupt a person at 3am.** That is one policy,
 * and it lives here, because the failure mode is cumulative: six engines each
 * sending a reasonable number of notifications produce a shipper who turns
 * notifications off, and then the one that mattered is the one they missed.
 *
 * The thresholds in `tracking.ts` are wide for the same reason. This is the
 * second half of that argument.
 */

export type AlertKind =
  | 'signal_lost'
  | 'stalled'
  | 'deviating'
  | 'late'
  | 'incident'
  | 'duress'
  | 'delivered'
  | 'bid_received'
  | 'link_expiring';

export type Audience = 'shipper' | 'carrier' | 'driver';

/**
 * How much this is allowed to interrupt.
 *
 * Three levels, and the top one is deliberately almost empty: if everything is
 * urgent, nothing is.
 */
export type Urgency =
  /** Wakes a person. Overrides quiet hours. */
  | 'urgent'
  /** A normal push. Held until quiet hours end. */
  | 'push'
  /** Shows in the app. Never a notification. */
  | 'quiet';

export interface AlertPolicy {
  readonly kind: AlertKind;
  readonly to: readonly Audience[];
  readonly urgency: Urgency;
  /**
   * How long before the same condition on the same trip may fire again.
   *
   * A truck on a northern corridor enters and leaves `signal_lost` repeatedly.
   * Without this, one bad stretch of road is fourteen notifications and the
   * shipper stops reading all of them.
   */
  readonly repeatAfterMs: number;
}

const HOUR = 60 * 60_000;

/**
 * The whole policy, as a table.
 *
 * Written out rather than derived, for the same reason the trip machine is: it
 * is the thing anyone arguing about notifications needs to read, and a rule
 * assembled from three functions is a rule nobody can check.
 */
export const POLICY: Readonly<Record<AlertKind, AlertPolicy>> = {
  // The tracker's own observations. Both go to the two people who are not in
  // the cab; telling a driver their signal dropped is telling them what they
  // can already see out of the window.
  signal_lost: {
    kind: 'signal_lost',
    to: ['shipper', 'carrier'],
    urgency: 'quiet',
    repeatAfterMs: 6 * HOUR,
  },
  stalled: {
    kind: 'stalled',
    to: ['shipper', 'carrier'],
    urgency: 'push',
    repeatAfterMs: 4 * HOUR,
  },
  deviating: {
    kind: 'deviating',
    to: ['shipper', 'carrier'],
    urgency: 'push',
    repeatAfterMs: 2 * HOUR,
  },
  late: {
    kind: 'late',
    to: ['shipper'],
    urgency: 'push',
    // Once. A delivery does not become more late in a way that needs saying
    // twice, and the second one only teaches somebody to ignore the first.
    repeatAfterMs: 24 * HOUR,
  },
  incident: {
    kind: 'incident',
    to: ['shipper', 'carrier'],
    urgency: 'push',
    repeatAfterMs: HOUR,
  },

  // The only urgent one, and the only one that reaches everybody.
  duress: {
    kind: 'duress',
    to: ['shipper', 'carrier', 'driver'],
    urgency: 'urgent',
    repeatAfterMs: 5 * 60_000,
  },

  delivered: {
    kind: 'delivered',
    to: ['shipper', 'carrier'],
    urgency: 'push',
    repeatAfterMs: 24 * HOUR,
  },
  bid_received: {
    kind: 'bid_received',
    to: ['shipper'],
    urgency: 'quiet',
    repeatAfterMs: 30 * 60_000,
  },
  link_expiring: {
    kind: 'link_expiring',
    to: ['shipper'],
    urgency: 'quiet',
    repeatAfterMs: 24 * HOUR,
  },
} as const;

/** Quiet hours, in whole hours of the reader's own day. */
export const QUIET_FROM_HOUR = 22;

export const QUIET_TO_HOUR = 6;

/**
 * Whether a given hour is inside quiet hours.
 *
 * Takes the hour rather than a `Date` so the caller has to have decided whose
 * midnight it is. A shipper in Lagos and a driver in Kano share a timezone
 * today; assuming that inside an engine is how it breaks the first time
 * somebody ships from Accra.
 */
export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_FROM_HOUR || hour < QUIET_TO_HOUR;
}

export type Decision =
  | { readonly send: true; readonly urgency: Urgency }
  | { readonly send: false; readonly reason: 'wrong_audience' | 'too_soon' | 'quiet_hours' };

/**
 * Whether to send this, now, to this person.
 *
 * A `quiet` alert never becomes a notification, so quiet hours do not apply to
 * it — it is already not going to wake anybody. A `push` inside quiet hours is
 * held rather than dropped: the condition is still true in the morning, and
 * dropping it silently is how a shipper finds out about a stall at noon.
 */
export function decideAlert(options: {
  readonly kind: AlertKind;
  readonly to: Audience;
  readonly localHour: number;
  readonly lastSentAt: Date | null;
  readonly now: Date;
}): Decision {
  const policy = POLICY[options.kind];

  if (!policy.to.includes(options.to)) {
    return { send: false, reason: 'wrong_audience' };
  }

  if (options.lastSentAt !== null) {
    const since = options.now.getTime() - options.lastSentAt.getTime();
    if (since < policy.repeatAfterMs) {
      return { send: false, reason: 'too_soon' };
    }
  }

  if (
    policy.urgency === 'push' &&
    isQuietHour(options.localHour)
  ) {
    return { send: false, reason: 'quiet_hours' };
  }

  return { send: true, urgency: policy.urgency };
}

/**
 * Everything held back overnight, as one message.
 *
 * The alternative — releasing four held notifications at 06:00 — is four
 * buzzes in a minute, which reads as a malfunction rather than as a summary.
 */
export function digest(held: readonly AlertKind[]): string | null {
  if (held.length === 0) return null;

  const counted = new Map<AlertKind, number>();
  for (const kind of held) counted.set(kind, (counted.get(kind) ?? 0) + 1);

  const parts = [...counted.entries()].map(([kind, count]) =>
    count === 1 ? describeAlert(kind) : `${describeAlert(kind)} (${count})`,
  );

  return parts.length === 1
    ? `Overnight: ${parts[0]}.`
    : `Overnight: ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`;
}

/** Plain words. Never a state name with an underscore in it. */
export function describeAlert(kind: AlertKind): string {
  switch (kind) {
    case 'signal_lost':
      return 'no signal';
    case 'stalled':
      return 'a truck not moving';
    case 'deviating':
      return 'a truck off course';
    case 'late':
      return 'a delivery running late';
    case 'incident':
      return 'a problem reported';
    case 'duress':
      return 'a driver in trouble';
    case 'delivered':
      return 'a delivery signed for';
    case 'bid_received':
      return 'a new bid';
    case 'link_expiring':
      return 'a tracking link about to expire';
  }
}

/**
 * Letting somebody watch a trip without an account.
 *
 * The wedge depends on this. Tracking is worth paying for with one truck and
 * no other user on the platform — but only if the person who wants to *see*
 * the truck can see it, and that person is usually a cargo owner who has never
 * heard of Backhaul and will not install anything to find out where their
 * goods are.
 *
 * So a trip can be shared as a link. Anyone holding it sees that one trip and
 * nothing else, for as long as the link lives.
 */

/**
 * What a link lets its holder see.
 *
 * Named rather than boolean, because "share the trip" means different things
 * to a cargo owner and to somebody's brother-in-law, and the difference is
 * whose phone number is on the screen.
 */
export type ShareScope =
  /** Where it is, when it arrives, and nothing else. */
  | 'position'
  /** Position, plus the history and what was discarded from the track. */
  | 'evidence';

export interface ShareLink {
  /** The secret. 32 bytes of randomness, rendered as hex by the caller. */
  readonly token: string;
  readonly tripId: string;
  readonly scope: ShareScope;
  readonly issuedAt: Date;
  /** Null means it does not expire, which nothing here should be. */
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  /** Free text: "Musa's brother", "the depot". Shown when revoking. */
  readonly label: string;
}

/**
 * How long a link lives by default.
 *
 * Fourteen days. Long enough to cover a three-day trip and the argument
 * afterwards; short enough that a link pasted into a WhatsApp group stops
 * working before the truck is somewhere else entirely.
 *
 * A link with no expiry is a permanent, unauthenticated view of where
 * somebody's truck is. That is a thing worth stealing.
 */
export const DEFAULT_SHARE_DAYS = 14;

export type ShareRefusal =
  | 'revoked'
  | 'expired'
  | 'unknown';

export type ShareCheck =
  | { readonly ok: true; readonly link: ShareLink }
  | { readonly ok: false; readonly reason: ShareRefusal; readonly detail: string };

/**
 * Whether a link still works.
 *
 * Expiry and revocation are checked together and answered separately, because
 * the two need different words: a revoked link was deliberately turned off by
 * somebody, and an expired one simply ran out. Telling a cargo owner "this
 * link was revoked" when it merely lapsed invites a phone call about trust.
 */
export function check(
  link: ShareLink | undefined,
  now: Date,
): ShareCheck {
  if (link === undefined) {
    return {
      ok: false,
      reason: 'unknown',
      detail: 'This link is not one we issued. Ask for a new one.',
    };
  }

  if (link.revokedAt !== null) {
    return {
      ok: false,
      reason: 'revoked',
      detail: 'This link was turned off. Ask whoever sent it for a new one.',
    };
  }

  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      detail: 'This link has expired. Ask whoever sent it for a new one.',
    };
  }

  return { ok: true, link };
}

/**
 * The message that goes with the link.
 *
 * Written out here rather than in a screen because it is what an unknown
 * person reads first, and because it has to survive being pasted into SMS —
 * no formatting, no emoji, under 160 characters including the URL.
 *
 * It says who sent it. A bare tracking link from an unknown number is
 * indistinguishable from a phishing message, and the whole point is that the
 * recipient trusts it enough to open it.
 */
export function invite(options: {
  readonly from: string;
  readonly cargo: string;
  readonly destination: string;
  readonly url: string;
}): string {
  return (
    `${options.from} is sending ${options.cargo} to ${options.destination}. ` +
    `Follow it here: ${options.url}`
  );
}

/** Days left, floored, or null for a link that does not expire. */
export function daysLeft(link: ShareLink, now: Date): number | null {
  if (link.expiresAt === null) return null;
  const remaining = link.expiresAt.getTime() - now.getTime();
  // Floored, and never negative: "expires in -2 days" is not a sentence, and
  // rounding up would promise a day the link does not have.
  return remaining <= 0 ? 0 : Math.floor(remaining / 86_400_000);
}

/**
 * What a holder of this link may be shown.
 *
 * Returned as a set of flags rather than checked at each render site, for the
 * same reason authorisation is a query filter on the server: a new field added
 * to a screen inherits the decision instead of forgetting it.
 */
export interface Visible {
  readonly position: boolean;
  readonly eta: boolean;
  readonly history: boolean;
  readonly trackQuality: boolean;
  /** Never. A share link is not a route to somebody's phone number. */
  readonly contactDetails: false;
  /** Never. What a load is worth is between the two parties on it. */
  readonly money: false;
}

export function visibleUnder(scope: ShareScope): Visible {
  return {
    position: true,
    eta: true,
    history: scope === 'evidence',
    trackQuality: scope === 'evidence',
    contactDetails: false,
    money: false,
  };
}

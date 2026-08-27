/**
 * Signing in with a phone number and a code.
 *
 * The only sign-in this product can have. A driver on a northern corridor has
 * a phone number and often no email address; a password is a thing to forget
 * on a device shared between two drivers on alternate weeks. The number is
 * also the thing a carrier already has written down.
 *
 * Everything here is policy — how long a code lives, how many guesses it gets,
 * how often one may be asked for. It is in the domain rather than in the
 * server because it is exactly the kind of rule that gets loosened one line at
 * a time when somebody is debugging, and because the client has to show the
 * same countdown the server is enforcing.
 */

/**
 * Six digits.
 *
 * Four is guessable inside the attempt limit if an attacker is patient across
 * many numbers; eight is a thing people read back wrong over a bad line. Six
 * is what every Nigerian bank and telco sends, which matters more than either:
 * it is the length a person expects to be typing.
 */
export const CODE_LENGTH = 6;

/**
 * How long a code lives.
 *
 * Ten minutes. Long enough for an SMS to arrive on a congested network — which
 * on these corridors can take several minutes — and short enough that a code
 * read off a lock screen an hour later is useless.
 */
export const CODE_LIVES_MS = 10 * 60_000;

/**
 * Guesses before the code is burned.
 *
 * Five. A person mistyping has two or three goes in them; a script has
 * millions, and the only defence against that is to stop counting.
 */
export const MAX_ATTEMPTS = 5;

/**
 * How long before another code may be asked for.
 *
 * Sixty seconds. The screen shows this as a countdown rather than a disabled
 * button with no explanation — somebody whose SMS has not arrived needs to
 * know they are waiting rather than that something is broken.
 */
export const RESEND_AFTER_MS = 60_000;

/**
 * Codes per number per hour.
 *
 * Five. Each one is an SMS somebody pays for, and an unauthenticated endpoint
 * that sends messages on request is a way to spend a company's money and to
 * harass a phone number.
 */
export const MAX_PER_HOUR = 5;

/**
 * Nigerian mobile numbers, normalised to E.164.
 *
 * The same phone is written `0803 123 4567`, `+2348031234567`, `2348031234567`
 * and `803 123 4567` by four different people, and every one of them means the
 * same driver. Storing what was typed means a driver who signs in one way and
 * back another way is two accounts.
 *
 * Returns null rather than guessing. A number this does not recognise is one
 * to ask about, not one to normalise into somebody else's.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');

  // +234...
  if (digits.startsWith('+234')) {
    const rest = digits.slice(4);
    return rest.length === 10 ? `+234${rest}` : null;
  }

  // 234...
  if (digits.startsWith('234')) {
    const rest = digits.slice(3);
    return rest.length === 10 ? `+234${rest}` : null;
  }

  // 0803...  — the national form, and the one people actually say out loud.
  if (digits.startsWith('0')) {
    const rest = digits.slice(1);
    return rest.length === 10 ? `+234${rest}` : null;
  }

  // 803... — what somebody types when they have already typed +234 elsewhere.
  if (/^[789]\d{9}$/.test(digits)) {
    return `+234${digits}`;
  }

  return null;
}

/** How it is shown back: `0803 123 4567`. Nobody reads +234 out loud. */
export function formatPhone(e164: string): string {
  if (!e164.startsWith('+234') || e164.length !== 14) return e164;
  const national = `0${e164.slice(4)}`;
  return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
}

export interface Challenge {
  readonly phone: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly attempts: number;
  /** Set when the code was used. A used code is never usable again. */
  readonly consumedAt: Date | null;
}

export type CodeRefusal =
  /** No code was ever asked for, or it is long gone. */
  | 'unknown'
  | 'expired'
  /** Too many wrong guesses. The code is burned; ask for another. */
  | 'exhausted'
  /** Already signed in with. */
  | 'used'
  | 'wrong';

export type CodeCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CodeRefusal; readonly detail: string };

/**
 * Whether a code is good.
 *
 * The comparison itself belongs to the server, which holds the hash. This
 * decides everything around it — and the order matters: a burned code says so
 * rather than saying "wrong", because a person who has mistyped five times
 * needs a new code and not a sixth attempt at the same one.
 */
export function checkCode(
  challenge: Challenge | undefined,
  matches: boolean,
  now: Date,
): CodeCheck {
  if (challenge === undefined) {
    return {
      ok: false,
      reason: 'unknown',
      detail: 'Ask for a new code — this one is not one we sent.',
    };
  }

  if (challenge.consumedAt !== null) {
    return {
      ok: false,
      reason: 'used',
      detail: 'That code has already been used. Ask for a new one.',
    };
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: 'exhausted',
      detail: 'Too many tries. Ask for a new code.',
    };
  }

  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      detail: 'That code has expired. Ask for a new one.',
    };
  }

  if (!matches) {
    const left = MAX_ATTEMPTS - challenge.attempts - 1;
    return {
      ok: false,
      reason: 'wrong',
      // Says how many are left. A person who has mistyped needs to know
      // whether to try again or to ask for another code, and finding out by
      // running out is the worst way to learn it.
      detail:
        left <= 0
          ? 'That code is wrong, and that was the last try. Ask for a new one.'
          : `That code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
    };
  }

  return { ok: true };
}

/** Milliseconds until another code may be asked for, or 0. */
export function resendIn(lastIssuedAt: Date | null, now: Date): number {
  if (lastIssuedAt === null) return 0;
  const waited = now.getTime() - lastIssuedAt.getTime();
  return waited >= RESEND_AFTER_MS ? 0 : RESEND_AFTER_MS - waited;
}

/** Whether this number has asked for too many codes this hour. */
export function tooManyRequests(issuedAt: readonly Date[], now: Date): boolean {
  const hourAgo = now.getTime() - 60 * 60_000;
  return issuedAt.filter((at) => at.getTime() >= hourAgo).length >= MAX_PER_HOUR;
}

/**
 * The message.
 *
 * Under 160 characters, no link, and it says the code is not to be shared —
 * because the commonest way a code is stolen is somebody phoning the person
 * who just received it and asking for it.
 */
export function codeMessage(code: string): string {
  return `${code} is your Backhaul code. It lasts 10 minutes. Do not share it with anyone, including anyone who says they are from Backhaul.`;
}

/**
 * A driver in trouble.
 *
 * The product statement lists armed robbery and hijack as live risks on these
 * corridors, and `incidents.ts` already takes a report afterwards. This is the
 * one that has to work *during*.
 *
 * Everything here is shaped by one constraint: **whoever is standing over the
 * driver must not be able to tell that it happened.** A confirmation dialog, a
 * success toast, a changed screen, a sound — any of them turns a silent alarm
 * into a reason to take the phone. So the engine's answer to "did it send?" is
 * deliberately not something the screen may render.
 */

export type DuressTrigger =
  /** A long press on something that looks like nothing. */
  | 'hidden_press'
  /** The panic PIN entered where the normal one goes. */
  | 'duress_pin'
  /** Power button pressed five times, which the OS surfaces. */
  | 'hardware';

export interface DuressSignal {
  readonly tripId: string;
  readonly trigger: DuressTrigger;
  readonly at: Date;
  /** The last known fix. Null if there is none, which is itself worth sending. */
  readonly near: { readonly lat: number; readonly lon: number } | null;
  readonly batteryFraction: number | null;
}

/**
 * How long a hidden press has to be held.
 *
 * Three seconds. Long enough that a pocket cannot do it, short enough for
 * somebody whose hands are shaking.
 */
export const HOLD_MS = 3_000;

/**
 * How long the app keeps sending after the signal.
 *
 * Thirty minutes at the fastest cadence the tracker has, regardless of battery
 * policy, trip state or what the driver's screen says. A hijacked truck is
 * found by where it goes next, not by where it was when the alarm went.
 */
export const FOLLOW_MS = 30 * 60_000;

export const FOLLOW_INTERVAL_S = 30;

/**
 * What the driver's screen may show after a duress signal.
 *
 * **Nothing.** This function exists so that the answer is written down in the
 * domain, tested, and impossible for a screen to disagree with — rather than
 * being a comment somebody removes while making the empty state "friendlier".
 */
export function visibleConfirmation(): null {
  return null;
}

/**
 * Whether the tracker should ignore its own battery policy.
 *
 * True for the follow window. A phone that dies twenty minutes into a hijack
 * has still bought twenty minutes of positions, and conserving battery to
 * finish a trip is a trade that assumes the trip is still happening.
 */
export function overridesBatterySaving(signal: DuressSignal, now: Date): boolean {
  return now.getTime() - signal.at.getTime() <= FOLLOW_MS;
}

export type Recipient = 'carrier' | 'shipper' | 'contact';

/**
 * Who is told, and in what order.
 *
 * The carrier first: they know the driver, the truck and the road, and they
 * are the ones who will make a phone call in the next sixty seconds. The
 * shipper second — their goods, but nothing they can do about it in the
 * moment. An emergency contact last and only if one was given.
 *
 * **Not the police, and not automatically.** A platform that dispatches a
 * response on a signal it cannot verify is a platform that gets used to
 * dispatch responses.
 */
export function tell(hasEmergencyContact: boolean): readonly Recipient[] {
  return hasEmergencyContact ? ['carrier', 'shipper', 'contact'] : ['carrier', 'shipper'];
}

/**
 * The message. Short, factual, and it says what to do.
 *
 * No embellishment: whoever reads this is about to make a decision under
 * pressure, and every word that is not a fact is a word in the way.
 */
export function alertText(options: {
  readonly plate: string;
  readonly driver: string;
  readonly where: string;
  readonly at: Date;
  readonly formatTime: (at: Date) => string;
}): string {
  return (
    `${options.driver} raised an alarm on ${options.plate} at ` +
    `${options.formatTime(options.at)}, near ${options.where}. ` +
    'The truck is being tracked every 30 seconds. Call the driver before anyone else.'
  );
}

/**
 * Whether a signal is still live.
 *
 * A duress signal is never "resolved" by the system — only by a person saying
 * so. Time alone cannot clear it: a truck that went quiet an hour after the
 * alarm is the case that most needs to stay open.
 */
export function isLive(signal: DuressSignal, clearedAt: Date | null): boolean {
  return clearedAt === null || clearedAt.getTime() < signal.at.getTime();
}

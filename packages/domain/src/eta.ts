/**
 * When the truck gets there.
 *
 * An ETA is the single figure everybody in this product looks at, and it is
 * the easiest one to get confidently wrong. The rules here are the same ones
 * Grid applies to a bill projection:
 *
 * - a **range**, not a point, because a point reads as a promise;
 * - a **refusal** when the evidence is too thin, rather than a wide range
 *   dressed up as an answer;
 * - the **reason** carried with the refusal, so the screen can say what would
 *   fix it.
 *
 * A sealed result rather than a nullable one, so no screen can render
 * "arriving null".
 */

import { distance, type Metres, type Position } from './geo.ts';

/** Metres per second. */
export type Speed = number;

/**
 * The pace a trip is actually making, including its stops.
 *
 * This is the number that matters and it is not the speedometer. A trailer
 * that cruises at 80 km/h and spends nine hours of a Lagos–Kano run at
 * checkpoints, fuel queues and a night stop makes about 35 km/h over the day.
 * Projecting an arrival from cruising speed produces an ETA that is wrong by
 * most of a day and looks authoritative doing it.
 */
export function effectivePace(track: readonly Position[]): Speed | null {
  const first = track[0];
  const last = track.at(-1);
  if (first === undefined || last === undefined || track.length < 2) return null;

  const seconds = (last.at.getTime() - first.at.getTime()) / 1000;
  if (seconds <= 0) return null;

  let travelled = 0;
  for (let i = 1; i < track.length; i++) {
    const from = track[i - 1];
    const to = track[i];
    if (from === undefined || to === undefined) continue;
    travelled += distance(from, to);
  }
  return travelled / seconds;
}

/**
 * A fallback pace by truck class, in metres per second, for a trip with no
 * history yet.
 *
 * Door-to-door averages over a long run, not cruising speeds. Used only for
 * the estimate a shipper sees *before* the truck moves, and every result built
 * on it is marked `modelled`.
 */
export const NOMINAL_PACE: Readonly<Record<string, Speed>> = {
  pickup: 11.1, // 40 km/h
  canter: 10.0, // 36
  truck_15t: 9.4, // 34
  trailer_30t: 8.6, // 31
  lowbed: 6.9, // 25
};

/** Least evidence an ETA may be built on. */
export const MINIMUM_FIXES = 4;
export const MINIMUM_WINDOW_MS = 30 * 60_000;
/** Below this, the truck is stopped and its pace says nothing about arrival. */
export const MINIMUM_PACE_MS = 1.5;

export type EtaRefusal =
  | 'no_track'
  | 'not_enough_fixes'
  | 'window_too_short'
  | 'not_moving'
  | 'stale';

export interface EtaKnown {
  readonly kind: 'known';
  readonly earliest: Date;
  readonly expected: Date;
  readonly latest: Date;
  readonly remaining: Metres;
  readonly pace: Speed;
  /** True when the pace came from `NOMINAL_PACE` rather than this truck's own
   * track. Rendered dashed and labelled, never silently. */
  readonly isModelled: boolean;
}

export interface EtaUnknown {
  readonly kind: 'unknown';
  readonly reason: EtaRefusal;
  /** What would fix it, in one sentence, for the screen to render. */
  readonly detail: string;
}

export type Eta = EtaKnown | EtaUnknown;

/**
 * How wide the range runs, either side of the expectation.
 *
 * A quarter. Wide enough to be honest about a road where a single checkpoint
 * costs an hour, narrow enough to be worth reading. A range so wide it always
 * contains the truth is not information.
 */
const SPREAD = 0.25;

/** Beyond this with no fix, the last pace says nothing about now. */
export const STALE_AFTER_MS = 90 * 60_000;

export interface EtaInput {
  readonly track: readonly Position[];
  readonly destination: Position;
  readonly now: Date;
  /** Used only when the track cannot supply a pace of its own. */
  readonly truckClass?: string;
}

/**
 * Projects arrival.
 *
 * Remaining distance is the straight line to the destination, which is always
 * an underestimate of the road. That is stated rather than corrected: applying
 * a made-up detour factor would bury a guess inside a figure the range is
 * supposed to be carrying. The spread is what absorbs it.
 */
export function eta({ track, destination, now, truckClass }: EtaInput): Eta {
  const last = track.at(-1);

  // No fix at all means no position to measure the remaining distance from,
  // so a nominal pace does not help here — there is nothing to multiply it by.
  if (last === undefined) {
    return {
      kind: 'unknown',
      reason: 'no_track',
      detail: 'No positions yet. An estimate appears once the truck starts.',
    };
  }

  const silent = now.getTime() - last.at.getTime();
  if (silent > STALE_AFTER_MS) {
    return {
      kind: 'unknown',
      reason: 'stale',
      detail:
        `No signal for ${Math.round(silent / 60_000)} minutes. The last known ` +
        `pace no longer says anything about when the truck arrives.`,
    };
  }

  const remaining = distance(last, destination);
  const own = effectivePace(track);
  const nominal = truckClass === undefined ? undefined : NOMINAL_PACE[truckClass];

  if (track.length < MINIMUM_FIXES) {
    return usingNominal(nominal, remaining, now, {
      reason: 'not_enough_fixes',
      detail:
        `Only ${track.length} position${track.length === 1 ? '' : 's'} so far. ` +
        `An estimate from this truck's own pace needs ${MINIMUM_FIXES}.`,
    });
  }

  const first = track[0];
  const window =
    first === undefined ? 0 : last.at.getTime() - first.at.getTime();
  if (window < MINIMUM_WINDOW_MS) {
    return usingNominal(nominal, remaining, now, {
      reason: 'window_too_short',
      detail:
        `The track covers ${Math.round(window / 60_000)} minutes. Half an ` +
        `hour is the least that says anything about a day's driving.`,
    });
  }

  if (own === null || own < MINIMUM_PACE_MS) {
    return usingNominal(nominal, remaining, now, {
      reason: 'not_moving',
      detail:
        'The truck has not moved recently, so its pace says nothing about ' +
        'when it arrives.',
    });
  }

  return project(remaining, own, now, false);
}

/** Falls back to the class average, marked, or refuses with the given reason. */
function usingNominal(
  nominal: Speed | undefined,
  remaining: Metres,
  now: Date,
  refusal: { reason: EtaRefusal; detail: string },
): Eta {
  if (nominal === undefined) {
    return { kind: 'unknown', reason: refusal.reason, detail: refusal.detail };
  }
  return project(remaining, nominal, now, true);
}

function project(
  remaining: Metres,
  pace: Speed,
  now: Date,
  isModelled: boolean,
): EtaKnown {
  const seconds = remaining / pace;
  const ms = seconds * 1000;
  return {
    kind: 'known',
    earliest: new Date(now.getTime() + ms * (1 - SPREAD)),
    expected: new Date(now.getTime() + ms),
    latest: new Date(now.getTime() + ms * (1 + SPREAD)),
    remaining,
    pace,
    isModelled,
  };
}

/**
 * Whether the truck is going to miss a deadline it was given.
 *
 * Uses `latest`, not `expected`. A shipper needs telling while there is still
 * time to do something, and an alert that waits for the midpoint to slip
 * arrives once the decision has already been made for them.
 */
export function isLate(estimate: Eta, dueBy: Date): boolean {
  return estimate.kind === 'known' && estimate.latest.getTime() > dueBy.getTime();
}

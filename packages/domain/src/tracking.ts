/**
 * The tracking policy.
 *
 * The loop that captures positions does not live in JavaScript — it is a
 * native TurboModule that keeps running when the app is backgrounded, killed,
 * or the phone is in a pocket for nine hours. See ADR-0002.
 *
 * What lives here is the *policy* that loop follows: how often to sample, when
 * to upload, and when silence has gone on long enough to mean something. It is
 * pure so it can be tested against a nine-hour trip in a millisecond instead
 * of nine hours, and so the two native implementations cannot drift into
 * disagreeing about what "stalled" means.
 *
 * The native side asks this what to do next and does it. It decides nothing.
 */

import { distance, type Position } from './geo.ts';

/**
 * Sampling intervals, in seconds.
 *
 * The whole ladder exists for one reason: **battery is why drivers turn
 * tracking off.** A tracker that samples every five seconds is accurate for
 * the four hours until the phone dies, and then it is nothing. A driver who
 * turns it off is a trip with no evidence at all, so the policy spends its
 * battery where the road is uncertain and saves it where nothing is happening.
 */
export const INTERVAL = {
  /** Moving on an open road. Fast enough to keep the shape of the route. */
  moving: 60,
  /** Crawling — traffic, a checkpoint, a bad stretch. Position changes
   * slowly, so sampling fast buys nothing. */
  crawling: 180,
  /** Not moving. Still sampling, because the *duration* of a stop is what a
   * demurrage claim is made of, and a stop with no fixes has no duration. */
  stopped: 300,
  /** Battery is low enough that finishing the trip matters more than the
   * shape of it. */
  conserving: 900,
} as const;

export type SampleInterval = (typeof INTERVAL)[keyof typeof INTERVAL];

/** Below this fraction of battery, the policy drops to `conserving`. */
export const LOW_BATTERY = 0.15;

/** Metres per second under which a truck counts as crawling rather than moving. */
export const CRAWLING_MS = 5;

/** Metres per second under which it counts as stopped. */
export const STOPPED_MS = 0.5;

export interface Conditions {
  /** Metres per second, from the OS or derived from the last two fixes. */
  readonly speed: number;
  /** 0–1, or undefined when the OS will not say. */
  readonly battery?: number;
  /** Whether anything can be uploaded right now. */
  readonly online: boolean;
  /** Fixes waiting in the local queue. */
  readonly queued: number;
  /** When the queue last drained, or undefined if it never has. */
  readonly lastUpload?: Date;
}

export interface TrackingDecision {
  readonly sampleIn: SampleInterval;
  readonly upload: boolean;
  /** Why, in one phrase. Shown on the driver's tracking screen, because a
   * driver who cannot see why their phone is doing something assumes the worst
   * and force-quits the app. */
  readonly because: string;
}

/**
 * Upload once the queue reaches this, regardless of the clock.
 *
 * Sized against `op-sqlite` holding the queue safely for far more than this:
 * the cap is about how much evidence a lost phone costs, not about storage.
 */
export const UPLOAD_BATCH = 20;

/** Upload at least this often when there is anything at all to send. */
export const UPLOAD_EVERY_MS = 10 * 60_000;

/**
 * What the native loop should do next.
 *
 * Pure. `now` is passed in rather than read, so a nine-hour trip is a
 * millisecond of test.
 */
export function decide(conditions: Conditions, now: Date): TrackingDecision {
  const { speed, battery, online, queued, lastUpload } = conditions;

  const upload =
    online &&
    queued > 0 &&
    (queued >= UPLOAD_BATCH ||
      lastUpload === undefined ||
      now.getTime() - lastUpload.getTime() >= UPLOAD_EVERY_MS);

  // Battery outranks everything. A precise track on a dead phone is not a
  // track, and the trip has hours left to run.
  if (battery !== undefined && battery <= LOW_BATTERY) {
    return { sampleIn: INTERVAL.conserving, upload, because: 'saving battery' };
  }

  if (speed >= CRAWLING_MS) {
    return { sampleIn: INTERVAL.moving, upload, because: 'on the move' };
  }
  if (speed > STOPPED_MS) {
    return { sampleIn: INTERVAL.crawling, upload, because: 'moving slowly' };
  }
  return { sampleIn: INTERVAL.stopped, upload, because: 'stopped' };
}

/**
 * How long silence has to last before it means something.
 *
 * Twenty minutes, not five. Nigerian coverage on the northern corridors drops
 * for a quarter of an hour at a time as a matter of course, and a shipper
 * pinged every time it happens stops reading the pings — at which point the
 * alert that matters is one of forty they ignored that day.
 */
export const SIGNAL_LOST_AFTER_MS = 20 * 60_000;

/**
 * How long a truck has to sit still, away from anywhere it is meant to be,
 * before it counts as stalled.
 *
 * Forty-five minutes covers a meal, a prayer, a fuel queue and a checkpoint.
 * It does not cover a breakdown, and a breakdown is what this is for.
 */
export const STALLED_AFTER_MS = 45 * 60_000;

/** How far a truck may drift and still count as not having moved. */
export const STALL_RADIUS_M = 250;

/**
 * What the fixes say about the truck right now.
 *
 * Deliberately not the same vocabulary as `TripState`: this is an observation,
 * and the trip state is a decision made from it. Keeping them separate is what
 * lets a shipper mark a trip disputed while the tracker still says `moving`.
 */
export type Observation = 'moving' | 'stopped' | 'stalled' | 'silent' | 'unknown';

/**
 * Reads the recent track.
 *
 * `unknown` is a first-class answer, and returning it is the point: a trip
 * with two fixes an hour apart is not a stalled truck, it is a truck nobody
 * has enough information about. Guessing `moving` there would put a shipper's
 * mind at rest on the strength of nothing.
 */
export function observe(
  recent: readonly Position[],
  now: Date,
  { atWaypoint = false }: { atWaypoint?: boolean } = {},
): Observation {
  const last = recent.at(-1);
  if (last === undefined) return 'unknown';

  const silentFor = now.getTime() - last.at.getTime();
  if (silentFor >= SIGNAL_LOST_AFTER_MS) return 'silent';

  // Everything below needs a window of fixes to compare. One fix is a
  // position, not a behaviour.
  const first = recent[0];
  if (first === undefined || recent.length < 2) return 'unknown';

  const window = last.at.getTime() - first.at.getTime();
  const moved = distance(first, last);

  if (moved > STALL_RADIUS_M) return 'moving';

  // It has not moved. Whether that is a stop or a stall depends on how long
  // the fixes actually cover — and a short window cannot tell us.
  if (window < STALLED_AFTER_MS) return 'stopped';

  // A truck parked at the depot it was told to load at is not stalled, it is
  // waiting. The distinction is the whole difference between a useful alert
  // and one that fires on every scheduled stop.
  return atWaypoint ? 'stopped' : 'stalled';
}

/**
 * How long the truck has been silent, in milliseconds.
 *
 * Returns null when there are no fixes at all — which is different from having
 * been silent forever, and is rendered differently ("not started" rather than
 * "no signal for 9 hours").
 */
export function silentFor(
  recent: readonly Position[],
  now: Date,
): number | null {
  const last = recent.at(-1);
  if (last === undefined) return null;
  return Math.max(0, now.getTime() - last.at.getTime());
}

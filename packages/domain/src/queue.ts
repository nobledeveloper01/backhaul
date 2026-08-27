/**
 * The store-and-forward queue.
 *
 * A driver's phone records position for three days, through stretches with no
 * signal, across app kills, low-memory reaps and reboots. Phase 1's first exit
 * gate is one sentence and it is absolute:
 *
 * > **Zero position loss** across a simulated 1,000 km airplane-mode trip,
 * > verified for order and for duplicates.
 *
 * The rows live in native SQLite (ADR-0002). What lives here is the *policy*
 * that decides what to send and — far more importantly — **what may be
 * deleted**. Deleting is the only irreversible thing this product does to its
 * own evidence, so the rule is stated once, here, and everything else is
 * arranged around it:
 *
 * > **A sample may be deleted only when the server has acknowledged that exact
 * > sample.** Not when a batch was sent. Not when a response arrived. Not when
 * > a batch containing it was acknowledged in part.
 */

import type { Position } from './geo.ts';
import { UPLOAD_BATCH } from './tracking.ts';

/** A sample waiting to be uploaded. The id is assigned once, at capture. */
export interface QueuedSample extends Position {
  /** Client-generated, and the deduplication key end to end. */
  readonly id: string;
  /** How many times this sample has been in a batch that did not come back. */
  readonly attempts: number;
}

export interface Batch {
  /** Idempotency key for the whole batch. */
  readonly batchId: string;
  readonly samples: readonly QueuedSample[];
}

/**
 * The next batch to send, or null when there is nothing to do.
 *
 * Oldest first, always. A queue drained newest-first looks better on a shipper's
 * map after an outage and leaves the oldest samples to be lost last — which
 * inverts the priority: the stretch nobody can account for is the stretch that
 * has been waiting longest.
 */
export function nextBatch(
  queue: readonly QueuedSample[],
  batchId: string,
): Batch | null {
  if (queue.length === 0) {
    return null;
  }

  const ordered = [...queue].sort((a, b) => a.at.getTime() - b.at.getTime());
  return { batchId, samples: ordered.slice(0, UPLOAD_BATCH) };
}

/**
 * What the queue holds after the server acknowledged a batch.
 *
 * Takes the ids the server confirmed, **not the batch that was sent**. Those
 * are usually the same and the difference is the entire point: a partial
 * acknowledgement must delete exactly what was acknowledged and keep the rest.
 * Passing the sent batch here instead would be a one-word change that silently
 * throws away whatever the server did not take.
 */
export function acknowledge(
  queue: readonly QueuedSample[],
  acknowledgedIds: readonly string[],
): readonly QueuedSample[] {
  const done = new Set(acknowledgedIds);
  return queue.filter((sample) => !done.has(sample.id));
}

/**
 * What the queue holds after an upload failed.
 *
 * Nothing is removed. The attempt count goes up, and that is all it is for:
 * a sample that has failed thirty times is a sample worth telling somebody
 * about, and it is never a sample worth dropping.
 */
export function failed(
  queue: readonly QueuedSample[],
  batch: Batch,
): readonly QueuedSample[] {
  const attempted = new Set(batch.samples.map((sample) => sample.id));
  return queue.map((sample) =>
    attempted.has(sample.id) ? { ...sample, attempts: sample.attempts + 1 } : sample,
  );
}

/**
 * Adds a captured sample.
 *
 * Refuses a duplicate id rather than storing it twice. The native layer assigns
 * ids and should never repeat one; if it does, the failure belongs here where a
 * test can see it rather than at the far end of an upload.
 */
export function enqueue(
  queue: readonly QueuedSample[],
  fix: Position & { readonly id: string },
): readonly QueuedSample[] {
  if (queue.some((sample) => sample.id === fix.id)) {
    return queue;
  }
  return [...queue, { ...fix, attempts: 0 }];
}

/**
 * How many samples the queue may hold before the phone is in trouble.
 *
 * Named `QUEUE_CAPACITY` rather than `CAPACITY`: `pricing.ts` already exports
 * a `CAPACITY` for how many tonnes a truck carries, and the barrel re-exported
 * both. TypeScript reported it as an ambiguous re-export — from the *app*,
 * because that is the first thing to import the barrel, which is a confusing
 * place to learn about a collision two modules deep.
 *
 * At the slowest sampling interval — 15 minutes, on a conserving battery — this
 * is about 40 days of queueing. At the fastest it is about a day and a half.
 * Either way it is far past any real trip, so reaching it means uploads have
 * been failing for a very long time.
 */
export const QUEUE_CAPACITY = 4000;

export type QueueHealth = 'fine' | 'backing_up' | 'critical';

/**
 * Whether the queue is coping.
 *
 * **There is no eviction policy, deliberately.** The obvious thing to do at
 * capacity is drop the oldest samples, and that is precisely backwards: the
 * oldest are the ones that have survived longest and the ones a dispute will
 * ask about. If this ever reaches `critical` the answer is to tell somebody,
 * not to quietly make the problem smaller.
 */
export function health(queue: readonly QueuedSample[]): QueueHealth {
  if (queue.length >= QUEUE_CAPACITY) return 'critical';
  if (queue.length >= QUEUE_CAPACITY / 2) return 'backing_up';
  return 'fine';
}

/**
 * The oldest sample still waiting, or null.
 *
 * What a driver's screen shows when the queue is backing up: "waiting to send
 * positions from 6 hours ago" is a fact they can act on; "1,832 queued" is a
 * number they cannot.
 */
export function oldestWaiting(queue: readonly QueuedSample[]): Date | null {
  let oldest: Date | null = null;
  for (const sample of queue) {
    if (oldest === null || sample.at.getTime() < oldest.getTime()) {
      oldest = sample.at;
    }
  }
  return oldest;
}

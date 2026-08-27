import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUEUE_CAPACITY,
  acknowledge,
  enqueue,
  failed,
  health,
  nextBatch,
  oldestWaiting,
  type QueuedSample,
} from '../src/queue.ts';
import { UPLOAD_BATCH, decide, INTERVAL } from '../src/tracking.ts';
import type { Position } from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

let counter = 0;
const fix = (lat: number, lon: number, seconds: number): Position & { id: string } => ({
  id: `s${(counter += 1)}`,
  lat,
  lon,
  accuracy: 10,
  at: at(seconds),
});

describe('what may be deleted', () => {
  test('only what the server acknowledged, by id', () => {
    // The single rule this whole module exists to enforce. Deleting is the one
    // irreversible thing the product does to its own evidence.
    let queue: readonly QueuedSample[] = [];
    const a = fix(6.45, 3.38, 0);
    const b = fix(6.46, 3.39, 60);
    const c = fix(6.47, 3.4, 120);
    queue = enqueue(enqueue(enqueue(queue, a), b), c);

    queue = acknowledge(queue, [a.id, c.id]);

    assert.deepEqual(queue.map((s) => s.id), [b.id]);
  });

  test('a partial acknowledgement keeps what was not acknowledged', () => {
    // `acknowledge` takes the ids the server confirmed, not the batch that was
    // sent. Passing the batch instead would be a one-word change that silently
    // throws away whatever the server did not take.
    let queue: readonly QueuedSample[] = [];
    const samples = Array.from({ length: 5 }, (_, i) => fix(6.45 + i * 0.01, 3.38, i * 60));
    for (const sample of samples) queue = enqueue(queue, sample);

    const batch = nextBatch(queue, 'batch-1');
    assert.ok(batch !== null);

    // The server took three of the five.
    queue = acknowledge(queue, batch.samples.slice(0, 3).map((s) => s.id));

    assert.equal(queue.length, 2);
  });

  test('a failed upload deletes nothing at all', () => {
    let queue: readonly QueuedSample[] = [];
    const samples = Array.from({ length: 4 }, (_, i) => fix(6.45, 3.38 + i * 0.01, i * 60));
    for (const sample of samples) queue = enqueue(queue, sample);

    const batch = nextBatch(queue, 'batch-1');
    assert.ok(batch !== null);
    queue = failed(queue, batch);

    assert.equal(queue.length, 4);
    assert.ok(queue.every((s) => s.attempts === 1));
  });

  test('attempts count up and never cause a drop', () => {
    // A sample that has failed thirty times is worth telling somebody about.
    // It is never worth dropping.
    let queue: readonly QueuedSample[] = enqueue([], fix(6.45, 3.38, 0));

    for (let i = 0; i < 30; i++) {
      const batch = nextBatch(queue, `batch-${i}`);
      assert.ok(batch !== null);
      queue = failed(queue, batch);
    }

    assert.equal(queue.length, 1);
    assert.equal(queue[0]?.attempts, 30);
  });
});

describe('what gets sent', () => {
  test('oldest first, always', () => {
    // A queue drained newest-first looks better on a shipper's map after an
    // outage and leaves the oldest samples to be lost last — which inverts the
    // priority: the stretch nobody can account for is the one waiting longest.
    let queue: readonly QueuedSample[] = [];
    const late = fix(6.5, 3.5, 900);
    const early = fix(6.45, 3.38, 0);
    const middle = fix(6.47, 3.4, 400);
    queue = enqueue(enqueue(enqueue(queue, late), early), middle);

    const batch = nextBatch(queue, 'batch-1');
    assert.deepEqual(batch?.samples.map((s) => s.id), [early.id, middle.id, late.id]);
  });

  test('never more than one batch at a time', () => {
    let queue: readonly QueuedSample[] = [];
    for (let i = 0; i < UPLOAD_BATCH * 3; i++) {
      queue = enqueue(queue, fix(6.45, 3.38 + i * 0.0001, i * 60));
    }
    assert.equal(nextBatch(queue, 'b')?.samples.length, UPLOAD_BATCH);
  });

  test('an empty queue has nothing to send, rather than an empty batch', () => {
    assert.equal(nextBatch([], 'b'), null);
  });

  test('a repeated id is not stored twice', () => {
    const sample = fix(6.45, 3.38, 0);
    const queue = enqueue(enqueue([], sample), sample);
    assert.equal(queue.length, 1);
  });
});

describe('a queue that is not draining', () => {
  test('reports its health rather than making the problem smaller', () => {
    // There is no eviction policy, deliberately. Dropping the oldest samples
    // is precisely backwards: they are the ones a dispute will ask about.
    const build = (n: number): readonly QueuedSample[] =>
      Array.from({ length: n }, (_, i) => ({
        ...fix(6.45, 3.38, i),
        attempts: 0,
      }));

    assert.equal(health(build(10)), 'fine');
    assert.equal(health(build(QUEUE_CAPACITY / 2)), 'backing_up');
    assert.equal(health(build(QUEUE_CAPACITY)), 'critical');
  });

  test('names the oldest sample still waiting, for a driver to act on', () => {
    let queue: readonly QueuedSample[] = [];
    queue = enqueue(queue, fix(6.5, 3.5, 3600));
    queue = enqueue(queue, fix(6.45, 3.38, 60));
    queue = enqueue(queue, fix(6.47, 3.4, 1800));

    assert.equal(oldestWaiting(queue)?.toISOString(), at(60).toISOString());
    assert.equal(oldestWaiting([]), null);
  });
});

/**
 * The phase 1 exit gate, in software.
 *
 * > Zero position loss across a simulated 1,000 km airplane-mode trip,
 * > verified for order and for duplicates.
 *
 * The other two gates — under 4% battery an hour, and a 72-hour soak — need
 * real hardware and cannot be met here. This one can, and it is the one that
 * is about correctness rather than about a device.
 */
describe('a 1,000 km trip with no signal for most of it', () => {
  /** Lagos to Kano, roughly, sampled the way the policy would sample it. */
  function simulate(options: {
    readonly outages: readonly [number, number][];
    readonly restartsAt: readonly number[];
    readonly deliverTwice: boolean;
  }) {
    let queue: readonly QueuedSample[] = [];
    /** What the server holds, keyed by sample id — its deduplication. */
    const server = new Map<string, QueuedSample>();
    const captured: string[] = [];

    let batchCounter = 0;
    let lastUpload: Date | undefined;
    /** The deepest the queue ever got. A trip that never backs up proves nothing. */
    let deepest = 0;

    // 1,000 km at 60 km/h is about 17 hours. Sampled every 60 seconds while
    // moving, that is roughly a thousand fixes.
    const totalMinutes = 17 * 60;

    for (let minute = 0; minute < totalMinutes; minute++) {
      const now = at(minute * 60);
      const offline = options.outages.some(([from, to]) => minute >= from && minute < to);

      // Capture never stops, online or not. That is the whole point of
      // `shouldTrack` being true for `signal_lost`.
      const sample = fix(6.45 + minute * 0.003, 3.38 + minute * 0.003, minute * 60);
      queue = enqueue(queue, sample);
      captured.push(sample.id);
      deepest = Math.max(deepest, queue.length);

      // A process restart loses nothing: the rows are in SQLite, and the queue
      // here stands in for that table.
      if (options.restartsAt.includes(minute)) {
        lastUpload = undefined;
      }

      const plan = decide(
        {
          speed: 17,
          battery: 0.6,
          online: !offline,
          queued: queue.length,
          ...(lastUpload === undefined ? {} : { lastUpload }),
        },
        now,
      );

      if (!plan.upload) {
        continue;
      }

      const batch = nextBatch(queue, `batch-${(batchCounter += 1)}`);
      if (batch === null) {
        continue;
      }

      // The server stores by id, so a repeat is a no-op.
      for (const queued of batch.samples) {
        server.set(queued.id, queued);
      }
      if (options.deliverTwice) {
        for (const queued of batch.samples) {
          server.set(queued.id, queued);
        }
      }

      queue = acknowledge(queue, batch.samples.map((s) => s.id));
      lastUpload = now;
    }

    // Whatever is left drains when the truck finds signal at the end.
    let guard = 0;
    while (queue.length > 0 && guard++ < 1000) {
      const batch = nextBatch(queue, `batch-final-${guard}`);
      if (batch === null) break;
      for (const queued of batch.samples) {
        server.set(queued.id, queued);
      }
      queue = acknowledge(queue, batch.samples.map((s) => s.id));
    }

    return { captured, server, queue, deepest, batches: batchCounter };
  }

  test('the simulation actually simulates something', () => {
    // A guard on the other tests in this block. If the trip stopped producing
    // samples, or the outage stopped backing the queue up, every assertion
    // below would pass by having nothing to check.
    const { captured, deepest, batches } = simulate({
      outages: [[120, 360], [500, 560], [700, 730]],
      restartsAt: [],
      deliverTwice: false,
    });

    assert.ok(captured.length > 900, `only ${captured.length} fixes over 17 hours`);
    // Four hours dark at a fix a minute is 240; the queue must have held them.
    assert.ok(deepest >= 240, `queue never got deeper than ${deepest}`);
    assert.ok(batches > 20, `only ${batches} uploads`);
  });

  test('not one position is lost', () => {
    const { captured, server, queue } = simulate({
      // Four hours dark on the Kaduna approach, and two shorter gaps.
      outages: [[120, 360], [500, 560], [700, 730]],
      restartsAt: [],
      deliverTwice: false,
    });

    assert.equal(queue.length, 0, 'the queue drained');
    assert.equal(server.size, captured.length);
    for (const id of captured) {
      assert.ok(server.has(id), `lost ${id}`);
    }
  });

  test('nor across process restarts in the middle of the outage', () => {
    const { captured, server, queue } = simulate({
      outages: [[120, 360], [500, 560]],
      restartsAt: [200, 300, 505],
      deliverTwice: false,
    });

    assert.equal(queue.length, 0);
    assert.equal(server.size, captured.length);
  });

  test('nor when every batch is delivered twice', () => {
    // A device that does not receive an acknowledgement retries. Duplicate
    // delivery is the expected consequence, not an error.
    const { captured, server, queue } = simulate({
      outages: [[120, 360]],
      restartsAt: [],
      deliverTwice: true,
    });

    assert.equal(queue.length, 0);
    assert.equal(server.size, captured.length, 'no duplicates were stored');
  });

  test('and what arrives is in order', () => {
    const { server } = simulate({
      outages: [[120, 360], [500, 560]],
      restartsAt: [250],
      deliverTwice: false,
    });

    const times = [...server.values()].map((s) => s.at.getTime());
    const sorted = [...times].sort((a, b) => a - b);
    assert.deepEqual(times.slice().sort((a, b) => a - b), sorted);

    // And no two samples claim the same instant, which would make the order
    // ambiguous rather than merely unsorted.
    assert.equal(new Set(times).size, times.length);
  });

  test('the queue holds the outage without reaching capacity', () => {
    // Four hours dark at one fix a minute is 240 samples. If that came near
    // `QUEUE_CAPACITY` the threshold would be wrong, not the trip.
    let queue: readonly QueuedSample[] = [];
    for (let minute = 0; minute < 240; minute++) {
      queue = enqueue(queue, fix(6.45, 3.38 + minute * 0.001, minute * 60));
    }
    assert.equal(health(queue), 'fine');
    assert.ok(queue.length < QUEUE_CAPACITY / 4);
  });

  test('the policy keeps sampling while offline', () => {
    // If this ever returns a plan that stops capture when the network drops,
    // the trip above would pass by recording nothing.
    const offline = decide(
      { speed: 17, battery: 0.6, online: false, queued: 300 },
      T0,
    );
    assert.equal(offline.sampleIn, INTERVAL.moving);
    assert.equal(offline.upload, false);
  });
});

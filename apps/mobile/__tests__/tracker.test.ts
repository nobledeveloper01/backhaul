import { BackhaulApi } from '@backhaul/api';
import { Tracker } from '../src/native/tracker';
import type { NativeFix, Spec, TrackingStatus } from '@backhaul/tracking-native';

/**
 * The upload loop, against a native module that behaves like the real one.
 *
 * These tests are about one rule: a fix leaves the phone only when the server
 * has acknowledged that exact fix. Everything else here is scaffolding for
 * asking that question in the situations where it is easy to get wrong.
 */

const T0 = new Date('2026-03-04T06:00:00.000Z');
const TRIP = 'a-trip';

/** A native queue that records what it was asked to delete. */
class FakeNative implements Spec {
  rows: NativeFix[] = [];
  deleted: string[][] = [];
  interval = 60;
  restricted = false;

  constructor(count: number) {
    this.rows = Array.from({ length: count }, (_, i) => ({
      id: `fix-${i}`,
      lat: 6.455 + i * 0.001,
      lon: 3.3841,
      accuracy: 10,
      at: T0.getTime() + i * 60_000,
      speed: 18,
      battery: 0.8,
    }));
  }

  start = jest.fn((): Promise<void> => Promise.resolve());
  stop = jest.fn((): Promise<void> => Promise.resolve());

  setSampleInterval = jest.fn((seconds: number): Promise<void> => {
    this.interval = seconds;
    return Promise.resolve();
  });

  // `Promise.resolve` rather than `async`: these fakes stand in for an async
  // interface and have nothing to await, which `require-await` is right to
  // point out.
  status = (): Promise<TrackingStatus> =>
    Promise.resolve({
      running: true,
      tripId: TRIP,
      queued: this.rows.length,
      lastFixAt: this.rows.at(-1)?.at ?? -1,
      restrictedByOs: this.restricted,
    });

  peek = (limit: number): Promise<NativeFix[]> =>
    Promise.resolve([...this.rows].sort((a, b) => a.at - b.at).slice(0, limit));

  acknowledge = (ids: string[]): Promise<number> => {
    this.deleted.push(ids);
    const gone = new Set(ids);
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !gone.has(row.id));
    return Promise.resolve(before - this.rows.length);
  };

  queueDepth = (): Promise<number> => Promise.resolve(this.rows.length);
}

function apiThat(outcome: 'accepts' | 'unreachable' | 'refuses'): BackhaulApi {
  globalThis.fetch = jest.fn().mockImplementation(() => {
    if (outcome === 'unreachable') {
      return Promise.reject(new Error('Network request failed'));
    }
    if (outcome === 'refuses') {
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'This endpoint needs a bearer token.' }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ batchId: 'b', accepted: 1, duplicate: 0, replayed: false }),
    });
  });
  return new BackhaulApi('http://x', 'a-token');
}

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('what leaves the phone', () => {
  test('an acknowledged batch is deleted, by id', async () => {
    const native = new FakeNative(5);
    const tracker = new Tracker(apiThat('accepts'), native, () => 'batch-1');

    const report = await tracker.tick(TRIP, true, T0);

    expect(native.deleted).toHaveLength(1);
    expect(native.deleted[0]).toHaveLength(5);
    expect(native.rows).toHaveLength(0);
    expect(report.queued).toBe(0);
  });

  test('a failed upload deletes nothing', async () => {
    // The whole point. A driver on a northern corridor is offline for hours;
    // an upload that did not arrive must leave the evidence where it is.
    const native = new FakeNative(5);
    const tracker = new Tracker(apiThat('unreachable'), native, () => 'batch-1');

    const report = await tracker.tick(TRIP, true, T0);

    expect(native.deleted).toHaveLength(0);
    expect(native.rows).toHaveLength(5);
    expect(report.queued).toBe(5);
  });

  test('a refusal deletes nothing either', async () => {
    // A 401 means get a token. It does not mean throw away the trip.
    const native = new FakeNative(5);
    const tracker = new Tracker(apiThat('refuses'), native, () => 'batch-1');

    await tracker.tick(TRIP, true, T0);

    expect(native.deleted).toHaveLength(0);
    expect(native.rows).toHaveLength(5);
  });

  test('nothing is sent while offline, and nothing is deleted', async () => {
    const native = new FakeNative(5);
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy;
    const tracker = new Tracker(new BackhaulApi('http://x', 't'), native, () => 'b');

    await tracker.tick(TRIP, false, T0);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(native.rows).toHaveLength(5);
  });

  test('an empty queue does not send an empty batch', async () => {
    const native = new FakeNative(0);
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy;
    const tracker = new Tracker(new BackhaulApi('http://x', 't'), native, () => 'b');

    await tracker.tick(TRIP, true, T0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the cadence', () => {
  test('is set on every turn, not only when something uploads', async () => {
    // A battery that has just crossed the threshold should slow sampling even
    // on a turn with nothing to send.
    const native = new FakeNative(0);
    const tracker = new Tracker(apiThat('accepts'), native, () => 'b');

    await tracker.tick(TRIP, true, T0);

    expect(native.setSampleInterval).toHaveBeenCalled();
  });

  test('slows when the battery is low', async () => {
    const native = new FakeNative(3);
    native.rows = native.rows.map((row) => ({ ...row, battery: 0.05 }));
    const tracker = new Tracker(apiThat('accepts'), native, () => 'b');

    const report = await tracker.tick(TRIP, true, T0);

    expect(report.because).toBe('saving battery');
    expect(native.interval).toBe(report.sampleIn);
  });

  test('a fix with no battery reading is not a flat phone', async () => {
    // The codegen sends -1 for "the OS did not say". Carried through as a
    // number it would be a phone at -100%.
    const native = new FakeNative(3);
    native.rows = native.rows.map((row) => ({ ...row, battery: -1, speed: -1 }));
    const tracker = new Tracker(apiThat('accepts'), native, () => 'b');

    const report = await tracker.tick(TRIP, true, T0);

    expect(report.because).not.toBe('saving battery');
  });
});

describe('what the driver is told', () => {
  test('an OS restriction is surfaced, not logged', async () => {
    // On a Transsion handset this is the difference between a trip that
    // records and one that quietly does not.
    const native = new FakeNative(2);
    native.restricted = true;
    const tracker = new Tracker(apiThat('unreachable'), native, () => 'b');

    const report = await tracker.tick(TRIP, true, T0);

    expect(report.restrictedByOs).toBe(true);
  });

  test('a backlog reports the oldest thing waiting, not just a count', async () => {
    const native = new FakeNative(4);
    const tracker = new Tracker(apiThat('unreachable'), native, () => 'b');

    const report = await tracker.tick(TRIP, true, T0);

    expect(report.oldestWaiting?.toISOString()).toBe(T0.toISOString());
    expect(report.health).toBe('fine');
  });
});

describe('where there is no native module', () => {
  test('the tracker says so rather than crashing', async () => {
    // Jest, the web console, and any build where the native side is not
    // linked. `getEnforcing` would turn this into a crash at import time.
    const tracker = new Tracker(apiThat('accepts'), null);

    expect(tracker.available).toBe(false);
    await expect(tracker.start(TRIP, 60)).resolves.toBeUndefined();

    const report = await tracker.tick(TRIP, true, T0);
    expect(report.because).toMatch(/not available/);
  });
});

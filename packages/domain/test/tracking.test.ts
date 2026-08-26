import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERVAL,
  LOW_BATTERY,
  SIGNAL_LOST_AFTER_MS,
  STALLED_AFTER_MS,
  UPLOAD_BATCH,
  UPLOAD_EVERY_MS,
  decide,
  observe,
  silentFor,
  type Conditions,
} from '../src/tracking.ts';
import type { Position } from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const fix = (lat: number, lon: number, minutes: number): Position => ({
  lat,
  lon,
  accuracy: 10,
  at: at(minutes),
});

const conditions = (over: Partial<Conditions> = {}): Conditions => ({
  speed: 20,
  online: true,
  queued: 0,
  ...over,
});

describe('how often to sample', () => {
  test('fast on the open road', () => {
    assert.equal(decide(conditions({ speed: 22 }), T0).sampleIn, INTERVAL.moving);
  });

  test('slower in traffic, because position barely changes', () => {
    assert.equal(decide(conditions({ speed: 2 }), T0).sampleIn, INTERVAL.crawling);
  });

  test('still sampling when stopped, because a stop needs a duration', () => {
    // A demurrage claim is made of the duration of a stop. A stop with no
    // fixes has no duration.
    const d = decide(conditions({ speed: 0 }), T0);
    assert.equal(d.sampleIn, INTERVAL.stopped);
    assert.ok(d.sampleIn < Infinity);
  });

  test('battery outranks everything, including a truck at speed', () => {
    // A precise track on a dead phone is not a track, and the trip has hours
    // left to run.
    const d = decide(conditions({ speed: 25, battery: LOW_BATTERY }), T0);
    assert.equal(d.sampleIn, INTERVAL.conserving);
    assert.equal(d.because, 'saving battery');
  });

  test('a healthy battery changes nothing', () => {
    assert.equal(
      decide(conditions({ speed: 25, battery: 0.9 }), T0).sampleIn,
      INTERVAL.moving,
    );
  });

  test('an unknown battery is not treated as a flat one', () => {
    // Some Android builds refuse to report it. Conserving on that basis would
    // degrade every trip on those handsets for no reason.
    assert.equal(decide(conditions({ speed: 25 }), T0).sampleIn, INTERVAL.moving);
  });

  test('every decision says why, in words a driver can read', () => {
    // A driver who cannot see why their phone is doing something assumes the
    // worst and force-quits the app.
    for (const c of [
      conditions({ speed: 25 }),
      conditions({ speed: 2 }),
      conditions({ speed: 0 }),
      conditions({ battery: 0.05 }),
    ]) {
      assert.match(decide(c, T0).because, /^[a-z]/);
    }
  });
});

describe('when to upload', () => {
  test('never with nothing to send', () => {
    assert.equal(decide(conditions({ queued: 0 }), T0).upload, false);
  });

  test('never while offline, however full the queue', () => {
    assert.equal(
      decide(conditions({ queued: 500, online: false }), T0).upload,
      false,
    );
  });

  test('a full batch goes immediately', () => {
    assert.equal(
      decide(conditions({ queued: UPLOAD_BATCH, lastUpload: T0 }), T0).upload,
      true,
    );
  });

  test('a part-full queue waits for the clock', () => {
    const c = conditions({ queued: 3, lastUpload: T0 });
    assert.equal(decide(c, at(5)).upload, false);
    assert.equal(decide(c, new Date(T0.getTime() + UPLOAD_EVERY_MS)).upload, true);
  });

  test('the first fix of a trip goes straight up', () => {
    // A shipper watching for a truck to start should not wait ten minutes to
    // learn it did.
    assert.equal(decide(conditions({ queued: 1 }), T0).upload, true);
  });

  test('a flat battery still uploads what it has', () => {
    // Conserving means sampling less, not withholding evidence already
    // captured. The phone may not be alive in an hour.
    assert.equal(
      decide(conditions({ battery: 0.05, queued: UPLOAD_BATCH }), T0).upload,
      true,
    );
  });
});

describe('reading the track', () => {
  const parked = (minutes: number): Position => fix(6.4550, 3.3841, minutes);

  test('no fixes at all is unknown, not stalled', () => {
    assert.equal(observe([], at(600)), 'unknown');
    assert.equal(silentFor([], at(600)), null);
  });

  test('one fix is a position, not a behaviour', () => {
    assert.equal(observe([parked(0)], at(5)), 'unknown');
  });

  test('a long silence is silence, whatever the fixes said before it', () => {
    const track = [fix(6.45, 3.38, 0), fix(6.55, 3.48, 10)];
    assert.equal(observe(track, at(10 + 21)), 'silent');
  });

  test('a fifteen-minute coverage gap is not an alert', () => {
    // Northern-corridor coverage drops for a quarter of an hour as a matter of
    // course. A shipper pinged every time stops reading the pings.
    const track = [fix(6.45, 3.38, 0), fix(6.55, 3.48, 10)];
    assert.equal(observe(track, at(10 + 15)), 'moving');
    assert.equal(SIGNAL_LOST_AFTER_MS, 20 * 60_000);
  });

  test('movement beyond the drift radius is movement', () => {
    assert.equal(observe([fix(6.45, 3.38, 0), fix(6.50, 3.42, 30)], at(31)), 'moving');
  });

  test('a short stop is a stop, not a stall', () => {
    const track = [parked(0), parked(10), parked(20)];
    assert.equal(observe(track, at(21)), 'stopped');
  });

  test('an hour parked in the middle of nowhere is a stall', () => {
    // Forty-five minutes covers a meal, a prayer, a fuel queue and a
    // checkpoint. It does not cover a breakdown.
    const track = [parked(0), parked(20), parked(40), parked(60)];
    assert.equal(observe(track, at(61)), 'stalled');
    assert.equal(STALLED_AFTER_MS, 45 * 60_000);
  });

  test('the same hour parked at the depot is waiting, not a breakdown', () => {
    // The whole difference between a useful alert and one that fires on every
    // scheduled stop.
    const track = [parked(0), parked(20), parked(40), parked(60)];
    assert.equal(observe(track, at(61), { atWaypoint: true }), 'stopped');
  });

  test('the boundary is where it says it is', () => {
    const justUnder = [parked(0), parked(44)];
    const justOver = [parked(0), parked(46)];
    assert.equal(observe(justUnder, at(45)), 'stopped');
    assert.equal(observe(justOver, at(47)), 'stalled');
  });

  test('silence is measured from the last fix, and never negative', () => {
    const track = [parked(0), parked(30)];
    assert.equal(silentFor(track, at(45)), 15 * 60_000);
    // A phone clock that has jumped backwards must not produce a negative
    // duration on a shipper's screen.
    assert.equal(silentFor(track, at(10)), 0);
  });

  test('an observation is not a trip state', () => {
    // Kept separate so a shipper can mark a trip disputed while the tracker
    // still honestly says the truck is moving.
    const moving = observe([fix(6.45, 3.38, 0), fix(6.50, 3.42, 30)], at(31));
    assert.equal(moving, 'moving');
  });
});

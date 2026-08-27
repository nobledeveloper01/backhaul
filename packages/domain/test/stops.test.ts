import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MINIMUM_STOP_MS, longest, stops, timeStopped } from '../src/stops.ts';
import type { Position } from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const fix = (lat: number, lon: number, minutes: number): Position => ({
  lat,
  lon,
  accuracy: 10,
  at: at(minutes),
});

/** A run of fixes in one place. */
const parked = (lat: number, lon: number, from: number, to: number, every = 5) => {
  const out: Position[] = [];
  for (let m = from; m <= to; m += every) out.push(fix(lat, lon, m));
  return out;
};

/**
 * A run of fixes moving away from a place.
 *
 * The origin is a parameter because the first version started every run at the
 * same coordinates — so a run that followed a stop at those coordinates had its
 * first fix absorbed into the stop, and a two-hour wait measured 125 minutes.
 * The engine was right; the helper was lying to it.
 */
const moving = (from: number, to: number, lat = 6.45, lon = 3.38, every = 5) => {
  const out: Position[] = [];
  for (let m = from; m <= to; m += every) {
    const step = (m - from) / every + 1;
    out.push(fix(lat + step * 0.02, lon + step * 0.02, m));
  }
  return out;
};

describe('finding stops', () => {
  test('a truck that never stops has none', () => {
    assert.deepEqual(stops(moving(0, 120)), []);
  });

  test('an empty track has none, rather than throwing', () => {
    assert.deepEqual(stops([]), []);
  });

  test('a two-hour wait at a depot is one stop, not twenty-four', () => {
    // The cluster resumes *after* the stop. Advancing one fix at a time would
    // find the same stop again from every fix inside it.
    const track = [...parked(6.45, 3.38, 0, 120), ...moving(125, 200, 6.45, 3.38)];
    const found = stops(track);

    assert.equal(found.length, 1);
    assert.equal(found[0]?.durationMs, 120 * 60_000);
    assert.equal(found[0]?.openEnded, false);
  });

  test('traffic is not a stop', () => {
    // Below ten minutes a "stop" is traffic, and a trip through Lagos would be
    // nothing but stops.
    const track = [...parked(6.45, 3.38, 0, 5), ...moving(10, 60, 6.45, 3.38)];
    assert.deepEqual(stops(track), []);
    assert.equal(MINIMUM_STOP_MS, 10 * 60_000);
  });

  test('several stops on one trip are all found, in order', () => {
    const track = [
      ...parked(6.45, 3.38, 0, 30),
      ...moving(35, 100, 6.45, 3.38),
      ...parked(8.5, 4.7, 105, 195),
      ...moving(200, 260, 8.5, 4.7),
      ...parked(10.5, 7.4, 265, 285),
    ];
    const found = stops(track);

    assert.equal(found.length, 3);
    assert.deepEqual(
      found.map((s) => Math.round(s.durationMs / 60_000)),
      [30, 90, 20],
    );
    // In the order they happened.
    for (let i = 1; i < found.length; i++) {
      assert.ok((found[i]?.from.getTime() ?? 0) > (found[i - 1]?.to.getTime() ?? 0));
    }
  });

  test('a stop the trip ended in is marked open, not reported as finished', () => {
    // Its duration is a lower bound. A screen rendering it as finished is
    // claiming the truck moved off when nothing says it did.
    const track = [...moving(0, 60, 6.45, 3.38), ...parked(7.5, 4.0, 65, 155)];
    const found = stops(track);

    assert.equal(found.length, 1);
    assert.equal(found[0]?.openEnded, true);
  });

  test('a stop knows how many fixes it is made of', () => {
    // Two fixes ninety minutes apart and a hundred fixes ninety minutes apart
    // are very different evidence for the same claim.
    const track = [...parked(6.45, 3.38, 0, 90, 5), ...moving(95, 130, 6.45, 3.38)];
    assert.equal(stops(track)[0]?.fixes, 19);
  });

  test('drift within the radius is still one stop', () => {
    // A parked truck's fixes wander. Two ±90 m readings sit 180 m apart, and
    // the radius is the same one the live observation uses.
    const track: Position[] = [];
    for (let m = 0; m <= 60; m += 5) {
      track.push(fix(6.45 + (m % 10) * 0.00008, 3.38, m));
    }
    track.push(...moving(65, 120, 6.45, 3.38));

    assert.equal(stops(track).length, 1);
  });
});

describe('summarising them', () => {
  test('total time stopped adds up', () => {
    const track = [
      ...parked(6.45, 3.38, 0, 30),
      ...moving(35, 100, 6.45, 3.38),
      ...parked(8.5, 4.7, 105, 165),
    ];
    assert.equal(timeStopped(stops(track)), 90 * 60_000);
    assert.equal(timeStopped([]), 0);
  });

  test('the longest stop is the one a demurrage claim is about', () => {
    const track = [
      ...parked(6.45, 3.38, 0, 20),
      ...moving(25, 90, 6.45, 3.38),
      ...parked(8.5, 4.7, 95, 335),
      ...moving(340, 400, 8.5, 4.7),
    ];
    const worst = longest(stops(track));

    assert.equal(Math.round((worst?.durationMs ?? 0) / 60_000), 240);
    assert.equal(longest([]), null);
  });
});

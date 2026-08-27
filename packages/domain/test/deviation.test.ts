import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEVIATION_M,
  DEVIATION_WINDOW_MS,
  deviation,
  heading,
  offRoute,
} from '../src/deviation.ts';
import type { Position } from '../src/geo.ts';
import type { Waypoint } from '../src/waypoints.ts';

const NOW = new Date('2026-03-04T18:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const fix = (lat: number, lon: number, minutes: number): Position => ({
  lat,
  lon,
  accuracy: 12,
  at: minutesAgo(minutes),
});

const KANO = { lat: 12.0022, lon: 8.592, accuracy: 0, at: NOW };

/** A run of fixes marching from one place toward another. */
const towards = (
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  fromMinutes: number,
  steps: number,
): Position[] => {
  const out: Position[] = [];
  const every = fromMinutes / steps;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push(
      fix(
        from.lat + (to.lat - from.lat) * t,
        from.lon + (to.lon - from.lon) * t,
        Math.round(fromMinutes - i * every),
      ),
    );
  }
  return out;
};

describe('deviation', () => {
  test('a truck closing on its destination is on course', () => {
    const track = towards({ lat: 10.5, lon: 7.44 }, { lat: 11.5, lon: 8.2 }, 120, 8);
    assert.equal(deviation(track, KANO, NOW).kind, 'on_course');
  });

  test('a truck that turned round is reported, with how far it has given back', () => {
    // Closes on Kano, then heads back toward Kaduna for the rest of the window.
    const track = [
      ...towards({ lat: 10.5, lon: 7.44 }, { lat: 11.6, lon: 8.3 }, 120, 6),
      ...towards({ lat: 11.6, lon: 8.3 }, { lat: 10.9, lon: 7.7 }, 55, 6),
    ];

    const verdict = deviation(track, KANO, NOW);
    assert.equal(verdict.kind, 'deviating');
    if (verdict.kind !== 'deviating') return;
    assert.ok(verdict.furtherM > DEVIATION_M);
    assert.match(verdict.detail, /km further from the destination/);
  });

  test('measures from the closest it got, not from where the window started', () => {
    // A truck that closed 200 km and then gave 60 back has deviated by 60. From
    // the window's first fix it would look like 140 km of *progress*, and a
    // turn would hide behind whatever came before it.
    const track = [
      ...towards({ lat: 9.0, lon: 6.5 }, { lat: 11.7, lon: 8.4 }, 120, 8),
      ...towards({ lat: 11.7, lon: 8.4 }, { lat: 11.2, lon: 8.0 }, 50, 5),
    ];
    assert.equal(deviation(track, KANO, NOW).kind, 'deviating');
  });

  test('a detour smaller than the threshold is not an alarm', () => {
    // Every diversion around a broken-down trailer would otherwise fire, and
    // an alarm that fires on every trip is an alarm nobody reads.
    const track = [
      ...towards({ lat: 11.0, lon: 7.9 }, { lat: 11.5, lon: 8.2 }, 120, 8),
      fix(11.44, 8.14, 20),
      fix(11.42, 8.12, 10),
      fix(11.43, 8.13, 2),
    ];
    assert.equal(deviation(track, KANO, NOW).kind, 'on_course');
  });

  test('a coverage gap is unknown, not an accusation', () => {
    // Two fixes ninety minutes apart is a dead zone. Calling it a course would
    // turn Nigerian network infrastructure into a driver's fault.
    const sparse = [fix(10.5, 7.44, 89), fix(11.5, 8.2, 2)];
    const verdict = deviation(sparse, KANO, NOW);
    assert.equal(verdict.kind, 'unknown');
    if (verdict.kind === 'unknown') assert.match(verdict.detail, /Too few positions/);
  });

  test('an empty track is unknown', () => {
    assert.equal(deviation([], KANO, NOW).kind, 'unknown');
  });

  test('fixes older than the window are ignored', () => {
    const stale = [fix(4.8, 7.0, 600), fix(4.9, 7.1, 500)];
    assert.equal(deviation(stale, KANO, NOW).kind, 'unknown');
    assert.equal(DEVIATION_WINDOW_MS, 90 * 60_000);
  });

  test('a window only half covered is not yet an answer', () => {
    const short = towards({ lat: 11.0, lon: 7.9 }, { lat: 10.4, lon: 7.4 }, 20, 6);
    const verdict = deviation(short, KANO, NOW);
    assert.equal(verdict.kind, 'unknown');
    if (verdict.kind === 'unknown') assert.match(verdict.detail, /window/);
  });
});

describe('offRoute', () => {
  const waypoint = (id: string, lat: number, lon: number): Waypoint => ({
    id,
    name: id,
    at: { lat, lon, accuracy: 0, at: NOW },
    kind: 'checkpoint',
    radius: 500,
  });

  const route = [waypoint('jebba', 9.13, 4.83), waypoint('kaduna', 10.52, 7.44)];

  test('a truck at a waypoint is not off route', () => {
    assert.equal(offRoute(fix(9.13, 4.83, 0), route), false);
  });

  test('a truck near one is not off route either', () => {
    // The straight line between waypoints is not the road, so nearness to a
    // point is the only thing that can honestly be measured.
    assert.equal(offRoute(fix(9.2, 4.9, 0), route), false);
  });

  test('a truck hundreds of kilometres away is', () => {
    assert.equal(offRoute(fix(4.81, 7.05, 0), route), true);
  });

  test('no declared route answers null, not "on route"', () => {
    // Rendering a reassuring tick for a route nobody declared is the screen
    // inventing evidence.
    assert.equal(offRoute(fix(9.13, 4.83, 0), []), null);
  });
});

describe('heading', () => {
  const waypoint = (id: string): Waypoint => ({
    id,
    name: id,
    at: { lat: 9, lon: 5, accuracy: 0, at: NOW },
    kind: 'checkpoint',
    radius: 500,
  });

  test('names the next place it should reach', () => {
    const route = [waypoint('a'), waypoint('b'), waypoint('c')];
    assert.equal(heading(['a'], route)?.id, 'b');
  });

  test('a finished route has nothing ahead', () => {
    const route = [waypoint('a')];
    assert.equal(heading(['a'], route), null);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_RADIUS_M,
  atWaypointNow,
  chargeableWaiting,
  inside,
  remaining,
  visits,
  type Waypoint,
} from '../src/waypoints.ts';
import type { Position } from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const fix = (lat: number, lon: number, minutes: number, accuracy = 10): Position => ({
  lat,
  lon,
  accuracy,
  at: at(minutes),
});

const APAPA: Waypoint = {
  id: 'apapa',
  name: 'Apapa depot',
  at: { lat: 6.45, lon: 3.36, accuracy: 0, at: T0 },
  kind: 'origin',
  radius: 300,
};

const JEBBA: Waypoint = {
  id: 'jebba',
  name: 'Jebba checkpoint',
  at: { lat: 9.13, lon: 4.83, accuracy: 0, at: T0 },
  kind: 'checkpoint',
  radius: 500,
};

const KANO: Waypoint = {
  id: 'kano',
  name: 'Kano market',
  at: { lat: 12.0, lon: 8.52, accuracy: 0, at: T0 },
  kind: 'destination',
  radius: 300,
};

/** A run of fixes sitting at a waypoint. */
const sittingAt = (w: Waypoint, from: number, to: number, every = 15): Position[] => {
  const out: Position[] = [];
  for (let m = from; m <= to; m += every) out.push(fix(w.at.lat, w.at.lon, m));
  return out;
};

describe('inside', () => {
  test('a fix at the centre is inside', () => {
    assert.equal(inside(fix(APAPA.at.lat, APAPA.at.lon, 0), APAPA), true);
  });

  test('a fix well outside is outside', () => {
    assert.equal(inside(fix(6.55, 3.36, 0), APAPA), false);
  });

  test("a fix's own uncertainty widens the fence", () => {
    // 400 m from a 300 m fence, reported by a fix accurate to +/-150 m. The
    // truck may well be in the yard, and refusing arrival on that basis
    // strands a driver at a barrier while demurrage runs.
    const justOut = fix(APAPA.at.lat + 0.0036, APAPA.at.lon, 0, 10);
    assert.equal(inside(justOut, APAPA), false);
    assert.equal(inside({ ...justOut, accuracy: 150 }, APAPA), true);
  });

  test('the minimum useful radius is larger than a fix is wrong', () => {
    // Below this, arrival depends on which way the phone happened to err.
    assert.ok(MINIMUM_RADIUS_M >= 150);
  });
});

describe('visits', () => {
  const track = [
    ...sittingAt(APAPA, 0, 120),
    fix(7.5, 4.0, 240),
    ...sittingAt(JEBBA, 360, 390),
    fix(10.5, 6.5, 500),
    ...sittingAt(KANO, 600, 720),
  ];

  test('records one visit per waypoint reached', () => {
    const found = visits(track, [APAPA, JEBBA, KANO]);
    assert.deepEqual(
      found.map((v) => v.waypoint.id),
      ['apapa', 'jebba', 'kano'],
    );
  });

  test('orders visits by when they happened, not by the waypoint list', () => {
    const found = visits(track, [KANO, JEBBA, APAPA]);
    assert.deepEqual(
      found.map((v) => v.waypoint.id),
      ['apapa', 'jebba', 'kano'],
    );
  });

  test('measures a departure to the first fix outside, not the last inside', () => {
    // The truck was still there for some part of the gap. A demurrage claim
    // should not lose two hours on a rounding.
    const found = visits(track, [APAPA]);
    assert.equal(found[0]?.durationMs, 240 * 60_000);
  });

  test('a visit still running has no departure and is measured to the last fix', () => {
    const found = visits(sittingAt(APAPA, 0, 120), [APAPA]);
    assert.equal(found[0]?.left, null);
    assert.equal(found[0]?.durationMs, 120 * 60_000);
  });

  test('leaving and coming back is two visits, not one long one', () => {
    // Merging them would inflate a demurrage claim, and the track can tell
    // them apart.
    const roundTheBlock = [
      ...sittingAt(APAPA, 0, 30),
      fix(6.49, 3.36, 45),
      ...sittingAt(APAPA, 60, 90),
      fix(6.49, 3.36, 105),
    ];
    const found = visits(roundTheBlock, [APAPA]);
    assert.equal(found.length, 2);
  });

  test('a trip that never arrives records nothing', () => {
    assert.equal(visits([fix(7.5, 4.0, 0), fix(8.0, 4.5, 60)], [KANO]).length, 0);
  });

  test('an empty track records nothing', () => {
    assert.equal(visits([], [APAPA, KANO]).length, 0);
  });
});

describe('chargeableWaiting', () => {
  test('counts the depot and the market, never the checkpoint', () => {
    // A queue at a checkpoint is nobody's fault and nobody's bill.
    const track = [
      ...sittingAt(APAPA, 0, 120),
      fix(7.5, 4.0, 240),
      ...sittingAt(JEBBA, 360, 480),
      fix(10.5, 6.5, 540),
      ...sittingAt(KANO, 600, 660),
    ];
    const found = visits(track, [APAPA, JEBBA, KANO]);
    const chargeable = chargeableWaiting(found);

    // 240 minutes at Apapa (to the first fix outside) plus 60 at Kano.
    assert.equal(chargeable, 300 * 60_000);
    assert.ok(chargeable < found.reduce((t, v) => t + v.durationMs, 0));
  });

  test('nothing waited is nothing charged', () => {
    assert.equal(chargeableWaiting([]), 0);
  });
});

describe('atWaypointNow', () => {
  test('names the waypoint the truck is sitting in', () => {
    const found = atWaypointNow(sittingAt(APAPA, 0, 30), [APAPA, KANO]);
    assert.equal(found?.id, 'apapa');
  });

  test('a truck on the road is at no waypoint', () => {
    assert.equal(atWaypointNow([fix(7.5, 4.0, 0)], [APAPA, KANO]), null);
  });

  test('no fixes at all is not an arrival', () => {
    assert.equal(atWaypointNow([], [APAPA]), null);
  });
});

describe('remaining', () => {
  test('lists what is still ahead, in the order given', () => {
    const found = visits(sittingAt(APAPA, 0, 60), [APAPA, JEBBA, KANO]);
    assert.deepEqual(
      remaining(found, [APAPA, JEBBA, KANO]).map((w) => w.id),
      ['jebba', 'kano'],
    );
  });

  test('a finished trip has nothing remaining', () => {
    const track = [...sittingAt(APAPA, 0, 30), fix(7.5, 4, 100), ...sittingAt(KANO, 200, 230)];
    const found = visits(track, [APAPA, KANO]);
    assert.equal(remaining(found, [APAPA, KANO]).length, 0);
  });
});

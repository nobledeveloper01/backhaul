import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PLAUSIBLE_SPEED_MS,
  clean,
  distance,
  distanceTravelled,
  fixQuality,
  isWithin,
  pathLength,
  problemWith,
  type Position,
} from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

const fix = (
  lat: number,
  lon: number,
  seconds: number,
  accuracy = 10,
): Position => ({ lat, lon, accuracy, at: at(seconds) });

// Real places, so a wrong formula produces a wrong number somebody recognises.
const LAGOS = fix(6.4550, 3.3841, 0);
const IBADAN = fix(7.3775, 3.9470, 7200);
const KANO = fix(12.0022, 8.5920, 86400);

describe('distance', () => {
  test('Lagos to Ibadan is about 120 km', () => {
    const km = distance(LAGOS, IBADAN) / 1000;
    assert.ok(km > 115 && km < 125, `got ${km.toFixed(1)} km`);
  });

  test('Lagos to Kano is about 830 km', () => {
    // Far enough that the flat-earth approximation would be wrong by
    // kilometres — and kilometres are what a haulage rate multiplies.
    const km = distance(LAGOS, KANO) / 1000;
    assert.ok(km > 810 && km < 850, `got ${km.toFixed(1)} km`);
  });

  test('is symmetric and zero at a point', () => {
    assert.equal(distance(LAGOS, IBADAN), distance(IBADAN, LAGOS));
    assert.equal(distance(LAGOS, LAGOS), 0);
  });

  test('a path is the sum of its legs', () => {
    assert.equal(
      pathLength([LAGOS, IBADAN, KANO]),
      distance(LAGOS, IBADAN) + distance(IBADAN, KANO),
    );
  });

  test('an empty or single-point path is zero, not a throw', () => {
    assert.equal(pathLength([]), 0);
    assert.equal(pathLength([LAGOS]), 0);
  });
});

describe('what makes a fix unusable', () => {
  test('the OS saying it does not know', () => {
    assert.equal(problemWith(fix(6.45, 3.38, 0, 2400), undefined), 'too_imprecise');
    assert.equal(problemWith(fix(6.45, 3.38, 0, 95), undefined), null);
  });

  test('a NaN accuracy is imprecise, not silently accepted', () => {
    // A comparison against NaN is false, so the naive check passes it. It came
    // up here before it could come up on a phone.
    assert.equal(
      problemWith({ lat: 6.45, lon: 3.38, accuracy: NaN, at: T0 }, undefined),
      'too_imprecise',
    );
  });

  test('a fix dated before the last one', () => {
    assert.equal(problemWith(fix(6.46, 3.39, -30), fix(6.45, 3.38, 0)), 'out_of_order');
  });

  test('a jump no truck could make', () => {
    // Ibadan one minute after Lagos: a cell-tower fix snapping across a state
    // line, not a fast truck.
    assert.equal(problemWith(fix(7.3775, 3.9470, 60), LAGOS), 'implausible_jump');
  });

  test('a fast but possible run is kept', () => {
    // 30 m/s is 108 km/h. Unwise on that road, not impossible, and excluding
    // it would lose real evidence.
    const later = fix(6.4550, 3.3841 + 0.0163, 60); // ~1.8 km east
    assert.equal(problemWith(later, LAGOS), null);
  });

  test('the threshold is where it says it is', () => {
    const seconds = 100;
    const metres = MAX_PLAUSIBLE_SPEED_MS * seconds; // 4500 m
    // Degrees of longitude at this latitude, plus the slack the check allows.
    const perDegree = distance(LAGOS, fix(LAGOS.lat, LAGOS.lon + 1, 0));
    const slack = LAGOS.accuracy + 10;

    const under = fix(LAGOS.lat, LAGOS.lon + (metres + slack - 200) / perDegree, seconds);
    const over = fix(LAGOS.lat, LAGOS.lon + (metres + slack + 200) / perDegree, seconds);

    assert.equal(problemWith(under, LAGOS), null);
    assert.equal(problemWith(over, LAGOS), 'implausible_jump');
  });

  test('a parked truck does not drift into movement', () => {
    // Two 90 m fixes of a stationary truck can sit 180 m apart. Counted as
    // travel, an overnight stop invents kilometres.
    const parked = fix(6.4550, 3.3841, 0, 90);
    const alsoParked = fix(6.4562, 3.3852, 30, 90); // ~180 m away
    assert.equal(problemWith(alsoParked, parked), null);
  });

  test('two fixes at the same instant in different places', () => {
    assert.equal(problemWith(fix(7.3775, 3.9470, 0), LAGOS), 'implausible_jump');
    assert.equal(problemWith(fix(6.4550, 3.3841, 0), LAGOS), null);
  });
});

describe('cleaning a track', () => {
  test('keeps what it can and says what it dropped', () => {
    const raw = [
      fix(6.4550, 3.3841, 0),
      fix(6.4600, 3.3900, 60),
      fix(9.0000, 7.0000, 90), // a tower fix in Abuja
      fix(6.4650, 3.3950, 120),
      fix(6.4700, 3.4000, 180, 3000), // no idea where it is
    ];
    const cleaned = clean(raw);

    assert.equal(cleaned.kept.length, 3);
    assert.deepEqual(
      cleaned.dropped.map((d) => d.problem),
      ['implausible_jump', 'too_imprecise'],
    );
  });

  test('one bad fix does not take the rest of the leg with it', () => {
    // The bug this guards: using the dropped fix as the baseline makes the
    // next good fix look like a jump too, and the whole leg disappears.
    const raw = [
      fix(6.4550, 3.3841, 0),
      fix(12.0022, 8.5920, 30), // Kano, half a minute later
      fix(6.4560, 3.3850, 60),
      fix(6.4570, 3.3860, 90),
      fix(6.4580, 3.3870, 120),
    ];
    const cleaned = clean(raw);
    assert.equal(cleaned.kept.length, 4);
    assert.equal(cleaned.dropped.length, 1);
  });

  test('an empty track cleans to nothing, with zero quality not NaN', () => {
    const cleaned = clean([]);
    assert.equal(distanceTravelled(cleaned), 0);
    assert.equal(fixQuality(cleaned), 0);
  });

  test('quality is the share that survived, and it is reported', () => {
    // A distance computed from 30% of the fixes is not wrong, but nobody
    // should be shown it without knowing that.
    const raw = [
      fix(6.4550, 3.3841, 0),
      fix(6.4560, 3.3850, 60, 5000),
      fix(6.4570, 3.3860, 120, 5000),
      fix(6.4580, 3.3870, 180),
    ];
    assert.equal(fixQuality(clean(raw)), 0.5);
  });

  test('distance travelled follows the road, not the straight line', () => {
    // A detour a driver was made to take is distance they drove.
    const detour = clean([
      fix(6.4550, 3.3841, 0),
      fix(6.5500, 3.3841, 1800), // north
      fix(6.5500, 3.4841, 3600), // east
      fix(6.4550, 3.4841, 5400), // back south
    ]);
    const straight = distance(fix(6.4550, 3.3841, 0), fix(6.4550, 3.4841, 5400));
    assert.ok(distanceTravelled(detour) > straight * 2);
  });
});

describe('arrival', () => {
  test('a fix inside the yard counts', () => {
    const yard = fix(6.4550, 3.3841, 0);
    assert.equal(isWithin(fix(6.4553, 3.3844, 60), yard, 200), true);
  });

  test('an imprecise fix at the gate is given the benefit of the doubt', () => {
    // A truck reported 190 m out by a fix accurate to ±90 m may well be in the
    // yard. Refusing arrival on that basis strands the driver at the gate.
    const yard = fix(6.4550, 3.3841, 0);
    const vague = fix(6.4567, 3.3841, 60, 90); // ~190 m north
    assert.equal(isWithin(vague, yard, 150), true);
    assert.equal(isWithin({ ...vague, accuracy: 5 }, yard, 150), false);
  });

  test('a fix in the next town does not', () => {
    assert.equal(isWithin(IBADAN, LAGOS, 500), false);
  });
});

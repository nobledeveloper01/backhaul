import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_FIXES,
  MINIMUM_WINDOW_MS,
  NOMINAL_PACE,
  STALE_AFTER_MS,
  effectivePace,
  eta,
  isLate,
} from '../src/eta.ts';
import { distance, type Position } from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const fix = (lat: number, lon: number, minutes: number): Position => ({
  lat,
  lon,
  accuracy: 10,
  at: at(minutes),
});

const LAGOS = fix(6.4550, 3.3841, 0);
const KANO = fix(12.0022, 8.5920, 0);

/** A track heading north-east from Lagos at a steady pace. */
function heading(fixes: number, minutesApart: number, degreesPerStep: number) {
  return Array.from({ length: fixes }, (_, i) =>
    fix(6.4550 + i * degreesPerStep, 3.3841 + i * degreesPerStep, i * minutesApart),
  );
}

describe('effective pace', () => {
  test('is door to door, not the speedometer', () => {
    // A trailer cruising at 80 that spends nine hours at checkpoints makes
    // about 35 over the day. Projecting from cruising speed is wrong by most
    // of a day and looks authoritative doing it.
    const track = [
      fix(6.4550, 3.3841, 0),
      fix(6.9000, 3.9000, 120), // moved
      fix(6.9000, 3.9000, 300), // three hours at a checkpoint
      fix(7.3775, 3.9470, 420),
    ];
    const pace = effectivePace(track);
    assert.ok(pace !== null);
    const kmh = pace * 3.6;
    assert.ok(kmh > 10 && kmh < 30, `got ${kmh.toFixed(1)} km/h`);
  });

  test('a single fix has no pace, and says so rather than returning zero', () => {
    assert.equal(effectivePace([LAGOS]), null);
    assert.equal(effectivePace([]), null);
  });

  test('a zero-length window has no pace rather than an infinite one', () => {
    // Two fixes at the same instant would divide by zero and produce
    // Infinity, which projects an arrival in the past.
    assert.equal(effectivePace([fix(6.45, 3.38, 0), fix(6.55, 3.48, 0)]), null);
  });
});

describe('what it refuses to estimate', () => {
  test('a trip with no positions', () => {
    const e = eta({ track: [], destination: KANO, now: T0, truckClass: 'trailer_30t' });
    assert.equal(e.kind, 'unknown');
    if (e.kind === 'unknown') assert.equal(e.reason, 'no_track');
  });

  test('a truck that went silent hours ago', () => {
    // The last known pace no longer says anything about now.
    const track = heading(8, 30, 0.05);
    const e = eta({
      track,
      destination: KANO,
      now: new Date(track[7]!.at.getTime() + STALE_AFTER_MS + 60_000),
    });
    assert.equal(e.kind, 'unknown');
    if (e.kind === 'unknown') {
      assert.equal(e.reason, 'stale');
      assert.match(e.detail, /No signal for/);
    }
  });

  test('too few fixes, with no class to fall back on', () => {
    const e = eta({ track: heading(2, 30, 0.05), destination: KANO, now: at(35) });
    assert.equal(e.kind, 'unknown');
    if (e.kind === 'unknown') {
      assert.equal(e.reason, 'not_enough_fixes');
      assert.match(e.detail, new RegExp(String(MINIMUM_FIXES)));
    }
  });

  test('a window too short to say anything about a day of driving', () => {
    const track = heading(6, 4, 0.01); // 20 minutes of fixes
    const e = eta({ track, destination: KANO, now: at(21) });
    assert.equal(e.kind, 'unknown');
    if (e.kind === 'unknown') assert.equal(e.reason, 'window_too_short');
    assert.equal(MINIMUM_WINDOW_MS, 30 * 60_000);
  });

  test('a parked truck, whose pace says nothing about arrival', () => {
    const parked = Array.from({ length: 8 }, (_, i) => fix(6.4550, 3.3841, i * 20));
    const e = eta({ track: parked, destination: KANO, now: at(145) });
    assert.equal(e.kind, 'unknown');
    if (e.kind === 'unknown') assert.equal(e.reason, 'not_moving');
  });

  test('every refusal says what would fix it', () => {
    // A screen that can only render "unavailable" leaves the user with
    // nothing to do about it.
    const cases = [
      eta({ track: [], destination: KANO, now: T0 }),
      eta({ track: heading(2, 30, 0.05), destination: KANO, now: at(35) }),
      eta({ track: heading(6, 4, 0.01), destination: KANO, now: at(21) }),
    ];
    for (const e of cases) {
      assert.equal(e.kind, 'unknown');
      if (e.kind === 'unknown') assert.ok(e.detail.length > 20, e.detail);
    }
  });
});

describe('the estimate', () => {
  const track = heading(10, 30, 0.08); // 4.5 hours, moving steadily

  test('is a range, ordered, around the expectation', () => {
    const e = eta({ track, destination: KANO, now: at(275) });
    assert.equal(e.kind, 'known');
    if (e.kind !== 'known') return;
    assert.ok(e.earliest < e.expected && e.expected < e.latest);
  });

  test("built from this truck's own pace is not marked modelled", () => {
    const e = eta({ track, destination: KANO, now: at(275), truckClass: 'trailer_30t' });
    assert.equal(e.kind, 'known');
    if (e.kind === 'known') assert.equal(e.isModelled, false);
  });

  test('a thin track falls back to the class average, and says so', () => {
    // Measured and modelled are never confused — the same rule Grid enforces
    // on a bill projection.
    const e = eta({
      track: heading(2, 20, 0.05),
      destination: KANO,
      now: at(25),
      truckClass: 'trailer_30t',
    });
    assert.equal(e.kind, 'known');
    if (e.kind === 'known') {
      assert.equal(e.isModelled, true);
      assert.equal(e.pace, NOMINAL_PACE.trailer_30t);
    }
  });

  test('a slower class arrives later over the same road', () => {
    const one = eta({ track: [LAGOS, fix(6.46, 3.39, 5)], destination: KANO, now: at(6), truckClass: 'pickup' });
    const other = eta({ track: [LAGOS, fix(6.46, 3.39, 5)], destination: KANO, now: at(6), truckClass: 'lowbed' });
    assert.equal(one.kind, 'known');
    assert.equal(other.kind, 'known');
    if (one.kind === 'known' && other.kind === 'known') {
      assert.ok(other.expected > one.expected);
    }
  });

  test('remaining distance is the straight line, and is honest about it', () => {
    const e = eta({ track, destination: KANO, now: at(275) });
    assert.equal(e.kind, 'known');
    if (e.kind === 'known') {
      assert.equal(e.remaining, distance(track.at(-1) as Position, KANO));
    }
  });

  test('a truck already at the destination arrives now, not in the past', () => {
    const arrived = [...track, { ...KANO, at: at(300) }];
    const e = eta({ track: arrived, destination: KANO, now: at(301) });
    assert.equal(e.kind, 'known');
    if (e.kind === 'known') {
      assert.equal(e.remaining, 0);
      assert.equal(e.expected.getTime(), at(301).getTime());
    }
  });
});

describe('lateness', () => {
  const track = heading(10, 30, 0.08);

  test('warns on the far end of the range, not the middle', () => {
    // A shipper needs telling while there is still time to do something. An
    // alert that waits for the midpoint to slip arrives after the decision
    // has been made for them.
    const e = eta({ track, destination: KANO, now: at(275) });
    assert.equal(e.kind, 'known');
    if (e.kind !== 'known') return;

    const between = new Date((e.expected.getTime() + e.latest.getTime()) / 2);
    assert.equal(isLate(e, between), true);
    assert.equal(isLate(e, new Date(e.latest.getTime() + 60_000)), false);
  });

  test('an unknown ETA is never reported as late', () => {
    // "Late" is a claim, and there is nothing here to make it with.
    const unknown = eta({ track: [], destination: KANO, now: T0 });
    assert.equal(isLate(unknown, T0), false);
  });
});

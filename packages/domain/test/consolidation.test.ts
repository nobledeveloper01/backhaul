import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DROP_SPREAD_M,
  MINIMUM_FILL,
  PICKUP_SPREAD_M,
  SHIPPER_DISCOUNT_PCT,
  canShare,
  pairs,
  price,
  type PairLoad,
} from '../src/consolidation.ts';
import { fromNaira } from '../src/money.ts';

const T0 = new Date('2026-03-04T06:00:00Z');

const KANO = { lat: 12.0022, lon: 8.592 };
const LAGOS = { lat: 6.455, lon: 3.3841 };
const IBADAN = { lat: 7.3775, lon: 3.947 };

const load = (id: string, over: Partial<PairLoad> = {}): PairLoad => ({
  id,
  origin: 'Kano',
  destination: 'Lagos',
  cargo: 'Onions',
  weightKg: 12_000,
  offered: fromNaira(1_200_000),
  readyFrom: T0,
  truckClass: 'trailer_30t',
  shipperTier: 'business',
  origin_: KANO,
  destination_: LAGOS,
  ...over,
});

describe('canShare', () => {
  test('two half-loads on the same corridor fit', () => {
    const verdict = canShare(load('a'), load('b'), 'trailer_30t');
    assert.equal(verdict.ok, true);
    if (verdict.ok) assert.ok(verdict.fill >= MINIMUM_FILL);
  });

  test('two loads that would overload the truck do not', () => {
    const verdict = canShare(
      load('a', { weightKg: 20_000 }),
      load('b', { weightKg: 18_000 }),
      'trailer_30t',
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, 'too_heavy');
      assert.match(verdict.detail, /this truck takes 30 t/);
    }
  });

  test('two small loads that still leave the trailer mostly air are refused', () => {
    // Two shippers, two sets of paperwork, two consignees and two chances of a
    // delay, for a truck that is still not full.
    const verdict = canShare(
      load('a', { weightKg: 5_000 }),
      load('b', { weightKg: 6_000 }),
      'trailer_30t',
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, 'too_empty');
      assert.match(verdict.detail, /only fill \d+%/);
    }
  });

  test('pickups too far apart are refused, with the distance', () => {
    const verdict = canShare(
      load('a'),
      load('b', { origin_: LAGOS }),
      'trailer_30t',
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, 'pickups_too_far');
      assert.match(verdict.detail, /km between the two pickups/);
    }
  });

  test('deliveries have more room than pickups, because both are aboard by then', () => {
    assert.ok(DROP_SPREAD_M > PICKUP_SPREAD_M);

    // 130 km apart: fine for a pickup pair? No — and that is the point.
    const verdict = canShare(load('a'), load('b', { destination_: IBADAN }), 'trailer_30t');
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, 'drops_too_far');
  });

  test('two loads wanting different trucks are not a pair', () => {
    const verdict = canShare(
      load('a'),
      load('b', { truckClass: 'lowbed' }),
      'trailer_30t',
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, 'wrong_truck');
  });
});

describe('price', () => {
  test('both shippers pay less than a whole truck', () => {
    const pairing = price(load('a'), load('b'), 0.8);
    assert.ok(pairing.shipperPays[0] < load('a').offered);
    assert.equal(SHIPPER_DISCOUNT_PCT, 30);
  });

  test('and the carrier collects more than one fare for one run', () => {
    // Nobody is doing anybody a favour, which is why it works.
    const pairing = price(load('a'), load('b'), 0.8);
    assert.ok(pairing.carrierGets > load('a').offered);
    assert.ok(pairing.carrierGets < load('a').offered + load('b').offered);
  });
});

describe('pairs', () => {
  test('finds every workable pair, fullest first', () => {
    const board = [
      load('big-a', { weightKg: 15_000 }),
      load('big-b', { weightKg: 14_000 }),
      load('small', { weightKg: 8_000 }),
    ];

    const found = pairs(board, 'trailer_30t');
    assert.ok(found.length >= 2);
    assert.ok((found[0]?.fill ?? 0) >= (found[1]?.fill ?? 0));
  });

  test('never pairs a load with itself', () => {
    const found = pairs([load('a'), load('b')], 'trailer_30t');
    for (const pairing of found) {
      assert.notEqual(pairing.a.id, pairing.b.id);
    }
  });

  test('an empty board proposes nothing rather than throwing', () => {
    assert.equal(pairs([], 'trailer_30t').length, 0);
    assert.equal(pairs([load('a')], 'trailer_30t').length, 0);
  });
});

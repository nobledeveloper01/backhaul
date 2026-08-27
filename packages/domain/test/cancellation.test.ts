import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CARRIER_FEE_PCT,
  GRACE_MS,
  SHIPPER_FEE_PCT,
  cancel,
  countsAgainstRecord,
} from '../src/cancellation.ts';
import { fromNaira } from '../src/money.ts';

const NOW = new Date('2026-03-04T12:00:00Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60_000);

const FARE = fromNaira(2_240_000);

const ask = (over: Partial<Parameters<typeof cancel>[0]> = {}) =>
  cancel({
    by: 'shipper',
    state: 'loading',
    agreed: FARE,
    acceptedAt: hoursAgo(20),
    now: NOW,
    ...over,
  });

describe('cancel', () => {
  test('a finished trip cannot be cancelled', () => {
    const result = ask({ state: 'delivered' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'terminal');
  });

  test('cancelling within two hours of accepting is free', () => {
    const result = ask({ state: 'assigned', acceptedAt: hoursAgo(1) });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fee, 0);
      assert.equal(result.withinGrace, true);
    }
  });

  test('but the grace period does not cover a truck already at the depot', () => {
    // Its day is spent, however recently the bid was accepted.
    const result = ask({ state: 'loading', acceptedAt: hoursAgo(1) });
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.fee > 0);
  });

  test('a shipper cancelling before anything happened pays nothing', () => {
    const result = ask({ state: 'assigned' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.feePct, 0);
  });

  test('a carrier pulling out at the same stage does pay', () => {
    // The whole value of an accepted bid is that it can be relied on.
    const result = ask({ by: 'carrier', state: 'assigned' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.feePct, CARRIER_FEE_PCT.assigned);
  });

  test('the fee is real money, computed from the fare', () => {
    const result = ask({ state: 'loading' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.feePct, SHIPPER_FEE_PCT.loading);
      assert.equal(result.fee, fromNaira(1_120_000));
    }
  });

  test('abandoning a loaded trip costs the whole fare, from either side', () => {
    for (const by of ['shipper', 'carrier'] as const) {
      const result = ask({ by, state: 'in_transit' });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.feePct, 100);
    }
  });

  test('every outcome carries the sentence that explains it', () => {
    for (const state of ['assigned', 'loading', 'in_transit'] as const) {
      const result = ask({ state });
      assert.equal(result.ok, true);
      // A fee that appears without an explanation is a fee somebody disputes.
      if (result.ok) assert.ok(result.detail.length > 10, state);
    }
  });

  test('the explanation says who the money goes to when a carrier pulls out', () => {
    const result = ask({ by: 'carrier', state: 'loading' });
    assert.equal(result.ok, true);
    if (result.ok) assert.match(result.detail, /paid to the shipper/);
  });

  test('the grace window is two hours, not a morning', () => {
    // Long enough to undo a mistake, short enough that it is not a way to hold
    // a truck while shopping around.
    assert.equal(GRACE_MS, 2 * 60 * 60_000);
    const justOut = ask({
      state: 'assigned',
      acceptedAt: new Date(NOW.getTime() - GRACE_MS - 1),
    });
    assert.equal(justOut.ok, true);
    if (justOut.ok) assert.equal(justOut.withinGrace, false);
  });
});

describe('countsAgainstRecord', () => {
  test('a carrier no-show is an incident', () => {
    assert.equal(countsAgainstRecord('carrier', 'loading'), true);
  });

  test('a shipper cancelling their own load is not somebody else risk', () => {
    assert.equal(countsAgainstRecord('shipper', 'loading'), false);
  });

  test('and an unaccepted load going away counts against nobody', () => {
    assert.equal(countsAgainstRecord('carrier', 'open'), false);
  });
});

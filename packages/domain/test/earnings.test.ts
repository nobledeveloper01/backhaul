import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_TRIPS_FOR_PER_KM,
  longestWaitMs,
  perKilometre,
  statement,
  unpaid,
  type Earning,
} from '../src/earnings.ts';
import { fromNaira } from '../src/money.ts';

const NOW = new Date('2026-03-31T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const MONTH_START = daysAgo(30);

const earning = (over: Partial<Earning> = {}): Earning => ({
  tripId: 't1',
  corridor: 'Lagos → Kano',
  deliveredAt: daysAgo(10),
  distanceM: 1_000_000,
  pay: fromNaira(120_000),
  advance: fromNaira(50_000),
  spent: fromNaira(45_000),
  paidAt: daysAgo(5),
  ...over,
});

describe('statement', () => {
  test('counts only what was delivered inside the window', () => {
    // "This month" is a question about a calendar, not about whatever trips
    // happened to be passed in.
    const found = statement(
      [earning({ deliveredAt: daysAgo(5) }), earning({ deliveredAt: daysAgo(90) })],
      MONTH_START,
      NOW,
    );
    assert.equal(found.trips, 1);
  });

  test('adds up the pay and the kilometres', () => {
    const found = statement([earning(), earning({ tripId: 't2' })], MONTH_START, NOW);
    assert.equal(found.earned, fromNaira(240_000));
    assert.equal(found.distanceM, 2_000_000);
  });

  test('counts out-of-pocket only where the road cost more than the advance', () => {
    const found = statement(
      [earning({ advance: fromNaira(30_000), spent: fromNaira(52_000) })],
      MONTH_START,
      NOW,
    );
    assert.equal(found.outOfPocket, fromNaira(22_000));
  });

  test('and never nets a trip with change against one without', () => {
    // Those are two separate settlements. Netting them across trips is how a
    // driver ends up owed money nobody can account for.
    const found = statement(
      [
        earning({ tripId: 'a', advance: fromNaira(60_000), spent: fromNaira(20_000) }),
        earning({ tripId: 'b', advance: fromNaira(10_000), spent: fromNaira(35_000) }),
      ],
      MONTH_START,
      NOW,
    );
    assert.equal(found.outOfPocket, fromNaira(25_000));
  });

  test('outstanding is what is earned and owed, less what has been settled', () => {
    const found = statement(
      [
        earning({ tripId: 'paid', paidAt: daysAgo(2) }),
        earning({ tripId: 'owed', paidAt: null, advance: 0 as never, spent: fromNaira(40_000) }),
      ],
      MONTH_START,
      NOW,
    );
    assert.equal(found.settled, fromNaira(120_000));
    assert.equal(found.outstanding, fromNaira(120_000 + 40_000));
  });

  test('an empty window is zeroes, not an error', () => {
    const found = statement([], MONTH_START, NOW);
    assert.equal(found.trips, 0);
    assert.equal(found.earned, 0);
    assert.equal(found.outstanding, 0);
  });
});

describe('perKilometre', () => {
  test('is the figure nobody has ever been able to give a driver', () => {
    const found = statement(
      Array.from({ length: 4 }, (_, i) => earning({ tripId: `t${i}` })),
      MONTH_START,
      NOW,
    );
    assert.equal(perKilometre(found), fromNaira(120));
  });

  test('refuses to answer from one short trip', () => {
    const thin = statement([earning()], MONTH_START, NOW);
    assert.equal(perKilometre(thin), null);
    assert.equal(MINIMUM_TRIPS_FOR_PER_KM, 3);
  });

  test('and never divides by zero kilometres', () => {
    const nowhere = statement(
      Array.from({ length: 4 }, (_, i) => earning({ tripId: `t${i}`, distanceM: 0 })),
      MONTH_START,
      NOW,
    );
    assert.equal(perKilometre(nowhere), null);
  });
});

describe('unpaid', () => {
  test('puts the oldest first, because that is the one to ask about', () => {
    // Newest-first puts the trip from six weeks ago — the one that has
    // actually gone wrong — at the bottom where nobody scrolls.
    const found = unpaid([
      earning({ tripId: 'recent', deliveredAt: daysAgo(3), paidAt: null }),
      earning({ tripId: 'ancient', deliveredAt: daysAgo(45), paidAt: null }),
      earning({ tripId: 'settled', paidAt: daysAgo(1) }),
    ]);
    assert.deepEqual(found.map((e) => e.tripId), ['ancient', 'recent']);
  });
});

describe('longestWaitMs', () => {
  test('says how long the oldest unpaid trip has waited', () => {
    const waited = longestWaitMs([earning({ deliveredAt: daysAgo(40), paidAt: null })], NOW);
    assert.equal(waited, 40 * 86_400_000);
  });

  test('and is null when everything is settled', () => {
    // Which the screen renders as a sentence, not as a zero.
    assert.equal(longestWaitMs([earning()], NOW), null);
  });
});

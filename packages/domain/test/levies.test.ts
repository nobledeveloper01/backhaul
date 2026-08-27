import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_TRIPS_FOR_CORRIDOR,
  NOTE_ABOVE,
  byKind,
  corridorCost,
  describeLevy,
  describeTotal,
  needsNote,
  reconcile,
  total,
  type Levy,
  type LevyKind,
} from '../src/levies.ts';
import { fromNaira } from '../src/money.ts';

const T0 = new Date('2026-03-04T08:00:00Z');

const KINDS: readonly LevyKind[] = [
  'police',
  'state_revenue',
  'union',
  'weighbridge',
  'park',
  'ferry',
  'other',
];

const levy = (over: Partial<Levy> = {}): Levy => ({
  id: 'l1',
  tripId: 'trip-1',
  kind: 'police',
  amount: fromNaira(2_000),
  at: T0,
  near: { lat: 8.5, lon: 4.5 },
  note: '',
  photoId: null,
  ...over,
});

describe('total', () => {
  test('adds up what the road took', () => {
    const spent = total([
      levy({ amount: fromNaira(2_000) }),
      levy({ amount: fromNaira(3_500) }),
      levy({ amount: fromNaira(1_000) }),
    ]);
    assert.equal(spent, fromNaira(6_500));
  });

  test('an empty ledger is zero, not an error', () => {
    assert.equal(total([]), 0);
  });
});

describe('needsNote', () => {
  test('an ordinary checkpoint payment needs no explanation', () => {
    assert.equal(needsNote(fromNaira(2_000)), false);
  });

  test('a large one is asked about now rather than queried in a week', () => {
    assert.equal(needsNote(fromNaira(45_000)), true);
    assert.equal(NOTE_ABOVE, fromNaira(20_000));
  });
});

describe('byKind', () => {
  test('shows the shape of the problem, largest first', () => {
    const found = byKind([
      levy({ kind: 'police', amount: fromNaira(2_000) }),
      levy({ kind: 'police', amount: fromNaira(3_000) }),
      levy({ kind: 'union', amount: fromNaira(9_000) }),
      levy({ kind: 'park', amount: fromNaira(1_000) }),
    ]);

    assert.deepEqual(found.map((row) => row.kind), ['union', 'police', 'park']);
    assert.equal(found[1]?.amount, fromNaira(5_000));
    assert.equal(found[1]?.count, 2);
  });
});

describe('reconcile', () => {
  test('says what is left of the advance', () => {
    const { spent, balance, owedToDriver } = reconcile(fromNaira(50_000), [
      levy({ amount: fromNaira(12_000) }),
      levy({ amount: fromNaira(8_000) }),
    ]);
    assert.equal(spent, fromNaira(20_000));
    assert.equal(balance, fromNaira(30_000));
    assert.equal(owedToDriver, false);
  });

  test('and goes negative when a driver has been out of pocket', () => {
    // The common case on a long run, and the whole reason a driver keeps a
    // mental tally. Flooring this at zero would hide the number they care
    // about.
    const { balance, owedToDriver } = reconcile(fromNaira(20_000), [
      levy({ amount: fromNaira(31_000) }),
    ]);
    assert.equal(balance, fromNaira(-11_000));
    assert.equal(owedToDriver, true);
  });
});

describe('corridorCost', () => {
  test('refuses to answer from an anecdote', () => {
    // A corridor cost from two runs priced into a lane is a carrier losing
    // money on a rate they believed.
    assert.equal(corridorCost([fromNaira(40_000), fromNaira(45_000)]), null);
  });

  test('answers once there are enough trips', () => {
    const runs = [30, 35, 40, 45, 50].map((n) => fromNaira(n * 1_000));
    assert.equal(corridorCost(runs), fromNaira(40_000));
    assert.equal(MINIMUM_TRIPS_FOR_CORRIDOR, 5);
  });

  test('uses the median, so one terrible trip does not set the rate', () => {
    // A truck held for two days and charged ₦180,000 would drag an average
    // into uselessness.
    const runs = [30, 35, 40, 45, 180].map((n) => fromNaira(n * 1_000));
    assert.equal(corridorCost(runs), fromNaira(40_000));
  });

  test('an even number of trips splits the middle two', () => {
    const runs = [20, 30, 40, 50, 60, 70].map((n) => fromNaira(n * 1_000));
    assert.equal(corridorCost(runs), fromNaira(45_000));
  });
});

describe('wording', () => {
  test('every kind has plain words with no underscore in them', () => {
    for (const kind of KINDS) {
      assert.doesNotMatch(describeLevy(kind), /_/);
    }
  });

  test('an empty ledger says so rather than showing ₦0', () => {
    assert.equal(describeTotal([]), 'Nothing recorded on the road yet.');
  });

  test('and one entry is "1 stop", not "1 stops"', () => {
    assert.match(describeTotal([levy()]), /over 1 stop\.$/);
  });
});

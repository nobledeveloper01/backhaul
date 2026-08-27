import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CARRIER_CLAIMS,
  MINIMUM_ANSWERS,
  REVIEW_WINDOW_DAYS,
  SHIPPER_CLAIMS,
  askCarrier,
  askShipper,
  labelCarrier,
  labelShipper,
  reviewable,
  tally,
  worthShowing,
  type CarrierClaim,
  type Review,
} from '../src/ratings.ts';

const T0 = new Date('2026-03-06T14:20:00Z');
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

const review = (
  answers: Review<CarrierClaim>['answers'],
  id = 'trip-1',
): Review<CarrierClaim> => ({ tripId: id, at: T0, answers, note: '' });

describe('tally', () => {
  test('counts how often each claim was true', () => {
    const reviews = [
      review({ arrived_to_load: true, cargo_intact: true }),
      review({ arrived_to_load: false, cargo_intact: true }, 'trip-2'),
      review({ arrived_to_load: true, cargo_intact: true }, 'trip-3'),
    ];
    const counted = tally(reviews, CARRIER_CLAIMS);
    const arrived = counted.find((t) => t.claim === 'arrived_to_load');
    assert.deepEqual(arrived, { claim: 'arrived_to_load', yes: 2, asked: 3 });
  });

  test('a missing answer is missing, not a no', () => {
    // Somebody who did not tick "the driver could be reached" may simply never
    // have needed to call.
    const counted = tally([review({ arrived_to_load: true })], CARRIER_CLAIMS);
    const reachable = counted.find((t) => t.claim === 'reachable');
    assert.deepEqual(reachable, { claim: 'reachable', yes: 0, asked: 0 });
  });

  test('keeps the denominator rather than collapsing to a fraction', () => {
    // "2 of 2" and "34 of 34" are the same fraction and not the same evidence.
    const two = tally([review({ no_extras: true }), review({ no_extras: true }, 't2')], [
      'no_extras',
    ]);
    assert.equal(two[0]?.asked, 2);
  });

  test('returns a row for every claim, so a profile has no gaps', () => {
    assert.equal(tally([], CARRIER_CLAIMS).length, CARRIER_CLAIMS.length);
    assert.equal(tally([], SHIPPER_CLAIMS).length, SHIPPER_CLAIMS.length);
  });
});

describe('worthShowing', () => {
  test('one bad trip is not a pattern', () => {
    // A new carrier who can never outrun a first review never gets a second
    // load, and then the marketplace has no new carriers.
    assert.equal(worthShowing({ claim: 'reachable', yes: 0, asked: 1 }), false);
    assert.equal(worthShowing({ claim: 'reachable', yes: 2, asked: MINIMUM_ANSWERS }), true);
  });
});

describe('reviewable', () => {
  test('open for a week after delivery', () => {
    assert.equal(reviewable(T0, days(1)), true);
    assert.equal(reviewable(T0, days(REVIEW_WINDOW_DAYS)), true);
    assert.equal(reviewable(T0, days(REVIEW_WINDOW_DAYS + 1)), false);
  });

  test('not before the delivery happened', () => {
    assert.equal(reviewable(T0, days(-1)), false);
  });
});

describe('wording', () => {
  test('every claim has a question and a label', () => {
    for (const claim of CARRIER_CLAIMS) {
      assert.ok(askCarrier(claim).endsWith('?'));
      assert.ok(labelCarrier(claim).length > 0);
    }
    for (const claim of SHIPPER_CLAIMS) {
      assert.ok(askShipper(claim).endsWith('?'));
      assert.ok(labelShipper(claim).length > 0);
    }
  });

  test('no claim is asked as a star or a score', () => {
    // The whole point: a reviewer answers a fact, not a feeling.
    for (const claim of CARRIER_CLAIMS) {
      assert.doesNotMatch(askCarrier(claim), /rate|star|score|out of/i);
    }
  });
});

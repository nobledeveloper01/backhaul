import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPIRY_WARNING_DAYS,
  MINIMUM_TRIPS_FOR_RATE,
  describeTier,
  expiringSoon,
  nextStep,
  onTimeRate,
  tierOf,
  type Documents,
  type Record_,
} from '../src/trust.ts';

const NOW = new Date('2026-03-04T06:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const docs = (over: Partial<Documents> = {}): Documents => ({
  identity: false,
  licence: false,
  registration: false,
  insurance: false,
  ...over,
});

const all = docs({ identity: true, licence: true, registration: true, insurance: true });

const record = (over: Partial<Record_> = {}): Record_ => ({
  tripsCompleted: 0,
  tripsOnTime: 0,
  incidents: 0,
  ...over,
});

describe('tierOf', () => {
  test('a carrier with nothing is unverified', () => {
    assert.equal(tierOf(docs(), record()), 'unverified');
  });

  test('ID and licence earn verified, with no trips at all', () => {
    // Otherwise nobody can ever start: a first trip requires a tier, and a
    // tier would require trips.
    assert.equal(tierOf(docs({ identity: true, licence: true }), record()), 'verified');
  });

  test('business needs registration, five trips and a record', () => {
    const papers = docs({ identity: true, licence: true, registration: true });
    assert.equal(tierOf(papers, record({ tripsCompleted: 5, tripsOnTime: 4 })), 'business');
    assert.equal(tierOf(papers, record({ tripsCompleted: 4, tripsOnTime: 4 })), 'verified');
    // 3/5 is 60%, under the 70% the tier asks for.
    assert.equal(tierOf(papers, record({ tripsCompleted: 5, tripsOnTime: 3 })), 'verified');
  });

  test('trusted needs cover, twenty trips and ninety per cent', () => {
    assert.equal(tierOf(all, record({ tripsCompleted: 20, tripsOnTime: 18 })), 'trusted');
    assert.equal(tierOf(all, record({ tripsCompleted: 20, tripsOnTime: 17 })), 'business');
  });

  test('an incident drops a carrier one tier, and does not zero them', () => {
    // Somebody whose truck was robbed is not thereby untrustworthy, and a
    // system that treats one bad trip as career-ending is one carriers lie to.
    const clean = record({ tripsCompleted: 20, tripsOnTime: 19 });
    assert.equal(tierOf(all, clean), 'trusted');
    assert.equal(tierOf(all, { ...clean, incidents: 1 }), 'business');
    assert.equal(tierOf(all, { ...clean, incidents: 2 }), 'verified');
  });

  test('incidents floor at unverified rather than falling off the ladder', () => {
    const clean = record({ tripsCompleted: 20, tripsOnTime: 19, incidents: 9 });
    assert.equal(tierOf(all, clean), 'unverified');
  });

  test('a tier is never self-reported — only documents and the record move it', () => {
    // The signature of the function is the assertion: there is nowhere to
    // pass a claim in. This test exists so deleting that property fails.
    assert.equal(tierOf.length, 2);
  });
});

describe('nextStep', () => {
  test('names the missing documents in words a carrier can act on', () => {
    const step = nextStep(docs(), record());
    assert.equal(step?.tier, 'verified');
    assert.deepEqual(step?.missing, ['a government ID', "a driver's licence"]);
  });

  test('counts the trips still needed, and gets the plural right', () => {
    const papers = docs({ identity: true, licence: true, registration: true });
    const four = nextStep(papers, record({ tripsCompleted: 4, tripsOnTime: 4 }));
    assert.ok(four?.missing.includes('1 more completed trip'));

    const three = nextStep(papers, record({ tripsCompleted: 3, tripsOnTime: 3 }));
    assert.ok(three?.missing.includes('2 more completed trips'));
  });

  test('does not demand an on-time record from somebody with no trips', () => {
    // "You need 70% on-time delivery" to a carrier with zero deliveries is a
    // dead end, not a next step.
    const step = nextStep(docs({ identity: true, licence: true }), record());
    assert.ok(!step?.missing.some((m) => m.includes('on-time')));
  });

  test('the top of the ladder has no next step', () => {
    assert.equal(nextStep(all, record({ tripsCompleted: 20, tripsOnTime: 20 })), null);
  });
});

describe('onTimeRate', () => {
  test('refuses a percentage from a handful of trips', () => {
    // "100% on time" from one delivery is true and completely misleading, and
    // it is the number a shipper decides on.
    assert.equal(onTimeRate(record({ tripsCompleted: 1, tripsOnTime: 1 })), null);
    assert.equal(onTimeRate(record({ tripsCompleted: MINIMUM_TRIPS_FOR_RATE - 1 })), null);
  });

  test('answers once there is enough to answer with', () => {
    assert.equal(onTimeRate(record({ tripsCompleted: 10, tripsOnTime: 9 })), 0.9);
  });
});

describe('expiringSoon', () => {
  test('warns ahead of the day rather than on it', () => {
    // A carrier who loses a tier mid-trip loses work already committed to.
    const soon = expiringSoon([{ kind: 'insurance', on: days(20) }], NOW);
    assert.equal(soon.length, 1);
    assert.equal(soon[0]?.days, 20);
  });

  test('says nothing about a document with months left', () => {
    assert.equal(expiringSoon([{ kind: 'licence', on: days(200) }], NOW).length, 0);
    assert.ok(EXPIRY_WARNING_DAYS < 200);
  });

  test('an already-expired document is reported, with negative days', () => {
    const gone = expiringSoon([{ kind: 'insurance', on: days(-5) }], NOW);
    assert.equal(gone[0]?.days, -5);
  });

  test('the most urgent comes first', () => {
    const soon = expiringSoon(
      [
        { kind: 'insurance', on: days(25) },
        { kind: 'licence', on: days(2) },
      ],
      NOW,
    );
    assert.deepEqual(soon.map((e) => e.kind), ['licence', 'insurance']);
  });
});

describe('describeTier', () => {
  test('every tier has a badge, and none of them says "unverified"', () => {
    assert.equal(describeTier('unverified'), 'Not verified');
    assert.equal(describeTier('verified'), 'Verified');
    assert.equal(describeTier('business'), 'Business');
    assert.equal(describeTier('trusted'), 'Trusted');
  });
});

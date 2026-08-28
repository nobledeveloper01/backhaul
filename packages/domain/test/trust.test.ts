import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPIRY_WARNING_DAYS,
  REQUIREMENTS,
  LADDER,
  MINIMUM_TRIPS_FOR_RATE,
  describeTier,
  expiringSoon,
  meets,
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

/**
 * A record, with the punctuality denominator following the numerator.
 *
 * `tripsPromised` defaults to `tripsCompleted` so the cases below read as they
 * did — a carrier with 20 trips and 19 on time — and any case that wants a
 * carrier with deliveries but no deadlines says so explicitly.
 */
const record = (over: Partial<Record_> = {}): Record_ => {
  const completed = over.tripsCompleted ?? 0;
  return {
    tripsCompleted: completed,
    tripsPromised: completed,
    tripsOnTime: 0,
    incidents: 0,
    ...over,
  };
};

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

describe('a trip nobody set a deadline for', () => {
  /*
    The defect this shape exists to prevent.

    The server counted every delivered trip as on time, because the promised
    arrival lives with the commercial terms and not every trip has them. So a
    carrier who had never been held to a deadline scored 100%, walked the
    punctuality bar on both tiers above Verified, and made the reliability term
    in the bid ranking the same number for everybody.
  */
  test('does not carry a carrier past a tier that names punctuality', () => {
    // Twenty deliveries, all four documents, and not one deadline among them.
    // Both Business and Trusted name a punctuality bar, and there is no
    // evidence of any punctuality — so the ladder stops at Verified.
    //
    // This is the trade, stated: a carrier who is never given a delivery date
    // cannot climb, and a shipper is never shown a badge that was earned on no
    // evidence. The second is worse, and the first has a fix inside the
    // product — a shipper who posts a load says when they want it.
    const noPromises = record({ tripsCompleted: 20, tripsPromised: 0, tripsOnTime: 0 });
    assert.equal(tierOf(all, noPromises), 'verified');

    // The same twenty, judged and kept, is the tier.
    const kept = record({ tripsCompleted: 20, tripsPromised: 20, tripsOnTime: 20 });
    assert.equal(tierOf(all, kept), 'trusted');
  });

  test('and names the evidence rather than accusing them of lateness', () => {
    // The other half of the same rule, and the thing that keeps it from being
    // a dead end. A missing deadline must not read as a missed one.
    const step = nextStep(all, record({ tripsCompleted: 20, tripsPromised: 0, tripsOnTime: 0 }));
    assert.deepEqual(step?.missing, ['5 more trips with an agreed delivery date']);

    // One short of enough evidence still asks for evidence, singular.
    const nearly = nextStep(all, record({ tripsCompleted: 20, tripsPromised: 4, tripsOnTime: 4 }));
    assert.deepEqual(nearly?.missing, ['1 more trip with an agreed delivery date']);

    // Enough evidence and a poor record names the record.
    const late = nextStep(all, record({ tripsCompleted: 20, tripsPromised: 10, tripsOnTime: 5 }));
    assert.deepEqual(late?.missing, ['70% on-time delivery']);
  });

  test('and shows no rate at all rather than a flattering one', () => {
    // Five deliveries is the bar for showing a figure, and five deliveries
    // with no deadlines between them is not five pieces of evidence.
    assert.equal(
      onTimeRate(record({ tripsCompleted: 20, tripsPromised: 0, tripsOnTime: 0 })),
      null,
    );
    assert.equal(
      onTimeRate(record({ tripsCompleted: 20, tripsPromised: 4, tripsOnTime: 4 })),
      null,
    );
    assert.equal(
      onTimeRate(record({ tripsCompleted: 20, tripsPromised: 10, tripsOnTime: 9 })),
      0.9,
    );
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

describe('meets', () => {
  test('above the bar counts, not just level with it', () => {
    // A shipper asking for Verified means "not a stranger off the street".
    // Refusing a Trusted carrier would enforce a distinction nobody meant.
    assert.equal(meets('trusted', 'verified'), true);
    assert.equal(meets('business', 'verified'), true);
    assert.equal(meets('verified', 'verified'), true);
  });

  test('below the bar does not', () => {
    assert.equal(meets('unverified', 'verified'), false);
    assert.equal(meets('verified', 'business'), false);
    assert.equal(meets('business', 'trusted'), false);
  });

  test('a load with no bar admits everybody', () => {
    // The default, and the one most loads will carry. A bar is a shipper
    // narrowing their own market and they should have to ask for it.
    for (const tier of LADDER) {
      assert.equal(meets(tier, 'unverified'), true);
    }
  });

  test('it reads the same ladder tierOf walks', () => {
    // Two spellings of one ordering is how a carrier gets admitted by one
    // rule and refused by another.
    assert.deepEqual([...LADDER], ['unverified', 'verified', 'business', 'trusted']);
    for (const tier of LADDER) {
      assert.ok(Object.hasOwn(REQUIREMENTS, tier));
    }
  });
});

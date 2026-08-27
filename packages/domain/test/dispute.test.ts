import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  GAP_MS,
  LATE_AFTER_MS,
  assemble,
  describePack,
  isThin,
  weigh,
  type Evidence,
} from '../src/dispute.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * 60 * 60_000);

const item = (over: Partial<Evidence> = {}): Evidence => ({
  kind: 'position',
  at: T0,
  receivedAt: T0,
  summary: 'a fix',
  source: 'system',
  ...over,
});

describe('weigh', () => {
  test('anything the tracker produced is measured', () => {
    // Neither party could have written it.
    assert.equal(weigh(item({ source: 'system' })), 'measured');
  });

  test('a person report that arrived promptly is attested', () => {
    assert.equal(
      weigh(item({ source: 'driver', at: at(1), receivedAt: at(1.2) })),
      'attested',
    );
  });

  test('one that arrived hours later is marked as such', () => {
    // Long enough to cover an ordinary dead zone; short enough that a message
    // written after the argument started and back-dated is visible as that.
    assert.equal(
      weigh(item({ source: 'driver', at: at(1), receivedAt: at(6) })),
      'late_attested',
    );
    assert.equal(LATE_AFTER_MS, 2 * 60 * 60_000);
  });

  test('one that never arrived is attested, not late', () => {
    // There is no delay to measure yet. Calling it late would accuse somebody
    // of something the record does not show.
    assert.equal(weigh(item({ source: 'driver', receivedAt: null })), 'attested');
  });
});

describe('assemble', () => {
  test('orders by when things happened, not when they arrived', () => {
    // Sorting by arrival puts a driver dead-zone message after the delivery it
    // preceded, and the pack is a reconstruction of the trip.
    const pack = assemble(
      'trip-1',
      [
        item({ summary: 'delivered', at: at(10), receivedAt: at(10) }),
        item({ summary: 'weighbridge', source: 'driver', at: at(4), receivedAt: at(11) }),
      ],
      at(12),
    );

    assert.deepEqual(pack.items.map((i) => i.summary), ['weighbridge', 'delivered']);
  });

  test('ties are broken by what the server saw', () => {
    const pack = assemble(
      'trip-1',
      [
        item({ summary: 'second', at: at(3), receivedAt: at(9) }),
        item({ summary: 'first', at: at(3), receivedAt: at(3) }),
      ],
      at(12),
    );
    assert.deepEqual(pack.items.map((i) => i.summary), ['first', 'second']);
  });

  test('counts each weight, so the shape of the record is visible at a glance', () => {
    const pack = assemble(
      'trip-1',
      [
        item(),
        item({ at: at(1) }),
        item({ source: 'driver', at: at(2), receivedAt: at(2) }),
        item({ source: 'shipper', at: at(3), receivedAt: at(9) }),
      ],
      at(12),
    );
    assert.deepEqual(pack.counts, { measured: 2, attested: 1, late_attested: 1 });
  });

  test('names the stretches with nothing in them', () => {
    // A hole is the thing both sides point at.
    const pack = assemble('trip-1', [item({ at: at(0) }), item({ at: at(9) })], at(12));
    assert.equal(pack.gaps.length, 1);
    assert.equal(pack.gaps[0]?.ms, 9 * 60 * 60_000);
  });

  test('a quiet hour is not a gap', () => {
    const pack = assemble('trip-1', [item({ at: at(0) }), item({ at: at(1) })], at(12));
    assert.equal(pack.gaps.length, 0);
    assert.equal(GAP_MS, 3 * 60 * 60_000);
  });

  test('an empty trip assembles to an empty pack rather than throwing', () => {
    const pack = assemble('trip-1', [], at(12));
    assert.equal(pack.items.length, 0);
    assert.equal(pack.gaps.length, 0);
  });
});

describe('describePack', () => {
  const pack = assemble(
    'trip-1',
    [
      ...Array.from({ length: 6 }, (_, i) => item({ at: at(i * 0.5) })),
      item({ source: 'driver', at: at(4), receivedAt: at(9) }),
      item({ at: at(14) }),
    ],
    at(20),
  );

  test('says what is in it, in counts and hours', () => {
    const said = describePack(pack);
    assert.match(said, /8 items/);
    assert.match(said, /measured by the tracker/);
  });

  test('and takes no side about any of it', () => {
    // The moment this sentence contains "strong" or "weak" it is the platform
    // adjudicating its own dispute.
    for (const word of ['strong', 'weak', 'suggests', 'likely', 'fault', 'clearly']) {
      assert.doesNotMatch(describePack(pack), new RegExp(word, 'i'));
    }
  });

  test('an empty pack says so plainly', () => {
    assert.equal(describePack(assemble('t', [], at(1))), 'Nothing recorded on this trip.');
  });
});

describe('isThin', () => {
  test('a handful of items is not enough to argue from', () => {
    const thin = assemble('t', [item(), item({ at: at(1) })], at(2));
    assert.equal(isThin(thin), true);
  });

  test('a full trip is not thin', () => {
    const full = assemble(
      't',
      Array.from({ length: 12 }, (_, i) => item({ at: at(i * 0.5) })),
      at(8),
    );
    assert.equal(isThin(full), false);
  });
});

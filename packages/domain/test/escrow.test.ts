import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  IN_TRANSIT_MS,
  RETENTION_DAYS,
  SCHEDULE,
  heldBack,
  isMet,
  nextRelease,
  released,
  schedule,
  sumsTo100,
  type EscrowConditions,
} from '../src/escrow.ts';
import { fromNaira } from '../src/money.ts';

const NOW = new Date('2026-03-12T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const FARE = fromNaira(2_000_000);

const conditions = (over: Partial<EscrowConditions> = {}): EscrowConditions => ({
  state: 'in_transit',
  movingForMs: 8 * 60 * 60_000,
  podSealed: false,
  deliveredAt: null,
  exceptionRaised: false,
  ...over,
});

describe('SCHEDULE', () => {
  test('adds up to the whole fare', () => {
    // A schedule that sums to 95 quietly keeps 5% of every trip and nobody
    // notices for months.
    assert.equal(sumsTo100(), true);
  });

  test('pays something on the day the truck loads', () => {
    // The diesel is bought with it. A schedule that pays nothing until
    // delivery is one only carriers with working capital can accept.
    const advance = SCHEDULE.find((m) => m.kind === 'advance');
    assert.ok((advance?.pct ?? 0) >= 25);
  });

  test('holds back the smallest amount that still means anything', () => {
    const retention = SCHEDULE.find((m) => m.kind === 'retention');
    assert.equal(retention?.pct, 10);
  });

  test('every milestone names a condition in words, not a code', () => {
    for (const milestone of SCHEDULE) {
      assert.ok(milestone.condition.length > 20, milestone.kind);
      assert.doesNotMatch(milestone.condition, /_/);
    }
  });
});

describe('isMet', () => {
  test('the advance releases once loading has started', () => {
    assert.equal(isMet('advance', conditions({ state: 'loading' }), NOW), true);
    assert.equal(isMet('advance', conditions({ state: 'assigned' }), NOW), false);
  });

  test('the transit milestone needs six hours of arriving positions', () => {
    assert.equal(
      isMet('in_transit', conditions({ movingForMs: IN_TRANSIT_MS }), NOW),
      true,
    );
    assert.equal(isMet('in_transit', conditions({ movingForMs: 60_000 }), NOW), false);
  });

  test('delivery releases on the proof, not on the state', () => {
    // A state is a claim somebody made; the proof is photographs, a signature
    // and a position.
    assert.equal(isMet('delivered', conditions({ state: 'delivered' }), NOW), false);
    assert.equal(isMet('delivered', conditions({ podSealed: true }), NOW), true);
  });

  test('the retention waits a week after delivery', () => {
    const ready = conditions({ podSealed: true, deliveredAt: daysAgo(RETENTION_DAYS) });
    assert.equal(isMet('retention', ready, NOW), true);
    assert.equal(isMet('retention', { ...ready, deliveredAt: daysAgo(2) }, NOW), false);
  });

  test('and an open exception holds it, however long it has been', () => {
    // Releasing on a timer regardless would make the retention theatre.
    const disputed = conditions({
      podSealed: true,
      deliveredAt: daysAgo(90),
      exceptionRaised: true,
    });
    assert.equal(isMet('retention', disputed, NOW), false);
  });
});

describe('schedule', () => {
  test('returns every milestone, met or not', () => {
    // A schedule showing only what has been released answers "how much have I
    // had" and never "when do I get the rest".
    const found = schedule(FARE, conditions(), NOW);
    assert.equal(found.length, SCHEDULE.length);
  });

  test('each part is real money', () => {
    const found = schedule(FARE, conditions(), NOW);
    assert.equal(found[0]?.amount, fromNaira(600_000));
  });

  test('what has been released and what is held add up to the fare', () => {
    const found = schedule(FARE, conditions({ podSealed: true }), NOW);
    assert.equal(released(found) + heldBack(FARE, found), FARE);
  });
});

describe('nextRelease', () => {
  test('names the next thing that has to happen', () => {
    const found = schedule(FARE, conditions({ state: 'loading', movingForMs: 0 }), NOW);
    assert.equal(nextRelease(found)?.milestone.kind, 'in_transit');
  });

  test('and is null once everything has gone', () => {
    const done = schedule(
      FARE,
      conditions({ podSealed: true, deliveredAt: daysAgo(30) }),
      NOW,
    );
    assert.equal(nextRelease(done), null);
  });
});

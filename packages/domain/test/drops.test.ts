import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PER_DROP,
  completed,
  describeProgress,
  dropFee,
  isComplete,
  nextDrop,
  outOfOrder,
  remainingDrops,
  visitedButUndelivered,
  weightAboard,
  type Drop,
} from '../src/drops.ts';
import { fromNaira } from '../src/money.ts';
import type { Waypoint } from '../src/waypoints.ts';

const T0 = new Date('2026-03-06T09:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const where = (id: string, name: string): Waypoint => ({
  id,
  name,
  at: { lat: 12.0, lon: 8.5, accuracy: 0, at: T0 },
  kind: 'destination',
  radius: 400,
});

const drop = (id: string, over: Partial<Drop> = {}): Drop => ({
  id,
  at: where(`w-${id}`, `Market ${id}`),
  consignee: `Consignee ${id}`,
  goods: 'Rice',
  units: 100,
  weightKg: 5_000,
  deliveredAt: null,
  exception: null,
  ...over,
});

describe('remainingDrops', () => {
  test('keeps the order the truck was loaded in', () => {
    // The last drop is at the front of the box. A route that reorders them at
    // 4am requires unloading the whole thing at the first stop.
    const drops = [drop('a', { deliveredAt: at(10) }), drop('b'), drop('c')];
    assert.deepEqual(remainingDrops(drops).map((d) => d.id), ['b', 'c']);
  });
});

describe('weightAboard', () => {
  test('is what a weighbridge would read now, not what was loaded', () => {
    const drops = [
      drop('a', { weightKg: 8_000, deliveredAt: at(30) }),
      drop('b', { weightKg: 6_000 }),
      drop('c', { weightKg: 4_000 }),
    ];
    assert.equal(weightAboard(drops), 10_000);
  });
});

describe('nextDrop', () => {
  test('is the first one still aboard', () => {
    const drops = [drop('a', { deliveredAt: at(10) }), drop('b'), drop('c')];
    assert.equal(nextDrop(drops)?.id, 'b');
  });

  test('is null when the truck is empty', () => {
    assert.equal(nextDrop([drop('a', { deliveredAt: at(10) })]), null);
  });
});

describe('isComplete', () => {
  test('a trip finishes on signatures, not on geography', () => {
    // A truck can be at the last address with goods still on it.
    assert.equal(isComplete([drop('a', { deliveredAt: at(1) }), drop('b')]), false);
    assert.equal(
      isComplete([drop('a', { deliveredAt: at(1) }), drop('b', { deliveredAt: at(2) })]),
      true,
    );
  });

  test('a trip with no drops is not complete', () => {
    assert.equal(isComplete([]), false);
  });
});

describe('outOfOrder', () => {
  test('a drop made while an earlier one is still aboard is recorded', () => {
    // Not refused — a closed consignee is a real thing — but "delivered in the
    // order loaded" is otherwise assumed by everybody reading it afterwards.
    const drops = [drop('a'), drop('b', { deliveredAt: at(20) })];
    assert.deepEqual(outOfOrder(drops).map((d) => d.id), ['b']);
  });

  test('drops made in order are not', () => {
    const drops = [drop('a', { deliveredAt: at(10) }), drop('b', { deliveredAt: at(20) })];
    assert.equal(outOfOrder(drops).length, 0);
  });
});

describe('dropFee', () => {
  test('the first drop is the delivery and costs nothing extra', () => {
    // Otherwise this is a price rise wearing a feature's clothes.
    assert.equal(dropFee([drop('a')]), 0);
  });

  test('every one after it is a detour, a wait and a second set of papers', () => {
    assert.equal(dropFee([drop('a'), drop('b'), drop('c')]), PER_DROP * 2);
    assert.equal(PER_DROP, fromNaira(25_000));
  });

  test('an empty trip owes nothing', () => {
    assert.equal(dropFee([]), 0);
  });
});

describe('visitedButUndelivered', () => {
  test('a truck that reached an address and left loaded has a story to tell', () => {
    const drops = [drop('a'), drop('b', { deliveredAt: at(30) })];
    const found = visitedButUndelivered(drops, ['w-a', 'w-b']);
    assert.deepEqual(found.map((d) => d.id), ['a']);
  });
});

describe('describeProgress', () => {
  test('says how many are done and where the truck goes next', () => {
    const drops = [drop('a', { deliveredAt: at(10) }), drop('b'), drop('c')];
    assert.equal(describeProgress(drops), '1 of 3 signed for · next Market b');
  });

  test('and says so plainly when they are all done', () => {
    assert.equal(describeProgress([drop('a', { deliveredAt: at(1) })]), 'All 1 drops signed for.');
  });

  test('a trip with no drops does not pretend to have progress', () => {
    assert.equal(describeProgress([]), 'No drops on this trip.');
  });
});

describe('completed', () => {
  test('is the other half of remaining', () => {
    const drops = [drop('a', { deliveredAt: at(10) }), drop('b')];
    assert.equal(completed(drops).length + remainingDrops(drops).length, drops.length);
  });
});

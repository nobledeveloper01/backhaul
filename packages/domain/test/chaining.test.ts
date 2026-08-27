import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONNECTION_SLACK_MS,
  MAX_CHAIN_LEGS,
  MAX_REPOSITION_M,
  canFollow,
  chain,
  ladenFraction,
  summarise,
  type ChainLeg,
} from '../src/chaining.ts';
import { fromNaira } from '../src/money.ts';
import { distance, type Position } from '../src/geo.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

const place = (lat: number, lon: number): Position => ({ lat, lon, accuracy: 0, at: T0 });

const LAGOS = place(6.45, 3.39);
const IBADAN = place(7.38, 3.9);
const KANO = place(12.0, 8.52);
const KADUNA = place(10.52, 7.44);

const leg = (over: Partial<ChainLeg> = {}): ChainLeg => {
  const from = over.from ?? LAGOS;
  const to = over.to ?? KANO;
  return {
    loadId: 'l1',
    from,
    to,
    fromName: 'Lagos',
    toName: 'Kano',
    readyFrom: T0,
    deliverBy: hours(30),
    pays: fromNaira(2_000_000),
    distanceM: distance(from, to),
    ...over,
  };
};

describe('canFollow', () => {
  test('a load starting where the last one ended fits', () => {
    const first = leg();
    const second = leg({
      loadId: 'l2',
      from: KANO,
      to: KADUNA,
      fromName: 'Kano',
      toName: 'Kaduna',
      readyFrom: hours(30),
      deliverBy: hours(48),
    });
    assert.equal(canFollow(first, second).ok, true);
  });

  test('a reposition longer than the policy is refused, with the distance in it', () => {
    // A proposal that loses money teaches a carrier the suggestions are not
    // worth reading.
    const first = leg();
    const second = leg({
      loadId: 'l2',
      from: LAGOS,
      to: IBADAN,
      fromName: 'Lagos',
      toName: 'Ibadan',
      readyFrom: hours(30),
      deliverBy: hours(60),
    });
    const fit = canFollow(first, second);
    assert.equal(fit.ok, false);
    if (!fit.ok) {
      assert.equal(fit.reason, 'too_far');
      assert.match(fit.detail, /km empty/);
    }
    assert.ok(distance(KANO, LAGOS) > MAX_REPOSITION_M);
  });

  test('a connection the truck could not physically make is refused', () => {
    const first = leg();
    const second = leg({
      loadId: 'l2',
      from: KANO,
      to: KADUNA,
      fromName: 'Kano',
      toName: 'Kaduna',
      readyFrom: hours(30),
      // Due an hour after the first leg's own deadline: not makeable.
      deliverBy: hours(31),
    });
    const fit = canFollow(first, second);
    assert.equal(fit.ok, false);
    if (!fit.ok) assert.equal(fit.reason, 'too_tight');
  });

  test('the connection allows for loading and paperwork, not just the drive', () => {
    assert.ok(CONNECTION_SLACK_MS >= 3 * 3_600_000);
  });

  test('a load that loads before the current one is out of order', () => {
    const first = leg({ readyFrom: hours(10) });
    const second = leg({
      loadId: 'l2',
      from: KANO,
      to: KADUNA,
      fromName: 'Kano',
      toName: 'Kaduna',
      readyFrom: hours(2),
      deliverBy: hours(80),
    });
    const fit = canFollow(first, second);
    assert.equal(fit.ok, false);
    if (!fit.ok) assert.equal(fit.reason, 'wrong_order');
  });

  test('with no deadline on the first leg, distance is all that can be judged', () => {
    const first = leg({ deliverBy: null });
    const second = leg({
      loadId: 'l2',
      from: KANO,
      to: KADUNA,
      fromName: 'Kano',
      toName: 'Kaduna',
      readyFrom: T0,
      deliverBy: hours(4),
    });
    assert.equal(canFollow(first, second).ok, true);
  });
});

describe('summarise', () => {
  const legs = [
    leg(),
    leg({
      loadId: 'l2',
      from: KANO,
      to: KADUNA,
      fromName: 'Kano',
      toName: 'Kaduna',
      pays: fromNaira(600_000),
      readyFrom: hours(30),
      deliverBy: hours(50),
    }),
  ];

  test('adds up what the chain pays', () => {
    assert.equal(summarise(legs).pays, fromNaira(2_600_000));
  });

  test('counts the empty kilometres between legs, and only between them', () => {
    // Both legs join at Kano, so there is nothing empty in this chain.
    assert.equal(summarise(legs).deadheadM, 0);
    assert.equal(summarise([legs[0] as ChainLeg]).deadheadM, 0);
  });

  test('a gap between legs is counted as deadhead', () => {
    const disjoint = [
      leg(),
      leg({
        loadId: 'l2',
        from: KADUNA,
        to: LAGOS,
        fromName: 'Kaduna',
        toName: 'Lagos',
        readyFrom: hours(30),
        deliverBy: hours(60),
      }),
    ];
    assert.ok(summarise(disjoint).deadheadM > 100_000);
  });
});

describe('chain', () => {
  const outbound = leg();

  const pool: ChainLeg[] = [
    leg({
      loadId: 'kano-kaduna',
      from: KANO,
      to: KADUNA,
      fromName: 'Kano',
      toName: 'Kaduna',
      pays: fromNaira(700_000),
      readyFrom: hours(30),
      deliverBy: hours(54),
    }),
    leg({
      loadId: 'kaduna-lagos',
      from: KADUNA,
      to: LAGOS,
      fromName: 'Kaduna',
      toName: 'Lagos',
      pays: fromNaira(1_900_000),
      readyFrom: hours(54),
      deliverBy: hours(90),
    }),
    leg({
      loadId: 'unreachable',
      from: IBADAN,
      to: LAGOS,
      fromName: 'Ibadan',
      toName: 'Lagos',
      pays: fromNaira(9_000_000),
      readyFrom: hours(30),
      deliverBy: hours(90),
    }),
  ];

  test('builds the homeward chain and gets the truck back', () => {
    const built = chain(outbound, pool);
    assert.deepEqual(built.legs.map((l) => l.loadId), [
      'l1',
      'kano-kaduna',
      'kaduna-lagos',
    ]);
  });

  test('will not take a rich load it cannot reach', () => {
    // The Ibadan load pays four times as much and starts 800 km from where the
    // truck will be.
    const built = chain(outbound, pool);
    assert.ok(!built.legs.some((l) => l.loadId === 'unreachable'));
  });

  test('stops at three legs, because a fourth is planning fiction', () => {
    const built = chain(outbound, pool, MAX_CHAIN_LEGS);
    assert.ok(built.legs.length <= MAX_CHAIN_LEGS);
  });

  test('an empty pool leaves the truck with the leg it started with', () => {
    const built = chain(outbound, []);
    assert.deepEqual(built.legs.map((l) => l.loadId), ['l1']);
  });

  test('never takes the same load twice', () => {
    const duplicated = [...pool, ...pool];
    const built = chain(outbound, duplicated);
    assert.equal(new Set(built.legs.map((l) => l.loadId)).size, built.legs.length);
  });
});

describe('ladenFraction', () => {
  test('a chain that joins end to end is entirely laden', () => {
    const built = chain(leg(), []);
    assert.equal(ladenFraction(built), 1);
  });

  test('empty kilometres pull it down', () => {
    const disjoint = summarise([
      leg(),
      leg({
        loadId: 'l2',
        from: KADUNA,
        to: LAGOS,
        fromName: 'Kaduna',
        toName: 'Lagos',
        readyFrom: hours(30),
        deliverBy: hours(60),
      }),
    ]);
    assert.ok(ladenFraction(disjoint) < 1);
    assert.ok(ladenFraction(disjoint) > 0.8);
  });

  test('nothing driven is nothing laden, not a division by zero', () => {
    assert.equal(ladenFraction({ legs: [], deadheadM: 0, laden: 0, pays: fromNaira(0) }), 0);
  });
});

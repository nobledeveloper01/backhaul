import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { fromNaira, format, ZERO } from '../src/money.ts';
import {
  MINIMUM_LEGS,
  describeRate,
  describeRatio,
  utilisation,
  worthOfOneReturnLeg,
  type Leg,
} from '../src/utilisation.ts';

const loaded = (km: number, naira: number): Leg => ({
  metres: km * 1000,
  loaded: true,
  earned: fromNaira(naira),
});

const empty = (km: number): Leg => ({
  metres: km * 1000,
  loaded: false,
  earned: ZERO,
});

describe('utilisation', () => {
  test('a truck that runs out loaded and back empty is at 50%', () => {
    // The number the product exists to move. Every point of it is diesel,
    // tyres and a driver's day paid for by nothing.
    const u = utilisation([loaded(830, 2_240_000), empty(830)]);

    assert.equal(u.ratio, 0.5);
    assert.equal(describeRatio(u), '50% loaded');
  });

  test('the rate is per kilometre driven, not per kilometre paid', () => {
    // A haulier quoting ₦2,700 a kilometre who runs half of them empty is
    // really earning ₦1,350, and this is the figure that says so.
    const u = utilisation([loaded(1000, 2_700_000), empty(1000)]);
    assert.equal(u.perKmDriven, fromNaira(1350));
    assert.equal(describeRate(u), `${format(fromNaira(1350))} a kilometre driven`);
  });

  test('an empty leg earns nothing, by definition', () => {
    const u = utilisation([empty(500)]);
    assert.equal(u.earned, ZERO);
    assert.equal(u.ratio, 0);
  });

  test('a fleet with no legs is zero, not NaN', () => {
    // A screen rendering "NaN%" is worse than one rendering a truthful nothing.
    const u = utilisation([]);
    assert.equal(u.ratio, 0);
    assert.equal(u.perKmDriven, ZERO);
    assert.ok(Number.isFinite(u.ratio));
  });

  test('a perfectly used fleet is 100%', () => {
    const u = utilisation([loaded(400, 900_000), loaded(600, 1_400_000)]);
    assert.equal(u.ratio, 1);
    assert.equal(u.earned, fromNaira(2_300_000));
  });
});

describe('what one more return leg is worth', () => {
  test('is the pitch, as a number', () => {
    const legs = [
      loaded(830, 2_240_000),
      empty(830),
      loaded(700, 1_890_000),
      empty(700),
    ];
    const u = utilisation(legs);
    const worth = worthOfOneReturnLeg(u, 800_000);

    assert.ok(worth !== null);
    // Realised rate is ₦4,130,000 over 1,530 loaded km ≈ ₦2,699/km; 800 km of
    // it is a bit over two million naira.
    assert.ok((worth as number) > fromNaira(2_000_000));
    assert.ok((worth as number) < fromNaira(2_400_000));
  });

  test('refuses on a thin sample rather than guessing', () => {
    // A projection from two legs is a guess with a decimal point on it.
    const u = utilisation([loaded(830, 2_240_000), empty(830)]);
    assert.equal(worthOfOneReturnLeg(u, 800_000), null);
    assert.equal(MINIMUM_LEGS, 4);
  });

  test('refuses when there is no empty running to fill', () => {
    const u = utilisation([
      loaded(400, 900_000),
      loaded(600, 1_400_000),
      loaded(500, 1_200_000),
      loaded(300, 700_000),
    ]);
    assert.equal(worthOfOneReturnLeg(u, 500_000), null);
  });

  test('never claims more than the empty kilometres actually driven', () => {
    // Asked what a 900 km return leg would be worth, against a fleet that only
    // ran 200 km empty in total. The answer is 200 km at the realised rate —
    // you cannot fill running that did not happen.
    const legs = [
      loaded(1000, 2_700_000),
      empty(100),
      loaded(1000, 2_700_000),
      empty(100),
    ];
    const u = utilisation(legs);
    const worth = worthOfOneReturnLeg(u, 900_000);

    assert.ok(worth !== null);
    // ₦5,400,000 over 2,000 loaded km is ₦2,700/km; 200 km of it is ₦540,000.
    assert.equal(worth, fromNaira(540_000));

    // And never more than filling every empty kilometre would earn.
    const ceiling = (u.earned / (u.loadedMetres / 1000)) * (u.emptyMetres / 1000);
    assert.ok((worth as number) <= Math.round(ceiling));
  });
});

describe('the projection is not falsely precise', () => {
  test('it rounds like every other indicative figure', () => {
    // "₦1,688,036" reads as a quote. It is a projection from eight legs and
    // the last three digits are precision it does not have.
    const legs = [
      loaded(830, 2_240_000),
      empty(830),
      loaded(700, 1_890_000),
      empty(520),
      loaded(480, 1_300_000),
      loaded(120, 340_000),
      empty(610),
      loaded(900, 2_430_000),
    ];
    const u = utilisation(legs);
    const average = legs.reduce((t, l) => t + l.metres, 0) / legs.length;
    const worth = worthOfOneReturnLeg(u, average);

    assert.ok(worth !== null);
    assert.equal((worth as number) % 500_000, 0, format(worth as never));
  });
});

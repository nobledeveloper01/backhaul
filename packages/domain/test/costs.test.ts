import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_FUEL_FRACTION,
  FLOOR_MARGIN,
  LITRES_PER_100KM,
  advise,
  margin,
  runningCost,
  walkAwayBelow,
  type CostInput,
} from '../src/costs.ts';
import { fromNaira } from '../src/money.ts';
import { quote } from '../src/pricing.ts';

/** Diesel at ₦1,100 a litre, which is the order of magnitude that matters. */
const DIESEL = fromNaira(1_100);

const LAGOS_KANO = 1_000_000;

const input = (over: Partial<CostInput> = {}): CostInput => ({
  truck: 'trailer_30t',
  ladenM: LAGOS_KANO,
  emptyM: LAGOS_KANO,
  dieselPerLitre: DIESEL,
  levies: fromNaira(45_000),
  other: fromNaira(20_000),
  ...over,
});

describe('runningCost', () => {
  test('a laden Lagos–Kano trailer burns about 450 litres', () => {
    // 45 l/100 km over 1,000 km. Checked against the figure a haulier would
    // recognise rather than against what the formula produces.
    const costs = runningCost(input({ emptyM: 0 }));
    assert.ok(costs.litres > 430 && costs.litres < 470, `${costs.litres} litres`);
  });

  test('the empty leg burns less than the loaded one', () => {
    const laden = runningCost(input({ emptyM: 0 }));
    const empty = runningCost(input({ ladenM: 0, emptyM: LAGOS_KANO }));
    assert.ok(empty.litres < laden.litres);
    assert.equal(EMPTY_FUEL_FRACTION, 0.75);
  });

  test('fuel is the largest single line on a long run', () => {
    const costs = runningCost(input());
    assert.ok(costs.fuel > costs.running);
    assert.ok(costs.fuel > costs.levies);
  });

  test('the total is the parts, with nothing invented', () => {
    const costs = runningCost(input());
    assert.equal(costs.total, costs.fuel + costs.running + costs.levies + costs.other);
  });

  test('a bigger truck burns more than a smaller one', () => {
    assert.ok(LITRES_PER_100KM.trailer_30t > LITRES_PER_100KM.canter);
    assert.ok(LITRES_PER_100KM.lowbed > LITRES_PER_100KM.trailer_30t);
  });

  test('diesel is an argument, because it moves weekly', () => {
    const cheap = runningCost(input({ dieselPerLitre: fromNaira(800) }));
    const dear = runningCost(input({ dieselPerLitre: fromNaira(1_400) }));
    assert.ok(dear.fuel > cheap.fuel);
  });
});

describe('margin', () => {
  test('a real corridor fare leaves a real margin', () => {
    // The sanity check that matters: if the quote engine's own price loses the
    // carrier money on the round trip, one of the two engines is wrong.
    const fare = quote('trailer_30t', LAGOS_KANO);
    const found = margin(fare.mid, input());

    assert.ok(found.profit > 0, `₦${found.profit / 100} on a ₦${fare.mid / 100} fare`);
    assert.ok((found.fraction ?? 0) > 0.15);
  });

  test('a fare below cost is negative rather than floored at zero', () => {
    const found = margin(fromNaira(300_000), input());
    assert.ok(found.profit < 0);
  });

  test('a zero fare has no percentage, rather than dividing by zero', () => {
    assert.equal(margin(0 as never, input()).fraction, null);
  });
});

describe('walkAwayBelow', () => {
  test('is above cost, because a truck that runs at cost cannot be replaced', () => {
    const floor = walkAwayBelow(input());
    assert.ok(floor > runningCost(input()).total);
    assert.equal(FLOOR_MARGIN, 0.15);
  });
});

describe('advise', () => {
  test('refuses a fare that loses money, and says why in litres', () => {
    // A carrier told "no" with no figure takes the load anyway.
    const said = advise(fromNaira(200_000), input());
    assert.equal(said.take, false);
    assert.match(said.detail, /litres of diesel/);
  });

  test('refuses one that covers the trip but puts nothing back', () => {
    const costs = runningCost(input());
    const said = advise((costs.total + fromNaira(5_000)) as never, input());
    assert.equal(said.take, false);
    assert.match(said.detail, /anything back into the truck/);
  });

  test('and takes a fare with a real margin, with the figure attached', () => {
    const said = advise(quote('trailer_30t', LAGOS_KANO).mid, input());
    assert.equal(said.take, true);
    assert.match(said.detail, /% over what the run costs/);
  });
});

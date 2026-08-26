import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ZERO,
  add,
  format,
  formatTight,
  fromNaira,
  kobo,
  percent,
  scale,
  subtract,
} from '../src/money.ts';

describe('kobo', () => {
  test('refuses a fraction rather than silently truncating it', () => {
    assert.throws(() => kobo(12.5), TypeError);
    assert.equal(kobo(1250), 1250);
  });

  test('naira to kobo rounds, because floats do not multiply cleanly', () => {
    // 9.99 * 100 is 998.9999999999999. Truncating loses a kobo on almost
    // every amount with a decimal in it.
    assert.equal(fromNaira(9.99), 999);
    assert.equal(fromNaira(1_250_000), 125_000_000);
    assert.equal(fromNaira(0), 0);
  });

  test('adds and subtracts exactly, at scale', () => {
    const big = fromNaira(1_450_000);
    assert.equal(add(big, big, big), fromNaira(4_350_000));
    assert.equal(subtract(big, fromNaira(50_000)), fromNaira(1_400_000));
    assert.equal(add(), ZERO);
  });

  test('a percentage rounds the same size either side of zero', () => {
    // Math.round(-0.5) is -0, which makes a commission on a refund differ by
    // a kobo from the commission on the charge — always in the same party's
    // favour.
    const amount = kobo(12_345);
    const charge = percent(amount, 8);
    const refund = percent(kobo(-12_345), 8);
    assert.equal(charge + refund, 0);
  });

  test('scaling rounds to whole kobo', () => {
    assert.equal(scale(kobo(333), 1 / 3), 111);
    assert.equal(Number.isInteger(scale(kobo(1000), 0.185)), true);
  });
});

describe('display', () => {
  test('is whole naira with separators', () => {
    assert.equal(format(fromNaira(1_250_000)), '₦1,250,000');
    assert.equal(format(fromNaira(0)), '₦0');
  });

  test('never shows kobo, because no haulage invoice is settled to one', () => {
    assert.equal(format(kobo(125_000_049)), '₦1,250,000');
    assert.match(format(kobo(99)), /^₦[01]$/);
  });

  test('the tight form has nothing a line can break at', () => {
    // A narrow no-break space is still Unicode whitespace, and a PDF renderer
    // will break there, orphaning the sign at the end of a line.
    const tight = formatTight(fromNaira(1_250_000));
    assert.equal(/\s/.test(tight), false);
    assert.match(tight, /^₦/);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { format, fromNaira, kobo, subtract, ZERO } from '../src/money.ts';
import {
  COMMISSION_PCT,
  FREE_WAITING_MS,
  MINIMUM_FARE,
  demurrage,
  fits,
  quote,
  settle,
  smallestClassFor,
  type TruckClass,
} from '../src/pricing.ts';

const LAGOS_KANO_M = 830_000;
const LAGOS_IBADAN_M = 120_000;
const CLASSES: readonly TruckClass[] = [
  'pickup',
  'canter',
  'truck_15t',
  'trailer_30t',
  'lowbed',
];

describe('the indicative quote', () => {
  test('a Lagos–Kano trailer lands in a range a haulier would recognise', () => {
    // The check that caught the first model: tonne-kilometre pricing quoted
    // ₦398,400 for this run, and nothing in the code looked wrong.
    const q = quote('trailer_30t', LAGOS_KANO_M);
    const naira = q.mid / 100;
    assert.ok(
      naira > 1_800_000 && naira < 3_000_000,
      `got ${format(q.mid)} for a 830 km trailer run`,
    );
  });

  test('a Lagos–Ibadan canter does too', () => {
    const naira = quote('canter', LAGOS_IBADAN_M).mid / 100;
    assert.ok(naira > 120_000 && naira < 250_000, `got ${format(kobo(naira * 100))}`);
  });

  test('is always a range, never a single number', () => {
    // A single number reads as a price, and diesel moves this every few weeks.
    const q = quote('truck_15t', LAGOS_KANO_M);
    assert.ok(q.low < q.mid && q.mid < q.high);
  });

  test('says it is indicative, on every class and distance', () => {
    for (const truck of CLASSES) {
      for (const metres of [0, 5_000, LAGOS_IBADAN_M, LAGOS_KANO_M]) {
        const q = quote(truck, metres);
        assert.equal(q.isIndicative, true);
        assert.ok(q.basis.length > 0);
      }
    }
  });

  test('weight is not a price input at all', () => {
    // A half-empty trailer costs a full trailer to move. Billing on the pallet
    // produces estimates no carrier will honour.
    assert.equal(quote.length, 2);
  });

  test('a short hop falls to the minimum fare and says so', () => {
    const q = quote('canter', 8_000);
    assert.equal(q.atMinimum, true);
    assert.equal(q.mid, MINIMUM_FARE.canter);
    assert.match(q.basis, /Minimum fare/);
  });

  test('a long haul is priced by distance, not the floor', () => {
    assert.equal(quote('trailer_30t', LAGOS_KANO_M).atMinimum, false);
  });

  test('zero and negative distance do not produce a negative price', () => {
    for (const metres of [0, -1, -500_000]) {
      const q = quote('canter', metres);
      assert.ok(q.low >= 0, `got ${q.low} at ${metres} m`);
      assert.equal(q.atMinimum, true);
    }
  });

  test('a bigger truck over the same road costs more per trip', () => {
    let previous = 0;
    for (const truck of CLASSES) {
      const mid = quote(truck, LAGOS_KANO_M).mid;
      assert.ok(mid > previous, `${truck} does not cost more than the class below`);
      previous = mid;
    }
  });
});

describe('picking a truck', () => {
  test('the smallest that carries the load', () => {
    // Smallest, not cheapest per tonne: an over-large truck costs more per
    // trip and is harder to find.
    assert.equal(smallestClassFor(0.5), 'pickup');
    assert.equal(smallestClassFor(4), 'canter');
    assert.equal(smallestClassFor(5), 'canter');
    assert.equal(smallestClassFor(5.1), 'truck_15t');
    assert.equal(smallestClassFor(30), 'trailer_30t');
  });

  test('a load nothing can carry is null, not the biggest truck', () => {
    // Returning the lowbed would put a shipper on a truck that cannot take
    // their load, and they would find out at the depot.
    assert.equal(smallestClassFor(80), null);
  });

  test('capacity is the boundary, inclusive', () => {
    assert.equal(fits('canter', 5), true);
    assert.equal(fits('canter', 5.01), false);
  });
});

describe('demurrage', () => {
  test('the first four hours are free', () => {
    const d = demurrage('trailer_30t', FREE_WAITING_MS);
    assert.equal(d.amount, ZERO);
    assert.equal(d.chargeableHours, 0);
    assert.match(d.basis, /free/);
  });

  test('a fifty-minute overrun is not free', () => {
    // The truck is unavailable for the whole hour it is sitting in.
    const d = demurrage('trailer_30t', FREE_WAITING_MS + 50 * 60_000);
    assert.equal(d.chargeableHours, 1);
    assert.ok(d.amount > 0);
  });

  test('part hours round up, and whole ones do not gain an extra', () => {
    assert.equal(demurrage('canter', FREE_WAITING_MS + 3_600_000).chargeableHours, 1);
    assert.equal(
      demurrage('canter', FREE_WAITING_MS + 3_600_001).chargeableHours,
      2,
    );
  });

  test('a truck that was never late owes nothing, not a negative', () => {
    assert.equal(demurrage('lowbed', 0).amount, ZERO);
    assert.equal(demurrage('lowbed', -50_000).amount, ZERO);
  });

  test('a bigger truck waiting costs more', () => {
    const wait = FREE_WAITING_MS + 6 * 3_600_000;
    assert.ok(demurrage('trailer_30t', wait).amount > demurrage('canter', wait).amount);
  });
});

describe('settlement', () => {
  const agreed = fromNaira(4_000_000);

  test('every line adds up to every other line', () => {
    // Grid found the opposite of this on a rendered page rather than in a
    // test: shares allocated to the kobo are correct and visibly do not add up.
    const s = settle(agreed, fromNaira(150_000), fromNaira(1_000_000));
    assert.equal(s.gross, fromNaira(4_150_000));
    assert.equal(
      s.toCarrier,
      subtract(subtract(s.gross, s.commission), s.advance),
    );
  });

  test('every displayed line is a whole number of naira', () => {
    // ₦3,999,999 + commission that ends in 37 kobo renders as two figures
    // that do not reconcile on screen.
    const s = settle(fromNaira(3_999_999), fromNaira(123_457), fromNaira(1));
    for (const line of [s.commission]) {
      assert.equal(line % 100, 0, `${format(line)} is not whole naira`);
    }
  });

  test('commission is taken on the fare, never on demurrage', () => {
    // Otherwise the platform earns more the worse the trip goes.
    const without = settle(agreed, ZERO, ZERO);
    const with_ = settle(agreed, fromNaira(2_000_000), ZERO);
    assert.equal(without.commission, with_.commission);
  });

  test('commission is the rate it says it is', () => {
    const s = settle(fromNaira(1_000_000), ZERO, ZERO);
    assert.equal(s.commission, fromNaira((1_000_000 * COMMISSION_PCT) / 100));
  });

  test('an advance already paid comes off the balance', () => {
    const s = settle(agreed, ZERO, fromNaira(1_500_000));
    assert.equal(s.toCarrier, subtract(subtract(agreed, s.commission), fromNaira(1_500_000)));
  });

  test('an advance larger than the fare produces a visible negative, not zero', () => {
    // A driver who has been overpaid owes the difference, and hiding that
    // behind a floor of zero is how it never gets recovered.
    const s = settle(fromNaira(500_000), ZERO, fromNaira(900_000));
    assert.ok(s.toCarrier < 0);
  });

  test('a zero-value trip settles to zero without throwing', () => {
    const s = settle(ZERO, ZERO, ZERO);
    assert.equal(s.gross, ZERO);
    assert.equal(s.commission, ZERO);
    assert.equal(s.toCarrier, ZERO);
  });
});

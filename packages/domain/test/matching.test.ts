import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DEADHEAD_M,
  MINIMUM_TRIPS_FOR_RELIABILITY,
  rankBids,
  rankLoads,
  type Bid,
  type Carrier,
  type Load,
} from '../src/matching.ts';
import { fromNaira } from '../src/money.ts';
import type { Position } from '../src/geo.ts';

const NOW = new Date('2026-03-04T06:00:00Z');
const inHours = (h: number): Date => new Date(NOW.getTime() + h * 3_600_000);

const place = (lat: number, lon: number): Position => ({
  lat,
  lon,
  accuracy: 10,
  at: NOW,
});

const LAGOS = place(6.4550, 3.3841);
const ABUJA = place(9.0765, 7.3986);
const KANO = place(12.0022, 8.5920);
const PH = place(4.8156, 7.0498);

const load = (over: Partial<Load> & { id: string }): Load => ({
  origin: KANO,
  destination: LAGOS,
  weight: 28,
  requires: 'trailer_30t',
  readyBy: inHours(12),
  expiresAt: inHours(48),
  ...over,
});

/** A trailer that has just dropped in Kano and lives in Lagos. */
const carrier: Carrier = {
  at: KANO,
  freeFrom: NOW,
  truck: 'trailer_30t',
  base: LAGOS,
};

describe('ranking loads for a carrier', () => {
  test('the load going home beats the better-paid one going away', () => {
    // The asymmetry the product is named after. An empty truck running 900 km
    // home earns nothing and burns diesel the whole way.
    const ranked = rankLoads(
      carrier,
      [
        load({ id: 'further', destination: place(11.8311, 13.1510), offered: fromNaira(2_500_000) }),
        load({ id: 'homeward', destination: LAGOS, offered: fromNaira(1_800_000) }),
      ],
      NOW,
    );
    assert.equal(ranked[0]?.load.id, 'homeward');
  });

  test('a load at the door beats an identical one 300 km away', () => {
    const ranked = rankLoads(
      carrier,
      [
        load({ id: 'far', origin: ABUJA }),
        load({ id: 'near', origin: KANO }),
      ],
      NOW,
    );
    assert.equal(ranked[0]?.load.id, 'near');
    assert.ok((ranked[1]?.deadhead ?? 0) > 300_000);
  });

  test('a load that cannot be taken sorts last, however attractive', () => {
    // Shown greyed with a reason, never hidden: a carrier who cannot see why
    // the 30-tonne load is missing assumes the app is broken.
    const ranked = rankLoads(
      carrier,
      [
        load({ id: 'perfect-but-heavy', weight: 38, requires: 'lowbed', offered: fromNaira(9_000_000) }),
        load({ id: 'ordinary', offered: fromNaira(1_500_000) }),
      ],
      NOW,
    );
    assert.equal(ranked[0]?.load.id, 'ordinary');
    // Named for the first thing that makes it impossible: at 38 t it is over
    // the trailer's capacity, which is more use to a driver than being told
    // the shipper wanted a different class.
    assert.equal(ranked[1]?.blocked, 'too_heavy');
    assert.ok((ranked[1]?.because.length ?? 0) > 10);
  });

  test('nothing is dropped from the list', () => {
    // A ranking that silently filters is one the user cannot argue with, and
    // the first thing a haulier does is argue with it.
    const loads = [
      load({ id: 'a' }),
      load({ id: 'b', weight: 90, requires: 'lowbed' }),
      load({ id: 'c', expiresAt: inHours(-1) }),
      load({ id: 'd', origin: place(-1.29, 36.82) }), // Nairobi
    ];
    const ranked = rankLoads(carrier, loads, NOW);
    assert.equal(ranked.length, 4);
    assert.deepEqual(
      new Set(ranked.map((r) => r.load.id)),
      new Set(['a', 'b', 'c', 'd']),
    );
  });

  test('each blocker is named for what it is', () => {
    const ranked = rankLoads(
      carrier,
      [
        load({ id: 'heavy', weight: 45 }),
        load({ id: 'class', requires: 'canter', weight: 4 }),
        load({ id: 'gone', expiresAt: inHours(-1) }),
        load({ id: 'unreachable', origin: place(-1.29, 36.82) }),
      ],
      NOW,
    );
    const byId = new Map(ranked.map((r) => [r.load.id, r.blocked]));
    assert.equal(byId.get('heavy'), 'too_heavy');
    assert.equal(byId.get('class'), 'wrong_class');
    assert.equal(byId.get('gone'), 'expired');
    assert.equal(byId.get('unreachable'), 'cannot_reach');
  });

  test('a load ready now outranks the same load ready next week', () => {
    const ranked = rankLoads(
      carrier,
      [
        load({ id: 'later', readyBy: inHours(96) }),
        load({ id: 'now', readyBy: inHours(1) }),
      ],
      NOW,
    );
    assert.equal(ranked[0]?.load.id, 'now');
  });

  test('a carrier with no base is not punished on every load', () => {
    // Someone who has not told us where home is should not have everything
    // marked down.
    const nomad: Carrier = { at: KANO, freeFrom: NOW, truck: 'trailer_30t' };
    const ranked = rankLoads(
      nomad,
      [load({ id: 'south', destination: LAGOS }), load({ id: 'north', destination: place(13.0, 5.2) })],
      NOW,
    );
    for (const r of ranked) {
      assert.equal(r.progressHome, 0);
      assert.ok(r.score > 0, `${r.load.id} scored ${r.score}`);
    }
  });

  test('progress home is signed, and the reason says which way', () => {
    const ranked = rankLoads(
      carrier,
      [load({ id: 'home', destination: LAGOS }), load({ id: 'away', destination: place(11.8311, 13.1510) })],
      NOW,
    );
    const home = ranked.find((r) => r.load.id === 'home');
    const away = ranked.find((r) => r.load.id === 'away');
    assert.ok((home?.progressHome ?? 0) > 0);
    assert.ok((away?.progressHome ?? 0) < 0);
    assert.match(home?.because ?? '', /run home/);
    assert.match(away?.because ?? '', /further from base/);
  });

  test('a shipper offering above the going rate is noticed', () => {
    const ranked = rankLoads(
      carrier,
      [
        load({ id: 'generous', offered: fromNaira(4_000_000) }),
        load({ id: 'mean', offered: fromNaira(600_000) }),
      ],
      NOW,
    );
    assert.equal(ranked[0]?.load.id, 'generous');
  });

  test('an empty list ranks to an empty list', () => {
    assert.deepEqual(rankLoads(carrier, [], NOW), []);
  });

  test('a load at the truck’s exact position does not divide by zero', () => {
    const here = load({ id: 'here', origin: KANO, destination: KANO });
    const [scored] = rankLoads(carrier, [here], NOW);
    assert.ok(Number.isFinite(scored?.score ?? NaN));
    assert.equal(scored?.deadhead, 0);
  });

  test('the deadhead ceiling is where it says it is', () => {
    const withinRange = load({ id: 'in', origin: PH });
    assert.ok(rankLoads(carrier, [withinRange], NOW)[0]?.deadhead ?? 0);
    assert.equal(MAX_DEADHEAD_M, 400_000);
  });
});

describe('ranking bids for a shipper', () => {
  const bid = (over: Partial<Bid> & { id: string }): Bid => ({
    carrierId: over.id,
    amount: fromNaira(2_000_000),
    tripsCompleted: 40,
    // Promised follows completed unless a case says otherwise: these bidders
    // have a punctuality record, which is what the reliability term is for.
    tripsPromised: over.tripsCompleted ?? 40,
    tripsOnTime: 38,
    at: KANO,
    placedAt: NOW,
    ...over,
  });

  test('the cheapest bid is not automatically the best', () => {
    // A carrier with forty on-time trips asking 10% more is the better
    // answer, and this is where the product earns trust or loses it.
    const ranked = rankBids(
      [
        bid({ id: 'cheap-and-unproven', amount: fromNaira(1_800_000), tripsCompleted: 6, tripsOnTime: 2 }),
        bid({ id: 'dearer-and-solid', amount: fromNaira(2_000_000), tripsCompleted: 40, tripsOnTime: 39 }),
      ],
      KANO,
    );
    assert.equal(ranked[0]?.bid.id, 'dearer-and-solid');
  });

  test('a new carrier is unknown, not bad', () => {
    // A marketplace that never surfaces a new carrier never gets a second one.
    const ranked = rankBids(
      [
        bid({ id: 'new', tripsCompleted: 0, tripsOnTime: 0, amount: fromNaira(1_700_000) }),
        bid({ id: 'poor', tripsCompleted: 30, tripsOnTime: 9, amount: fromNaira(1_700_000) }),
      ],
      KANO,
    );
    assert.equal(ranked[0]?.bid.id, 'new');
    assert.equal(ranked[0]?.reliability, null);
    assert.match(ranked[0]?.because ?? '', /New to Backhaul/);
  });

  test('reliability needs a record before it is claimed', () => {
    const thin = rankBids([bid({ id: 'thin', tripsCompleted: MINIMUM_TRIPS_FOR_RELIABILITY - 1, tripsOnTime: 1 })], KANO);
    const enough = rankBids([bid({ id: 'enough', tripsCompleted: MINIMUM_TRIPS_FOR_RELIABILITY, tripsOnTime: 5 })], KANO);
    assert.equal(thin[0]?.reliability, null);
    assert.equal(enough[0]?.reliability, 1);
  });

  test('and the record is the promised trips, not every delivery', () => {
    /*
      The defect this closes. The server sent `onTime = completed` for every
      carrier, because the promised arrival lives with the commercial terms and
      not every trip has them — so this term was 1.0 for everybody and stopped
      being a term at all.

      Forty deliveries with no deadline among them is no evidence about
      punctuality. Null, and not a perfect score.
    */
    const untraded = rankBids(
      [bid({ id: 'untraded', tripsCompleted: 40, tripsPromised: 0, tripsOnTime: 0 })],
      KANO,
    );
    assert.equal(untraded[0]?.reliability, null);

    // And null is not zero either. A carrier nobody has held to a deadline
    // must not be scored the least reliable bidder on the board — they fall
    // through to the neutral prior, which is what `null` is for.
    const [best] = rankBids(
      [
        bid({ id: 'untraded', tripsCompleted: 40, tripsPromised: 0, tripsOnTime: 0 }),
        bid({ id: 'late', tripsCompleted: 40, tripsPromised: 40, tripsOnTime: 4 }),
      ],
      KANO,
    );
    assert.equal(best?.bid.id, 'untraded');

    // Ten promised and nine kept is a record, and it is read as one.
    const traded = rankBids(
      [bid({ id: 'traded', tripsCompleted: 40, tripsPromised: 10, tripsOnTime: 9 })],
      KANO,
    );
    assert.equal(traded[0]?.reliability, 0.9);

    // And the sentence tells a shipper which of the two it is. "New to
    // Backhaul — 12 completed trips" is a sentence they can see is wrong.
    assert.match(untraded[0]?.because ?? '', /none with an agreed delivery date/);
    assert.doesNotMatch(untraded[0]?.because ?? '', /New to Backhaul/);

    // The figure counts over what it was judged on, not over every delivery.
    assert.match(traded[0]?.because ?? '', /90% on time across 10 trips/);
  });

  test('price is judged against the other bids, not an absolute scale', () => {
    // ₦50,000 apart is a lot on a city run and nothing on a Kano haul.
    const tight = rankBids(
      [bid({ id: 'a', amount: fromNaira(2_000_000) }), bid({ id: 'b', amount: fromNaira(2_050_000) })],
      KANO,
    );
    assert.equal(tight[0]?.bid.id, 'a');
    assert.ok((tight[0]?.score ?? 0) - (tight[1]?.score ?? 0) < 0.45);
  });

  test('identical bids do not produce NaN when the spread is zero', () => {
    const same = rankBids([bid({ id: 'a' }), bid({ id: 'b' })], KANO);
    for (const r of same) assert.ok(Number.isFinite(r.score));
    assert.equal(same[0]?.score, same[1]?.score);
  });

  test('a truck already at the pickup beats one across the country', () => {
    const ranked = rankBids(
      [bid({ id: 'far', at: LAGOS }), bid({ id: 'here', at: KANO })],
      KANO,
    );
    assert.equal(ranked[0]?.bid.id, 'here');
    assert.equal(ranked[0]?.kmToPickup, 0);
    assert.ok((ranked[1]?.kmToPickup ?? 0) > 700);
  });

  test('every bid carries its record in words, for the shipper to overrule', () => {
    const ranked = rankBids([bid({ id: 'a' }), bid({ id: 'b', tripsCompleted: 1, tripsOnTime: 1 })], KANO);
    for (const r of ranked) assert.ok(r.because.length > 10, r.because);
    assert.match(ranked.find((r) => r.bid.id === 'b')?.because ?? '', /1 completed trip\b/);
  });

  test('no bids is an empty list, not a throw', () => {
    assert.deepEqual(rankBids([], KANO), []);
  });

  test('a perfect record does not score above 1', () => {
    const ranked = rankBids([bid({ id: 'perfect', tripsCompleted: 200, tripsOnTime: 200, at: KANO })], KANO);
    assert.ok((ranked[0]?.score ?? 0) <= 1);
  });
});

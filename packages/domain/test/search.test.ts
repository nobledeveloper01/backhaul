import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_LOAD_FILTER,
  NO_TRIP_FILTER,
  describeTripFilter,
  filterLoads,
  filterTrips,
  isFiltering,
  whyNothing,
  type LoadSummary,
  type TripSummary,
} from '../src/search.ts';
import { fromNaira } from '../src/money.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

const trip = (over: Partial<TripSummary> = {}): TripSummary => ({
  id: 't1',
  reference: 'BH-0417',
  state: 'in_transit',
  origin: 'Lagos',
  destination: 'Kano',
  cargo: 'Rice',
  truckPlate: 'T-12345 LA',
  driverName: 'Musa Danjuma',
  startedAt: T0,
  hasOpenIncident: false,
  isLate: false,
  ...over,
});

const load = (over: Partial<LoadSummary> = {}): LoadSummary => ({
  id: 'l1',
  origin: 'Kano',
  destination: 'Lagos',
  cargo: 'Onions',
  weightKg: 28_000,
  offered: fromNaira(1_800_000),
  readyFrom: T0,
  truckClass: 'trailer_30t',
  shipperTier: 'business',
  ...over,
});

describe('filterTrips', () => {
  const trips = [
    trip(),
    trip({ id: 't2', reference: 'BH-0418', destination: 'Onitsha', isLate: true }),
    trip({ id: 't3', state: 'delivered', hasOpenIncident: true, startedAt: days(-9) }),
  ];

  test('an empty filter keeps everything', () => {
    assert.equal(filterTrips(trips, NO_TRIP_FILTER).length, 3);
  });

  test('finds a plate however it was written down', () => {
    // Three people write the same truck three ways, and a search that finds
    // none of them is a search nobody uses twice.
    for (const typed of ['T-12345', 't 12345', 'T12345', 'la']) {
      const found = filterTrips(trips, { ...NO_TRIP_FILTER, text: typed });
      assert.ok(found.length > 0, `nothing matched "${typed}"`);
    }
  });

  test('searches the corridor, the cargo and the driver too', () => {
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, text: 'onitsha' }).length, 1);
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, text: 'rice' }).length, 3);
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, text: 'musa' }).length, 3);
  });

  test('filters by state, lateness and incidents', () => {
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, states: ['delivered'] }).length, 1);
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, onlyLate: true }).length, 1);
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, onlyWithIncidents: true }).length, 1);
  });

  test('filters by when the trip started', () => {
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, since: days(-1) }).length, 2);
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, until: days(-1) }).length, 1);
  });

  test('conditions combine rather than replace one another', () => {
    const found = filterTrips(trips, {
      ...NO_TRIP_FILTER,
      text: 'kano',
      states: ['in_transit'],
    });
    assert.deepEqual(found.map((t) => t.id), ['t1']);
  });

  test('whitespace is not a search', () => {
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, text: '   ' }).length, 3);
  });
});

describe('isFiltering', () => {
  test('nothing set is not filtering', () => {
    // A chip row that is always visible teaches people to ignore it, and then
    // somebody spends ten minutes convinced their trips have vanished.
    assert.equal(isFiltering(NO_TRIP_FILTER), false);
    assert.equal(isFiltering({ ...NO_TRIP_FILTER, text: '  ' }), false);
  });

  test('any condition counts', () => {
    assert.equal(isFiltering({ ...NO_TRIP_FILTER, onlyLate: true }), true);
    assert.equal(isFiltering({ ...NO_TRIP_FILTER, states: ['open'] }), true);
    assert.equal(isFiltering({ ...NO_TRIP_FILTER, since: T0 }), true);
  });
});

describe('describeTripFilter', () => {
  test('says which filter is on, not merely that one is', () => {
    // The difference matters when the answer on screen is "no trips".
    assert.equal(describeTripFilter(NO_TRIP_FILTER), 'All trips');
    assert.match(
      describeTripFilter({ ...NO_TRIP_FILTER, onlyLate: true }),
      /running late/,
    );
    assert.match(describeTripFilter({ ...NO_TRIP_FILTER, text: 'kano' }), /"kano"/);
  });

  test('never shows an underscore from a state name to a reader', () => {
    const said = describeTripFilter({ ...NO_TRIP_FILTER, states: ['signal_lost'] });
    assert.doesNotMatch(said, /_/);
  });
});

describe('filterLoads', () => {
  const loads = [
    load(),
    load({ id: 'l2', truckClass: 'canter', offered: fromNaira(400_000), cargo: 'Cement' }),
    load({ id: 'l3', readyFrom: days(5), shipperTier: 'trusted' }),
  ];

  test('filters by truck class, price, readiness and tier', () => {
    assert.equal(filterLoads(loads, { ...NO_LOAD_FILTER, truckClasses: ['canter'] }).length, 1);
    assert.equal(
      filterLoads(loads, { ...NO_LOAD_FILTER, minimumOffer: fromNaira(1_000_000) }).length,
      2,
    );
    assert.equal(filterLoads(loads, { ...NO_LOAD_FILTER, readyBefore: days(1) }).length, 2);
    assert.equal(filterLoads(loads, { ...NO_LOAD_FILTER, tiers: ['trusted'] }).length, 1);
  });

  test('and a shipper with no established standing matches no tier filter', () => {
    // This product has no shipper ladder — `trust.ts` is carrier-shaped — so
    // the standing is null until somebody writes one. A carrier who asked for
    // Trusted shippers and got everybody has been told something false about
    // all of them, so null is excluded rather than admitted.
    const unknown = [load({ id: 'u1', shipperTier: null })];
    assert.equal(filterLoads(unknown, { ...NO_LOAD_FILTER, tiers: ['trusted'] }).length, 0);
    // And is on the board like anything else when nobody asked about tiers.
    assert.equal(filterLoads(unknown, NO_LOAD_FILTER).length, 1);
  });

  test('searches the corridor and the cargo', () => {
    assert.equal(filterLoads(loads, { ...NO_LOAD_FILTER, text: 'cement' }).length, 1);
    assert.equal(filterLoads(loads, { ...NO_LOAD_FILTER, text: 'kano' }).length, 3);
  });
});

describe('whyNothing', () => {
  test('names the narrowest condition, so there is something to relax', () => {
    // An empty state that does not say what to change is a dead end.
    assert.match(
      whyNothing({ ...NO_LOAD_FILTER, minimumOffer: fromNaira(9_000_000) }),
      /lower figure/,
    );
    assert.match(whyNothing({ ...NO_LOAD_FILTER, truckClasses: ['lowbed'] }), /another class/);
    assert.match(whyNothing({ ...NO_LOAD_FILTER, readyBefore: T0 }), /later date/);
  });

  test('an unfiltered empty board says so plainly', () => {
    assert.equal(whyNothing(NO_LOAD_FILTER), 'No loads on the board right now.');
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { NO_TRIP_FILTER, filterTrips, normalisePhone } from '@backhaul/domain';

/**
 * What the console does that is not arrangement.
 *
 * Almost everything in `main.ts` is DOM assembly, and testing that is testing
 * that `createElement` works. The two things worth pinning are the two places
 * a rule crosses into this face — and the point of both is that the rule is
 * *not implemented here*. If either of these ever needs a second assertion
 * about behaviour rather than about wiring, something has been reimplemented.
 */
describe('the shipper console', () => {
  test('flattens a number the same way the phone and the server do', () => {
    // Four spellings of one shipper's number. A console that normalised
    // differently would sign somebody into a second account with the same SIM.
    for (const written of ['08031234567', '0803 123 4567', '+2348031234567', '234 803 123 4567']) {
      assert.equal(normalisePhone(written), '+2348031234567');
    }

    assert.equal(normalisePhone('not a number'), null);
  });

  test('searches with the engine, not with `includes`', () => {
    // Three people write Port Harcourt three ways, and the domain's matcher
    // flattens case, accents and punctuation. `includes` finds none of these.
    const trips = [
      summary('t1', 'Port Harcourt', 'Abuja'),
      summary('t2', 'Lagos', 'Kano'),
    ];

    for (const typed of ['port-harcourt', 'PORT HARCOURT', 'portharcourt']) {
      const found = filterTrips(trips, { ...NO_TRIP_FILTER, text: typed });
      assert.deepEqual(
        found.map((trip) => trip.id),
        ['t1'],
        `"${typed}" should have found Port Harcourt`,
      );
    }
  });

  test('and an empty search is not a filter', () => {
    // The list shows everything until somebody types. A face that treated ''
    // as "match nothing" would open on an empty screen.
    const trips = [summary('t1', 'Port Harcourt', 'Abuja'), summary('t2', 'Lagos', 'Kano')];
    assert.equal(filterTrips(trips, { ...NO_TRIP_FILTER, text: '' }).length, 2);
  });
});

function summary(id: string, origin: string, destination: string) {
  return {
    id,
    reference: `BH-${id.toUpperCase()}`,
    state: 'open' as const,
    origin,
    destination,
    cargo: '',
    truckPlate: '',
    driverName: '',
    startedAt: new Date('2026-03-04T06:00:00Z'),
    hasOpenIncident: false,
    isLate: false,
  };
}

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAPERS,
  assess,
  byUrgency,
  describePaper,
  describeStanding,
  mayCarry,
  mustStopMidTrip,
  type Vehicle,
} from '../src/vehicles.ts';
import { EXPIRY_WARNING_DAYS } from '../src/trust.ts';

const NOW = new Date('2026-03-04T06:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1',
  plate: 'LSR-482-XA',
  truck: 'trailer_30t',
  carrierId: 'c1',
  papers: {
    licence: days(200),
    roadworthiness: days(150),
    insurance: days(90),
    permit: days(300),
  },
  retiredAt: null,
  ...over,
});

describe('assess', () => {
  test('everything in date is road legal', () => {
    assert.equal(assess(vehicle(), NOW).standing, 'road_legal');
  });

  test('a paper inside the warning window is expiring, not lapsed', () => {
    const soon = vehicle({ papers: { ...vehicle().papers, insurance: days(10) } });
    const found = assess(soon, NOW);
    assert.equal(found.standing, 'expiring');
    assert.deepEqual(found.expiring, [{ paper: 'insurance', days: 10 }]);
  });

  test('a paper that has run out is lapsed, with how long ago', () => {
    const stale = vehicle({ papers: { ...vehicle().papers, roadworthiness: days(-12) } });
    const found = assess(stale, NOW);
    assert.equal(found.standing, 'lapsed');
    assert.deepEqual(found.lapsed, [{ paper: 'roadworthiness', days: -12 }]);
  });

  test('a paper never provided is missing, not expired', () => {
    // A missing paper means the truck was never offered for work; a lapsed one
    // means it is working on something that stopped being true.
    const partial = vehicle({ papers: { licence: days(200) } });
    const found = assess(partial, NOW);
    assert.equal(found.standing, 'incomplete');
    assert.deepEqual([...found.missing].sort(), ['insurance', 'permit', 'roadworthiness']);
  });

  test('lapsed outranks missing, and both outrank expiring', () => {
    const bad = vehicle({
      papers: { licence: days(-1), roadworthiness: days(5) },
    });
    assert.equal(assess(bad, NOW).standing, 'lapsed');
  });

  test('the soonest problem comes first', () => {
    const several = vehicle({
      papers: {
        licence: days(-30),
        roadworthiness: days(-2),
        insurance: days(90),
        permit: days(300),
      },
    });
    assert.deepEqual(
      assess(several, NOW).lapsed.map((entry) => entry.paper),
      ['licence', 'roadworthiness'],
    );
  });

  test('a retired truck is retired and nothing else', () => {
    const gone = vehicle({ papers: {}, retiredAt: days(-1) });
    const found = assess(gone, NOW);
    assert.equal(found.standing, 'retired');
    assert.equal(found.missing.length, 0);
  });

  test('the warning window is the same one a carrier gets for their own papers', () => {
    const edge = vehicle({
      papers: { ...vehicle().papers, permit: days(EXPIRY_WARNING_DAYS) },
    });
    assert.equal(assess(edge, NOW).standing, 'expiring');
  });
});

describe('mayCarry', () => {
  test('a truck with weeks left on a certificate still works', () => {
    // Refusing work on a valid certificate takes a truck off the road for
    // being *about* to have a problem.
    const soon = vehicle({ papers: { ...vehicle().papers, insurance: days(20) } });
    assert.equal(mayCarry(assess(soon, NOW)), true);
  });

  test('a lapsed or incomplete truck does not', () => {
    assert.equal(mayCarry(assess(vehicle({ papers: { licence: days(-1) } }), NOW)), false);
    assert.equal(mayCarry(assess(vehicle({ papers: {} }), NOW)), false);
  });
});

describe('mustStopMidTrip', () => {
  test('a paper lapsing on the road never strands a driver', () => {
    // It does not make the cargo safer by the side of the road, and the
    // pressure belongs on the office rather than on somebody 800 km from home.
    assert.equal(mustStopMidTrip(), false);
  });
});

describe('byUrgency', () => {
  test('the worst truck is at the top, not the first plate alphabetically', () => {
    const fleet = [
      vehicle({ id: 'fine', plate: 'AAA-111-AA' }),
      vehicle({ id: 'lapsed', plate: 'ZZZ-999-ZZ', papers: { licence: days(-5) } }),
      vehicle({ id: 'soon', plate: 'MMM-555-MM', papers: { ...vehicle().papers, permit: days(3) } }),
    ];

    assert.deepEqual(
      byUrgency(fleet, NOW).map((entry) => entry.vehicle.id),
      ['lapsed', 'soon', 'fine'],
    );
  });

  test('retired trucks sink to the bottom', () => {
    const fleet = [vehicle({ id: 'gone', retiredAt: days(-1) }), vehicle({ id: 'live' })];
    assert.equal(byUrgency(fleet, NOW).at(-1)?.vehicle.id, 'gone');
  });
});

describe('wording', () => {
  test('every paper and every standing has plain words', () => {
    for (const paper of PAPERS) assert.ok(describePaper(paper).length > 0);
    for (const standing of ['road_legal', 'expiring', 'lapsed', 'incomplete', 'retired'] as const) {
      assert.doesNotMatch(describeStanding(standing), /_/);
    }
  });
});

describe('counting days', () => {
  test('a paper that lapsed nine days and a second ago is nine days out, not ten', () => {
    // Flooring a negative moves it away from zero, so the screen said "10 days
    // out of date" about a certificate that expired nine days ago. It is a
    // whole day in a sentence somebody may act on.
    const justOver = new Date(NOW.getTime() - 9 * 86_400_000 - 1_000);
    const stale = vehicle({ papers: { ...vehicle().papers, roadworthiness: justOver } });

    assert.deepEqual(assess(stale, NOW).lapsed, [{ paper: 'roadworthiness', days: -9 }]);
  });

  test('and one with eighteen and a half days left has eighteen', () => {
    // The conservative way round for a future date: never promise a day that
    // is only half there.
    const soon = new Date(NOW.getTime() + 18.5 * 86_400_000);
    const expiring = vehicle({ papers: { ...vehicle().papers, insurance: soon } });

    assert.deepEqual(assess(expiring, NOW).expiring, [{ paper: 'insurance', days: 18 }]);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SEVERITY,
  describeKind,
  headline,
  needsPhoto,
  open,
  raisesDispute,
  suppressesEta,
  type Incident,
  type IncidentKind,
} from '../src/incidents.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const KINDS: readonly IncidentKind[] = [
  'breakdown',
  'security',
  'accident',
  'detained',
  'road',
  'cargo',
];

const incident = (over: Partial<Incident> = {}): Incident => ({
  id: 'i1',
  tripId: 'trip-1',
  kind: 'breakdown',
  severity: 'blocking',
  at: T0,
  near: null,
  note: '',
  reportedBy: 'driver',
  photoIds: [],
  resolvedAt: null,
  ...over,
});

describe('DEFAULT_SEVERITY', () => {
  test('every kind has a default, so nobody classifies their own emergency', () => {
    for (const kind of KINDS) assert.ok(DEFAULT_SEVERITY[kind]);
  });

  test('the three that stop a truck are blocking', () => {
    assert.equal(DEFAULT_SEVERITY.breakdown, 'blocking');
    assert.equal(DEFAULT_SEVERITY.security, 'blocking');
    assert.equal(DEFAULT_SEVERITY.accident, 'blocking');
  });
});

describe('raisesDispute', () => {
  test('cargo and security do', () => {
    assert.equal(raisesDispute('cargo'), true);
    assert.equal(raisesDispute('security'), true);
  });

  test('a breakdown is a delay, not a disagreement', () => {
    // Raising every breakdown to a dispute would make "disputed" mean
    // "something happened" instead of "the two sides disagree", and then
    // nobody reads the list.
    assert.equal(raisesDispute('breakdown'), false);
    assert.equal(raisesDispute('detained'), false);
    assert.equal(raisesDispute('road'), false);
  });
});

describe('suppressesEta', () => {
  test('a blocking incident stops the arrival estimate', () => {
    // "Arrives 18:40" beside "broken down near Jebba" is the product
    // contradicting itself.
    assert.equal(suppressesEta([incident({ severity: 'blocking' })]), true);
  });

  test('a delay does not', () => {
    assert.equal(suppressesEta([incident({ severity: 'delaying' })]), false);
    assert.equal(suppressesEta([]), false);
  });
});

describe('open', () => {
  test('a resolved incident is not open', () => {
    const all = [incident({ id: 'a' }), incident({ id: 'b', resolvedAt: at(60) })];
    assert.deepEqual(open(all).map((i) => i.id), ['a']);
  });
});

describe('headline', () => {
  test('the most severe open incident leads', () => {
    const all = [
      incident({ id: 'noted', kind: 'cargo', severity: 'noted', at: at(90) }),
      incident({ id: 'blocking', severity: 'blocking', at: at(10) }),
    ];
    assert.equal(headline(all)?.id, 'blocking');
  });

  test('among equals, the most recent leads', () => {
    const all = [
      incident({ id: 'old', severity: 'delaying', at: at(10) }),
      incident({ id: 'new', severity: 'delaying', at: at(90) }),
    ];
    assert.equal(headline(all)?.id, 'new');
  });

  test('a resolved incident never becomes the headline', () => {
    const all = [
      incident({ id: 'fixed', severity: 'blocking', resolvedAt: at(30) }),
      incident({ id: 'live', severity: 'noted' }),
    ];
    assert.equal(headline(all)?.id, 'live');
  });

  test('a quiet trip has no headline', () => {
    assert.equal(headline([]), null);
  });
});

describe('needsPhoto', () => {
  test('cargo and accident claims need a picture', () => {
    // One person's word is what the product exists to replace.
    assert.equal(needsPhoto('cargo'), true);
    assert.equal(needsPhoto('accident'), true);
  });

  test('security never does', () => {
    // Nobody photographs a hijack. Demanding it would mean the report that
    // matters most is the one that cannot be filed.
    assert.equal(needsPhoto('security'), false);
  });
});

describe('describeKind', () => {
  test('every kind has plain words', () => {
    for (const kind of KINDS) {
      const words = describeKind(kind);
      assert.ok(words.length > 0);
      assert.doesNotMatch(words, /_/);
    }
  });
});

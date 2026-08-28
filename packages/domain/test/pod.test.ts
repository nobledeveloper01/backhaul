import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPTURE_RADIUS_M,
  MINIMUM_PHOTOS,
  capturedAwayFromDestination,
  capturedNear,
  describeException,
  document,
  documentText,
  seal,
  settlesDespite,
  type Delivery,
} from '../src/pod.ts';
import type { Waypoint } from '../src/waypoints.ts';

const T0 = new Date('2026-03-06T14:20:00Z');

const KANO: Waypoint = {
  id: 'kano',
  name: 'Dawanau market, Kano',
  at: { lat: 12.0, lon: 8.52, accuracy: 0, at: T0 },
  kind: 'destination',
  radius: 300,
};

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  tripId: 'trip-1',
  at: T0,
  photoIds: ['p1', 'p2'],
  signature: { name: 'Ibrahim Sani', role: 'storekeeper', imageId: 's1' },
  capturedAt: { lat: 12.0, lon: 8.52, accuracy: 12, at: T0 },
  note: '',
  exception: null,
  ...over,
});

describe('seal', () => {
  test('two photographs, a signature and a name are enough', () => {
    assert.equal(seal(delivery()).ok, true);
  });

  test('one photograph is not, and the refusal says how many more', () => {
    // One photograph of a pallet could have been taken anywhere.
    const result = seal(delivery({ photoIds: ['p1'] }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'no_photos');
      assert.match(result.detail, /1 more photo\b/);
    }
  });

  test('the plural is right when none have been taken', () => {
    const result = seal(delivery({ photoIds: [] }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.detail, /2 more photos/);
    assert.equal(MINIMUM_PHOTOS, 2);
  });

  test('a signature with no name is not a signature', () => {
    const result = seal(
      delivery({ signature: { name: '   ', role: 'storekeeper', imageId: 's1' } }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no_name');
  });

  test('nothing else is demanded', () => {
    // Every extra requirement is another thing a driver does in a market with
    // a queue behind them, and an unmet requirement produces no proof at all.
    assert.equal(seal(delivery({ capturedAt: null, note: '' })).ok, true);
  });
});

describe('capturedNear', () => {
  test('measures the distance from the destination', () => {
    const away = capturedNear(
      delivery({ capturedAt: { lat: 12.03, lon: 8.52, accuracy: 12, at: T0 } }),
      KANO,
    );
    assert.ok(away !== null && away > 3_000 && away < 3_500);
  });

  test('no fix claims nothing, rather than claiming it was right', () => {
    assert.equal(capturedNear(delivery({ capturedAt: null }), KANO), null);
    assert.equal(capturedNear(delivery(), null), null);
  });

  test('a market address is a district, so the radius is generous', () => {
    const nearby = delivery({ capturedAt: { lat: 12.004, lon: 8.523, accuracy: 20, at: T0 } });
    assert.equal(capturedAwayFromDestination(nearby, KANO), false);
    assert.equal(CAPTURE_RADIUS_M, 1_000);
  });

  test('a capture kilometres away is flagged, not refused', () => {
    const far = delivery({ capturedAt: { lat: 12.1, lon: 8.6, accuracy: 20, at: T0 } });
    assert.equal(capturedAwayFromDestination(far, KANO), true);
    assert.equal(seal(far).ok, true);
  });
});

describe('document', () => {
  const lines = (
    over: Partial<Delivery> = {},
    destination: Waypoint | null = KANO,
    sealedAt: Date | null = null,
  ) =>
    document({
      delivery: delivery(over),
      destination,
      cargo: '18 t of rice',
      reference: 'BH-0417',
      sealedAt,
      formatDate: (at) => at.toISOString(),
    });

  const value = (label: string, over?: Partial<Delivery>, destination?: Waypoint | null) =>
    lines(over, destination).find((line) => line.label === label)?.value;

  test('names the reference, the cargo and who signed', () => {
    assert.equal(value('Reference'), 'BH-0417');
    assert.equal(value('Cargo'), '18 t of rice');
    assert.equal(value('Received by'), 'Ibrahim Sani (storekeeper)');
  });

  test('drops the brackets when no role was given', () => {
    const signature = { name: 'Ibrahim Sani', role: '  ', imageId: 's1' };
    assert.equal(value('Received by', { signature }), 'Ibrahim Sani');
  });

  test('says where the capture happened in plain words', () => {
    assert.equal(value('Captured'), 'At the destination');
    assert.equal(value('Captured', { capturedAt: null }), 'No position recorded');
  });

  test('reports a distant capture to a tenth of a kilometre', () => {
    const far = { capturedAt: { lat: 12.1, lon: 8.52, accuracy: 20, at: T0 } };
    assert.match(value('Captured', far) ?? '', /^11\.\d km from the destination$/);
  });

  test('an exception appears on the document, not only in a dispute', () => {
    const short = {
      exception: { kind: 'short' as const, quantity: 3, note: '', photoIds: ['p3'] },
    };
    assert.equal(value('Exception', short), '3 short');
  });

  test('a clean delivery has no exception line at all', () => {
    assert.ok(!lines().some((line) => line.label === 'Exception'));
  });

  test('an unsealed note says nothing about a seal', () => {
    // A draft that reads like a record is the failure this line exists to
    // prevent, and a "Sealed: —" would read as a record with a gap in it.
    assert.ok(!lines().some((line) => line.label === 'Sealed'));
  });

  test('the seal is the last line, because it is what the rest is worth', () => {
    const sealedAt = new Date('2026-03-06T15:05:00Z');
    const withSeal = lines({}, KANO, sealedAt);
    assert.equal(withSeal[withSeal.length - 1]?.label, 'Sealed');
    assert.equal(withSeal[withSeal.length - 1]?.value, sealedAt.toISOString());
  });

  test('the seal stays last even when there is an exception to report', () => {
    const short = {
      exception: { kind: 'short' as const, quantity: 3, note: '', photoIds: ['p3'] },
    };
    const withSeal = lines(short, KANO, new Date('2026-03-06T15:05:00Z'));
    assert.equal(withSeal[withSeal.length - 1]?.label, 'Sealed');
    assert.ok(withSeal.some((line) => line.label === 'Exception'));
  });
});

describe('documentText', () => {
  const note = (sealedAt: Date | null = new Date('2026-03-06T15:05:00Z')) =>
    documentText({
      title: 'Takardar mikawa',
      lines: document({
        delivery: delivery(),
        destination: KANO,
        cargo: '18 t of rice',
        reference: 'BH-0417',
        sealedAt,
        formatDate: (at) => at.toISOString(),
      }),
    });

  test('leads with the title, then the record', () => {
    const [title, blank, first] = note().split('\n');
    assert.equal(title, 'Takardar mikawa');
    assert.equal(blank, '');
    assert.equal(first, 'Reference: BH-0417');
  });

  test('carries every line the screen shows, and nothing it does not', () => {
    // The copy in the driver's hand and the copy on the shipper's screen are
    // the same document. A hand-over that dropped or added a line would be two
    // proofs of one delivery, which is the argument this module is built on.
    const composed = document({
      delivery: delivery(),
      destination: KANO,
      cargo: '18 t of rice',
      reference: 'BH-0417',
      sealedAt: new Date('2026-03-06T15:05:00Z'),
      formatDate: (at) => at.toISOString(),
    });
    assert.deepEqual(
      note().split('\n').slice(2),
      composed.map((line) => `${line.label}: ${line.value}`),
    );
  });

  test('an unsealed note is shorter by exactly the seal', () => {
    assert.equal(note(null).split('\n').length + 1, note().split('\n').length);
  });
});

describe('describeException', () => {
  test('reads as a person would write it', () => {
    assert.equal(
      describeException({ kind: 'damaged', quantity: 2, note: '', photoIds: [] }),
      '2 damaged',
    );
    assert.equal(
      describeException({ kind: 'short', quantity: null, note: '', photoIds: [] }),
      'short',
    );
    assert.equal(
      describeException({ kind: 'refused', quantity: null, note: '', photoIds: [] }),
      'Refused on delivery',
    );
  });
});

describe('settlesDespite', () => {
  test('a short or damaged delivery still settles', () => {
    // Holding the whole payment until a quantity dispute resolves punishes a
    // carrier for a discrepancy that is usually the loading end's.
    assert.equal(settlesDespite({ kind: 'short', quantity: 3, note: '', photoIds: [] }), true);
    assert.equal(settlesDespite({ kind: 'damaged', quantity: 1, note: '', photoIds: [] }), true);
    assert.equal(settlesDespite(null), true);
  });

  test('a refusal does not', () => {
    assert.equal(
      settlesDespite({ kind: 'refused', quantity: null, note: '', photoIds: [] }),
      false,
    );
  });
});

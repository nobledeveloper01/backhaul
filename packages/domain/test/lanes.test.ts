import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_RUNS_FOR_TYPICAL,
  RECENT_RUNS,
  UNUSUAL_FRACTION,
  describeCadence,
  describeDue,
  due,
  dueIn,
  isDue,
  isUnusual,
  typicalPrice,
  type Lane,
} from '../src/lanes.ts';
import { fromNaira } from '../src/money.ts';

const NOW = new Date('2026-03-31T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const lane = (over: Partial<Lane> = {}): Lane => ({
  id: 'l1',
  shipperId: 's1',
  name: 'Tuesday cement',
  origin: 'Lagos',
  destination: 'Kano',
  cargo: '28 t cement',
  weightKg: 28_000,
  truck: 'trailer_30t',
  cadence: 'weekly',
  history: [2_200_000, 2_240_000, 2_180_000].map(fromNaira),
  lastRunAt: daysAgo(6),
  ...over,
});

describe('dueIn', () => {
  test('counts down to the next run', () => {
    assert.equal(dueIn(lane(), NOW), 1 * 86_400_000);
  });

  test('goes negative when a lane is overdue', () => {
    assert.ok((dueIn(lane({ lastRunAt: daysAgo(10) }), NOW) ?? 0) < 0);
  });

  test('an ad-hoc lane has no schedule to be due against', () => {
    assert.equal(dueIn(lane({ cadence: 'ad_hoc' }), NOW), null);
  });

  test('and neither does one that has never run', () => {
    assert.equal(dueIn(lane({ lastRunAt: null }), NOW), null);
  });
});

describe('isDue', () => {
  test('warns two days ahead, so a load is posted before the day', () => {
    // A load posted the morning it must move goes to whoever is nearest
    // rather than to whoever is best.
    assert.equal(isDue(lane({ lastRunAt: daysAgo(5) }), NOW), true);
    assert.equal(isDue(lane({ lastRunAt: daysAgo(2) }), NOW), false);
  });

  test('an overdue lane is still due', () => {
    assert.equal(isDue(lane({ lastRunAt: daysAgo(20) }), NOW), true);
  });
});

describe('typicalPrice', () => {
  test('refuses an answer from one or two runs', () => {
    assert.equal(typicalPrice(lane({ history: [fromNaira(2_000_000)] })), null);
    assert.equal(MINIMUM_RUNS_FOR_TYPICAL, 3);
  });

  test('is the median, so one panic-priced run does not set the rate', () => {
    const shortage = lane({
      history: [2_100_000, 2_200_000, 2_150_000, 6_000_000, 2_180_000].map(fromNaira),
    });
    const typical = typicalPrice(shortage);
    assert.ok(typical !== null && typical < fromNaira(2_500_000));
  });

  test('and only looks at the recent runs, because a lane price drifts', () => {
    // A mean over two years anchors a shipper to a number that stopped being
    // true.
    const drifted = lane({
      history: [
        ...Array.from({ length: 10 }, () => fromNaira(900_000)),
        ...Array.from({ length: RECENT_RUNS }, () => fromNaira(2_200_000)),
      ],
    });
    assert.equal(typicalPrice(drifted), fromNaira(2_200_000));
  });

  test('an even number of recent runs splits the middle two', () => {
    const even = lane({ history: [1_000_000, 2_000_000, 3_000_000, 4_000_000].map(fromNaira) });
    assert.equal(typicalPrice(even), fromNaira(2_500_000));
  });
});

describe('isUnusual', () => {
  test('a price near the lane usual is not remarked on', () => {
    assert.equal(isUnusual(lane(), fromNaira(2_250_000)), false);
  });

  test('one a long way either side is', () => {
    assert.equal(isUnusual(lane(), fromNaira(3_400_000)), true);
    assert.equal(isUnusual(lane(), fromNaira(1_200_000)), true);
    assert.equal(UNUSUAL_FRACTION, 0.25);
  });

  test('a lane with no history remarks on nothing', () => {
    // A platform that flags a first run as unusual is a platform that cries
    // wolf on the one occasion it has nothing to compare against.
    assert.equal(isUnusual(lane({ history: [] }), fromNaira(9_000_000)), false);
  });
});

describe('due', () => {
  test('lists the most overdue first', () => {
    const lanes = [
      lane({ id: 'soon', lastRunAt: daysAgo(6) }),
      lane({ id: 'overdue', lastRunAt: daysAgo(21) }),
    ];
    assert.deepEqual(due(lanes, NOW).map((l) => l.id), ['overdue', 'soon']);
  });

  test('and never prompts about a lane with no schedule', () => {
    const lanes = [lane({ id: 'adhoc', cadence: 'ad_hoc', lastRunAt: daysAgo(400) })];
    assert.equal(due(lanes, NOW).length, 0);
  });
});

describe('wording', () => {
  test('every cadence reads as English', () => {
    for (const cadence of ['weekly', 'fortnightly', 'monthly', 'ad_hoc'] as const) {
      assert.doesNotMatch(describeCadence(cadence), /_/);
    }
  });

  test('due dates read as somebody would say them', () => {
    assert.equal(describeDue(lane({ lastRunAt: daysAgo(7) }), NOW), 'Due today');
    assert.equal(describeDue(lane({ lastRunAt: daysAgo(6) }), NOW), 'Due tomorrow');
    assert.equal(describeDue(lane({ lastRunAt: daysAgo(12) }), NOW), '5 days overdue');
    assert.equal(describeDue(lane({ cadence: 'ad_hoc' }), NOW), 'When needed');
  });
});

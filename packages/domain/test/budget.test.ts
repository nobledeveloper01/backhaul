import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BYTES_PER_BATCH,
  BYTES_PER_SAMPLE,
  WORTH_MENTIONING,
  dailyCost,
  describeBytes,
  describeCost,
  describeMonthly,
  monthlyCost,
  estimateCost,
  usage,
  worthMentioning,
} from '../src/budget.ts';
import { fromNaira } from '../src/money.ts';
import { INTERVAL, UPLOAD_EVERY_MS } from '../src/tracking.ts';

describe('usage', () => {
  test('counts the samples and the envelopes they came in', () => {
    const used = usage(100, 4);
    assert.equal(used.bytes, 100 * BYTES_PER_SAMPLE + 4 * BYTES_PER_BATCH);
  });

  test('an upload is worth several samples, which is why the tracker batches', () => {
    assert.ok(BYTES_PER_BATCH > BYTES_PER_SAMPLE * 5);
  });
});

describe('estimateCost', () => {
  test('a megabyte costs about a third of a naira', () => {
    const megabyte = { samples: 0, batches: 0, bytes: 1_048_576 };
    assert.equal(estimateCost(megabyte), 35);
  });

  test('rounds up, so nothing is ever quoted as free that is not', () => {
    // Every figure here is a bill somebody pays.
    assert.equal(estimateCost({ samples: 1, batches: 0, bytes: 10 }), 1);
  });

  test('takes the data price as an argument, because it moves', () => {
    const megabyte = { samples: 0, batches: 0, bytes: 1_048_576 };
    assert.equal(estimateCost(megabyte, 100), 100);
  });
});

describe('dailyCost', () => {
  test('a full day of moving costs a driver small change', () => {
    // The number the feature exists to produce. If tracking cost a driver ₦500
    // a day the product would not be viable, and this is where that is checked
    // rather than assumed.
    const { cost } = dailyCost({
      interval: INTERVAL.moving,
      uploadEveryMs: UPLOAD_EVERY_MS,
    });
    assert.ok(cost > 0);
    assert.ok(cost < fromNaira(20), `₦${cost / 100} a day is too much`);
  });

  test('conserving costs less than moving', () => {
    const moving = dailyCost({ interval: INTERVAL.moving, uploadEveryMs: UPLOAD_EVERY_MS });
    const saving = dailyCost({
      interval: INTERVAL.conserving,
      uploadEveryMs: UPLOAD_EVERY_MS,
    });
    assert.ok(saving.cost < moving.cost);
  });

  test('and a three-day Lagos–Kano run is still under a hundred naira', () => {
    const { cost } = dailyCost({
      interval: INTERVAL.moving,
      uploadEveryMs: UPLOAD_EVERY_MS,
    });
    assert.ok(cost * 3 < fromNaira(100));
  });
});

describe('describeBytes', () => {
  test('never shows a person a raw byte count', () => {
    assert.equal(describeBytes(512), '512 B');
    assert.equal(describeBytes(2_048), '2 kB');
    assert.equal(describeBytes(1_048_576), '1.0 MB');
    assert.equal(describeBytes(1_572_864), '1.5 MB');
  });
});

describe('describeCost', () => {
  test('says the size and what it cost, in one sentence', () => {
    const used = usage(40_000, 1_000);
    const said = describeCost(used, estimateCost(used));
    assert.match(said, /MB of data so far/);
    assert.match(said, /₦\d+ of your airtime/);
  });

  test('a trivial amount says "under ₦1" rather than "₦0"', () => {
    // "₦0" reads as a bug or as a promise. Neither is true.
    const used = usage(10, 1);
    assert.match(describeCost(used, estimateCost(used)), /under ₦1/);
  });
});

describe('monthlyCost', () => {
  test('a month of tracking is the figure worth showing', () => {
    // The daily one is too small to be legible, which is itself the answer to
    // the fear: at current prices this is a few naira a month.
    const { cost } = dailyCost({
      interval: INTERVAL.moving,
      uploadEveryMs: UPLOAD_EVERY_MS,
    });
    assert.ok(monthlyCost(cost) < fromNaira(50), `₦${monthlyCost(cost) / 100} a month`);
    assert.match(describeMonthly(cost), /a month at this rate/);
  });
});

describe('worthMentioning', () => {
  test('says nothing unprompted about small change', () => {
    assert.equal(worthMentioning(fromNaira(12)), false);
  });

  test('nothing at today\'s prices reaches it, which is the point', () => {
    // The guard exists for a payload that grows or a price that spikes — a
    // future feature uploading photographs on the driver's own bundle, say.
    const { cost } = dailyCost({
      interval: INTERVAL.moving,
      uploadEveryMs: UPLOAD_EVERY_MS,
    });
    assert.equal(worthMentioning(cost), false);
    assert.equal(worthMentioning(WORTH_MENTIONING), true);
  });
});

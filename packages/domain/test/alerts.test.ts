import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  POLICY,
  QUIET_FROM_HOUR,
  decideAlert,
  describeAlert,
  digest,
  isQuietHour,
  type AlertKind,
} from '../src/alerts.ts';

const NOW = new Date('2026-03-04T14:00:00Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60_000);

const KINDS: readonly AlertKind[] = [
  'signal_lost',
  'stalled',
  'deviating',
  'late',
  'incident',
  'duress',
  'delivered',
  'bid_received',
  'link_expiring',
];

const ask = (over: Partial<Parameters<typeof decideAlert>[0]> = {}) =>
  decideAlert({
    kind: 'stalled',
    to: 'shipper',
    localHour: 14,
    lastSentAt: null,
    now: NOW,
    ...over,
  });

describe('POLICY', () => {
  test('every kind has a policy, so nothing falls through to a default', () => {
    for (const kind of KINDS) assert.ok(POLICY[kind]);
  });

  test('exactly one kind is urgent enough to wake somebody', () => {
    // If everything is urgent, nothing is.
    const urgent = KINDS.filter((kind) => POLICY[kind].urgency === 'urgent');
    assert.deepEqual(urgent, ['duress']);
  });

  test('a driver is never told their own signal dropped', () => {
    // They can see it out of the window. Telling them is noise from an app
    // they did not choose.
    assert.ok(!POLICY.signal_lost.to.includes('driver'));
    assert.ok(!POLICY.stalled.to.includes('driver'));
  });

  test('every kind can repeat eventually, and none of them quickly', () => {
    for (const kind of KINDS) {
      assert.ok(POLICY[kind].repeatAfterMs > 0, kind);
    }
    // One bad stretch of road must not be fourteen notifications.
    assert.ok(POLICY.signal_lost.repeatAfterMs >= 4 * 60 * 60_000);
  });
});

describe('decideAlert', () => {
  test('sends a push to the right audience in the daytime', () => {
    const decision = ask();
    assert.equal(decision.send, true);
    if (decision.send) assert.equal(decision.urgency, 'push');
  });

  test('says nothing to somebody the policy does not name', () => {
    const decision = ask({ to: 'driver' });
    assert.equal(decision.send, false);
    if (!decision.send) assert.equal(decision.reason, 'wrong_audience');
  });

  test('will not repeat the same condition within its window', () => {
    const decision = ask({ lastSentAt: hoursAgo(1) });
    assert.equal(decision.send, false);
    if (!decision.send) assert.equal(decision.reason, 'too_soon');
  });

  test('and will once the window has passed', () => {
    assert.equal(ask({ lastSentAt: hoursAgo(9) }).send, true);
  });

  test('a push at 3am is held, not sent', () => {
    const decision = ask({ localHour: 3 });
    assert.equal(decision.send, false);
    if (!decision.send) assert.equal(decision.reason, 'quiet_hours');
  });

  test('a duress alert goes through at 3am to everybody', () => {
    for (const to of ['shipper', 'carrier', 'driver'] as const) {
      const decision = decideAlert({
        kind: 'duress',
        to,
        localHour: 3,
        lastSentAt: null,
        now: NOW,
      });
      assert.equal(decision.send, true, to);
      if (decision.send) assert.equal(decision.urgency, 'urgent');
    }
  });

  test('a quiet alert is unaffected by quiet hours', () => {
    // It was never going to buzz. Holding it would only delay a line in a list.
    const decision = decideAlert({
      kind: 'bid_received',
      to: 'shipper',
      localHour: 3,
      lastSentAt: null,
      now: NOW,
    });
    assert.equal(decision.send, true);
    if (decision.send) assert.equal(decision.urgency, 'quiet');
  });
});

describe('isQuietHour', () => {
  test('covers the night, and wraps around midnight', () => {
    assert.equal(isQuietHour(23), true);
    assert.equal(isQuietHour(0), true);
    assert.equal(isQuietHour(5), true);
    assert.equal(isQuietHour(6), false);
    assert.equal(isQuietHour(14), false);
    assert.equal(isQuietHour(QUIET_FROM_HOUR), true);
  });
});

describe('digest', () => {
  test('nothing held is nothing said', () => {
    assert.equal(digest([]), null);
  });

  test('one thing reads as a sentence', () => {
    assert.equal(digest(['stalled']), 'Overnight: a truck not moving.');
  });

  test('repeats are counted rather than repeated', () => {
    // Four buzzes at 06:00 reads as a malfunction, and so does a sentence that
    // says the same words four times.
    assert.equal(
      digest(['signal_lost', 'signal_lost', 'late']),
      'Overnight: no signal (2) and a delivery running late.',
    );
  });

  test('three or more get commas and an "and"', () => {
    assert.match(digest(['stalled', 'late', 'incident']) ?? '', /, .* and /);
  });
});

describe('describeAlert', () => {
  test('every kind reads as English, with no state names in it', () => {
    for (const kind of KINDS) {
      const words = describeAlert(kind);
      assert.ok(words.length > 0, kind);
      assert.doesNotMatch(words, /_/);
    }
  });
});

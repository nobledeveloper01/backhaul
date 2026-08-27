import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FOLLOW_INTERVAL_S,
  FOLLOW_MS,
  HOLD_MS,
  alertText,
  isLive,
  overridesBatterySaving,
  tell,
  visibleConfirmation,
  type DuressSignal,
} from '../src/duress.ts';
import { INTERVAL } from '../src/tracking.ts';

const NOW = new Date('2026-03-04T21:40:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const signal = (over: Partial<DuressSignal> = {}): DuressSignal => ({
  tripId: 'trip-1',
  trigger: 'hidden_press',
  at: minutesAgo(5),
  near: { lat: 10.52, lon: 7.44 },
  batteryFraction: 0.31,
  ...over,
});

describe('visibleConfirmation', () => {
  test('the screen shows nothing at all', () => {
    // Whoever is standing over the driver must not be able to tell it
    // happened. A success toast turns a silent alarm into a reason to take
    // the phone. Asserted here so a screen cannot disagree with it.
    assert.equal(visibleConfirmation(), null);
  });
});

describe('overridesBatterySaving', () => {
  test('the tracker ignores its own battery policy for half an hour', () => {
    // A hijacked truck is found by where it goes next.
    assert.equal(overridesBatterySaving(signal(), NOW), true);
    assert.equal(FOLLOW_MS, 30 * 60_000);
  });

  test('and stops overriding once the window has passed', () => {
    assert.equal(overridesBatterySaving(signal({ at: minutesAgo(45) }), NOW), false);
  });

  test('the follow cadence is faster than anything the normal ladder uses', () => {
    assert.ok(FOLLOW_INTERVAL_S < INTERVAL.moving);
  });
});

describe('tell', () => {
  test('the carrier first — they will make the phone call', () => {
    assert.equal(tell(false)[0], 'carrier');
  });

  test('an emergency contact is told last, and only if there is one', () => {
    assert.deepEqual(tell(false), ['carrier', 'shipper']);
    assert.deepEqual(tell(true), ['carrier', 'shipper', 'contact']);
  });

  test('nobody is dispatched automatically', () => {
    // A platform that dispatches a response on a signal it cannot verify is a
    // platform that gets used to dispatch responses.
    for (const recipients of [tell(true), tell(false)]) {
      assert.ok(!recipients.some((who) => (who as string) === 'police'));
    }
  });
});

describe('alertText', () => {
  const said = alertText({
    plate: 'LSR-482-XA',
    driver: 'Musa Danjuma',
    where: 'Kaduna',
    at: minutesAgo(2),
    formatTime: () => '21:38',
  });

  test('names the driver, the truck, the time and the place', () => {
    for (const fact of ['Musa Danjuma', 'LSR-482-XA', '21:38', 'Kaduna']) {
      assert.match(said, new RegExp(fact.replace('-', '\\-')));
    }
  });

  test('says what to do first', () => {
    assert.match(said, /Call the driver/);
  });

  test('and fits in a notification without an essay', () => {
    assert.ok(said.length < 220, `${said.length} characters`);
  });
});

describe('isLive', () => {
  test('a signal stays open until a person clears it', () => {
    assert.equal(isLive(signal(), null), true);
  });

  test('time alone never clears it', () => {
    // A truck that went quiet an hour after the alarm is the case that most
    // needs to stay open.
    assert.equal(isLive(signal({ at: minutesAgo(600) }), null), true);
  });

  test('a clearance from before the signal does not count', () => {
    assert.equal(isLive(signal(), minutesAgo(30)), true);
    assert.equal(isLive(signal(), NOW), false);
  });
});

describe('HOLD_MS', () => {
  test('long enough that a pocket cannot do it', () => {
    assert.ok(HOLD_MS >= 2_000);
    assert.ok(HOLD_MS <= 5_000);
  });
});

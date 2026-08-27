import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DELAY_WORTH_SHOWING_MS,
  MAX_MESSAGE_CHARS,
  compose,
  delayed,
  pending,
  thread,
  unread,
  type Message,
  type Party,
} from '../src/messages.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const PARTIES: readonly Party[] = ['shipper', 'carrier', 'driver'];

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  tripId: 'trip-1',
  from: 'driver',
  body: 'At the weighbridge, two hours',
  at: T0,
  receivedAt: T0,
  readBy: ['driver'],
  ...over,
});

const sent = (body: string, over: Partial<Parameters<typeof compose>[0]> = {}) =>
  compose({
    id: 'm1',
    tripId: 'trip-1',
    from: 'driver',
    body,
    at: T0,
    parties: PARTIES,
    tripFinished: false,
    ...over,
  });

describe('compose', () => {
  test('accepts an ordinary message and trims it', () => {
    const result = sent('  On the road again  ');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.message.body, 'On the road again');
  });

  test('a message is unsent until the server says otherwise', () => {
    const result = sent('At the weighbridge');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.message.receivedAt, null);
  });

  test('the writer has already read their own message', () => {
    const result = sent('At the weighbridge');
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.message.readBy, ['driver']);
  });

  test('whitespace alone is empty', () => {
    const result = sent('   \n  ');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'empty');
  });

  test('a wall of text is refused, and the refusal says what to do instead', () => {
    const result = sent('a'.repeat(MAX_MESSAGE_CHARS + 1));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'too_long');
      assert.match(result.detail, /call/);
    }
  });

  test('somebody not on the trip cannot write on it', () => {
    const result = sent('hello', { parties: ['shipper', 'carrier'] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'not_a_party');
  });

  test('a closed trip keeps its messages as they were', () => {
    // Appending after delivery would let either side add a line that was never
    // said at the time, and the value of the thread is that it was written
    // while it was happening.
    const result = sent('actually I did tell you', { tripFinished: true });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'trip_finished');
  });
});

describe('thread', () => {
  test('orders by when it was written, not when it arrived', () => {
    // A driver types in a dead zone and it leaves an hour later. The thread
    // still reads in the order the conversation happened.
    const deadZone = message({ id: 'early', at: at(0), receivedAt: at(60) });
    const office = message({ id: 'later', from: 'shipper', at: at(30), receivedAt: at(30) });

    assert.deepEqual(
      thread([office, deadZone]).map((m) => m.id),
      ['early', 'later'],
    );
  });

  test('ties are broken by what the server saw', () => {
    const a = message({ id: 'a', at: at(10), receivedAt: at(11) });
    const b = message({ id: 'b', at: at(10), receivedAt: at(70) });
    assert.deepEqual(thread([b, a]).map((m) => m.id), ['a', 'b']);
  });

  test('does not mutate what it was given', () => {
    const given = [message({ id: 'b', at: at(10) }), message({ id: 'a', at: at(0) })];
    thread(given);
    assert.deepEqual(given.map((m) => m.id), ['b', 'a']);
  });
});

describe('unread', () => {
  test('counts what this reader has not seen', () => {
    const messages = [
      message({ id: 'a', readBy: ['driver'] }),
      message({ id: 'b', readBy: ['driver', 'shipper'] }),
    ];
    assert.deepEqual(unread(messages, 'shipper').map((m) => m.id), ['a']);
    assert.equal(unread(messages, 'driver').length, 0);
  });
});

describe('pending', () => {
  test('a message the server has not taken is pending, not sent', () => {
    // A driver who believes a message went out and learns days later that it
    // did not has been misled by the screen, not by the network.
    const messages = [message({ id: 'a', receivedAt: null }), message({ id: 'b' })];
    assert.deepEqual(pending(messages).map((m) => m.id), ['a']);
  });
});

describe('delayed', () => {
  test('a message that sat in a dead zone reports how long', () => {
    const late = message({ at: at(0), receivedAt: at(120) });
    assert.equal(delayed(late), 120 * 60_000);
  });

  test('a few seconds of latency is not worth a line on screen', () => {
    assert.equal(delayed(message({ at: at(0), receivedAt: at(1) })), null);
    assert.ok(DELAY_WORTH_SHOWING_MS >= 10 * 60_000);
  });

  test('an unsent message has no delay to report yet', () => {
    assert.equal(delayed(message({ receivedAt: null })), null);
  });
});

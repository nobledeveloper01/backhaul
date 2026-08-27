import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SHARE_DAYS,
  check,
  daysLeft,
  invite,
  visibleUnder,
  type ShareLink,
} from '../src/sharing.ts';

const NOW = new Date('2026-03-04T06:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const link = (over: Partial<ShareLink> = {}): ShareLink => ({
  token: 'a'.repeat(64),
  tripId: 'trip-1',
  scope: 'position',
  issuedAt: NOW,
  expiresAt: days(DEFAULT_SHARE_DAYS),
  revokedAt: null,
  label: 'the depot',
  ...over,
});

describe('check', () => {
  test('a live link passes and hands back the link itself', () => {
    const result = check(link(), NOW);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.link.tripId, 'trip-1');
  });

  test('a token nobody issued is unknown, not expired', () => {
    const result = check(undefined, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'unknown');
  });

  test('revoked and expired are different answers with different words', () => {
    const revoked = check(link({ revokedAt: days(1) }), days(2));
    const expired = check(link({ expiresAt: days(1) }), days(2));

    assert.equal(revoked.ok, false);
    assert.equal(expired.ok, false);
    if (revoked.ok || expired.ok) return;

    assert.equal(revoked.reason, 'revoked');
    assert.equal(expired.reason, 'expired');
    // The whole reason the two are separate: the sentences differ.
    assert.notEqual(revoked.detail, expired.detail);
  });

  test('revocation beats expiry when both are true', () => {
    // Somebody who turned a link off should be told it was turned off, even if
    // it would have lapsed anyway by the time they look.
    const result = check(link({ expiresAt: days(1), revokedAt: days(1) }), days(9));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'revoked');
  });

  test('expiry is exclusive at the boundary', () => {
    const expiring = link({ expiresAt: days(1) });
    assert.equal(check(expiring, days(1)).ok, false);
    assert.equal(check(expiring, new Date(days(1).getTime() - 1)).ok, true);
  });

  test('every refusal tells the reader what to do next', () => {
    for (const result of [check(undefined, NOW), check(link({ revokedAt: NOW }), NOW)]) {
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.match(result.detail, /new one/);
    }
  });
});

describe('daysLeft', () => {
  test('floors rather than rounds up', () => {
    // 6.9 days left is "6 days", never 7. Rounding up promises a day the link
    // does not have, and the promise is read by somebody watching a truck.
    const nearly = link({ expiresAt: new Date(NOW.getTime() + 6.9 * 86_400_000) });
    assert.equal(daysLeft(nearly, NOW), 6);
  });

  test('never goes negative', () => {
    assert.equal(daysLeft(link({ expiresAt: days(-3) }), NOW), 0);
  });

  test('a link with no expiry has no answer, not a big number', () => {
    assert.equal(daysLeft(link({ expiresAt: null }), NOW), null);
  });
});

describe('invite', () => {
  const message = invite({
    from: 'Adeyemi Foods',
    cargo: '18 t of rice',
    destination: 'Kano',
    url: 'https://bkhl.ng/t/9f3a2b1c',
  });

  test('fits in one SMS', () => {
    assert.ok(message.length <= 160, `${message.length} characters: ${message}`);
  });

  test('names the sender', () => {
    // A bare link from an unknown number is indistinguishable from phishing.
    assert.match(message, /Adeyemi Foods/);
  });

  test('carries the link and the destination', () => {
    assert.match(message, /https:\/\/bkhl\.ng\/t\/9f3a2b1c/);
    assert.match(message, /Kano/);
  });

  test('survives being pasted into SMS', () => {
    // No characters that a GSM-7 gateway would turn into three of something.
    assert.doesNotMatch(message, /[^\x20-\x7E]/);
  });
});

describe('visibleUnder', () => {
  test('position scope shows where and when, not the track', () => {
    const visible = visibleUnder('position');
    assert.equal(visible.position, true);
    assert.equal(visible.eta, true);
    assert.equal(visible.history, false);
    assert.equal(visible.trackQuality, false);
  });

  test('evidence scope adds the history and what was discarded', () => {
    const visible = visibleUnder('evidence');
    assert.equal(visible.history, true);
    assert.equal(visible.trackQuality, true);
  });

  test('no scope ever exposes contact details or money', () => {
    for (const scope of ['position', 'evidence'] as const) {
      const visible = visibleUnder(scope);
      assert.equal(visible.contactDetails, false);
      assert.equal(visible.money, false);
    }
  });
});

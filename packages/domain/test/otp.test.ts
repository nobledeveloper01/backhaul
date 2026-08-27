import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_LENGTH,
  CODE_LIVES_MS,
  MAX_ATTEMPTS,
  MAX_PER_HOUR,
  RESEND_AFTER_MS,
  checkCode,
  codeMessage,
  formatPhone,
  normalisePhone,
  resendIn,
  tooManyRequests,
  type Challenge,
} from '../src/otp.ts';

const NOW = new Date('2026-03-04T09:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const minutesAhead = (n: number) => new Date(NOW.getTime() + n * 60_000);

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  phone: '+2348031234567',
  issuedAt: minutesAgo(1),
  expiresAt: minutesAhead(9),
  attempts: 0,
  consumedAt: null,
  ...over,
});

describe('normalisePhone', () => {
  test('every way a Nigerian number is written means the same driver', () => {
    // Storing what was typed means a driver who signs in one way and back
    // another way is two accounts.
    for (const written of [
      '0803 123 4567',
      '08031234567',
      '+234 803 123 4567',
      '+2348031234567',
      '2348031234567',
      '8031234567',
      '0803-123-4567',
    ]) {
      assert.equal(normalisePhone(written), '+2348031234567', written);
    }
  });

  test('refuses rather than guessing at something it does not recognise', () => {
    // A number this does not recognise is one to ask about, not one to
    // normalise into somebody else's.
    for (const nonsense of ['', '0803', '080312345678901', '+1 415 555 0100', 'hello']) {
      assert.equal(normalisePhone(nonsense), null, nonsense);
    }
  });

  test('and is idempotent, so re-normalising never damages a stored number', () => {
    const once = normalisePhone('0803 123 4567');
    assert.equal(normalisePhone(once ?? ''), once);
  });
});

describe('formatPhone', () => {
  test('shows it back the way it is said out loud', () => {
    assert.equal(formatPhone('+2348031234567'), '0803 123 4567');
  });

  test('and leaves anything else alone rather than mangling it', () => {
    assert.equal(formatPhone('+14155550100'), '+14155550100');
  });
});

describe('checkCode', () => {
  test('a good code passes', () => {
    assert.equal(checkCode(challenge(), true, NOW).ok, true);
  });

  test('a code nobody asked for is unknown', () => {
    const result = checkCode(undefined, true, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'unknown');
  });

  test('a used code is never usable again, even with the right digits', () => {
    const result = checkCode(challenge({ consumedAt: minutesAgo(1) }), true, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'used');
  });

  test('a burned code says so rather than saying "wrong"', () => {
    // Somebody who has mistyped five times needs a new code, not a sixth
    // attempt at the same one.
    const result = checkCode(challenge({ attempts: MAX_ATTEMPTS }), false, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'exhausted');
      assert.match(result.detail, /Ask for a new code/);
    }
  });

  test('burned beats expired, because the remedy is the same and the count is the fact', () => {
    const result = checkCode(
      challenge({ attempts: MAX_ATTEMPTS, expiresAt: minutesAgo(5) }),
      true,
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'exhausted');
  });

  test('an expired code is expired even when the digits are right', () => {
    const result = checkCode(challenge({ expiresAt: minutesAgo(1) }), true, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'expired');
  });

  test('a wrong code says how many tries are left', () => {
    // Finding out by running out is the worst way to learn it.
    const result = checkCode(challenge({ attempts: 1 }), false, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.detail, /3 tries left/);
  });

  test('and says so plainly when that was the last one', () => {
    const result = checkCode(challenge({ attempts: MAX_ATTEMPTS - 1 }), false, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'wrong');
      assert.match(result.detail, /last try/);
    }
  });

  test('gets the singular right at one try left', () => {
    const result = checkCode(challenge({ attempts: MAX_ATTEMPTS - 2 }), false, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.detail, /1 try left/);
  });

  test('every refusal tells the person what to do next', () => {
    for (const state of [
      undefined,
      challenge({ consumedAt: NOW }),
      challenge({ attempts: MAX_ATTEMPTS }),
      challenge({ expiresAt: minutesAgo(1) }),
    ]) {
      const result = checkCode(state, false, NOW);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.detail, /new (code|one)/);
    }
  });
});

describe('resendIn', () => {
  test('counts down rather than just refusing', () => {
    // A disabled button with no explanation reads as broken to somebody whose
    // SMS has not arrived.
    assert.equal(resendIn(minutesAgo(0.5), NOW), 30_000);
  });

  test('is zero once the wait is over, and never negative', () => {
    assert.equal(resendIn(minutesAgo(5), NOW), 0);
    assert.equal(resendIn(null, NOW), 0);
    assert.equal(RESEND_AFTER_MS, 60_000);
  });
});

describe('tooManyRequests', () => {
  test('lets a person who has not received an SMS try again a few times', () => {
    const tries = [minutesAgo(50), minutesAgo(40), minutesAgo(2)];
    assert.equal(tooManyRequests(tries, NOW), false);
  });

  test('and stops an endpoint being used to spend money and harass a number', () => {
    const tries = Array.from({ length: MAX_PER_HOUR }, (_, i) => minutesAgo(i * 5));
    assert.equal(tooManyRequests(tries, NOW), true);
    assert.equal(MAX_PER_HOUR, 5);
  });

  test('the window rolls, so yesterday does not lock somebody out today', () => {
    const tries = Array.from({ length: 20 }, (_, i) => minutesAgo(70 + i));
    assert.equal(tooManyRequests(tries, NOW), false);
  });
});

describe('codeMessage', () => {
  const said = codeMessage('418293');

  test('fits in one SMS', () => {
    assert.ok(said.length <= 160, `${said.length} characters`);
  });

  test('carries the code and no link', () => {
    assert.match(said, /418293/);
    assert.doesNotMatch(said, /https?:/);
  });

  test('and warns about the commonest way a code is stolen', () => {
    // Somebody phones the person who just received it and asks for it.
    assert.match(said, /Do not share/);
    assert.match(said, /from Backhaul/);
  });
});

describe('the constants', () => {
  test('six digits, ten minutes — what a Nigerian bank sends', () => {
    assert.equal(CODE_LENGTH, 6);
    assert.equal(CODE_LIVES_MS, 10 * 60_000);
  });
});

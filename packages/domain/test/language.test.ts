import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EN,
  HA,
  LANGUAGES,
  describeLanguage,
  phrases,
  say,
  type Phrase,
} from '../src/language.ts';

const ALL = Object.keys(EN) as Phrase[];

describe('the two tables', () => {
  test('have exactly the same keys', () => {
    // A missing key must be a compile error rather than a blank on a phone in
    // a cab. This asserts the runtime half of that.
    assert.deepEqual(Object.keys(EN).sort(), Object.keys(HA).sort());
  });

  test('and no empty strings anywhere', () => {
    for (const phrase of ALL) {
      assert.ok(EN[phrase].trim().length > 0, `en:${phrase}`);
      assert.ok(HA[phrase].trim().length > 0, `ha:${phrase}`);
    }
  });

  test('are actually different — nothing is an untranslated copy', () => {
    // A table filled in by copying English is the failure this feature exists
    // to avoid, and it looks identical to a finished one from the outside.
    for (const phrase of ALL) {
      assert.notEqual(HA[phrase], EN[phrase], phrase);
    }
  });

  test('keep the hooked letters Hausa needs', () => {
    // Dropping ɓ, ɗ and ƙ is the difference between two different words, and a
    // product that writes a language carelessly says what it thinks of its
    // readers.
    const joined = Object.values(HA).join(' ');
    assert.match(joined, /[ɓɗƙ]/u);
  });
});

describe('say', () => {
  test('answers in the language asked for', () => {
    assert.equal(say('en', 'i_have_arrived'), "I've arrived");
    assert.equal(say('ha', 'i_have_arrived'), 'Na iso');
  });

  test('never falls back to English', () => {
    // A fallback chain means a screen can silently render English to a Hausa
    // reader and nobody finds out.
    for (const phrase of ALL) {
      assert.equal(say('ha', phrase), HA[phrase], phrase);
    }
  });
});

describe('phrases', () => {
  test('hands back the whole table for a screen that wants it once', () => {
    assert.equal(phrases('ha').tracking_on, HA.tracking_on);
  });
});

describe('scope', () => {
  test('only covers the driver face', () => {
    // The shipper and fleet screens are dense, changing, and read by people
    // who work in English daily. Translating them would double the copy
    // surface and halve the rate at which either version improves.
    const joined = Object.values(EN).join(' ').toLowerCase();
    for (const shipperWord of ['utilisation', 'demurrage', 'settlement', 'bid']) {
      assert.ok(!joined.includes(shipperWord), shipperWord);
    }
  });

  test('and stays small enough to keep correct', () => {
    assert.ok(ALL.length <= 25, `${ALL.length} phrases`);
  });
});

describe('describeLanguage', () => {
  test('names each language in itself', () => {
    assert.equal(describeLanguage('ha'), 'Hausa');
    assert.equal(describeLanguage('en'), 'English');
  });

  test('and both are offered', () => {
    assert.deepEqual([...LANGUAGES].sort(), ['en', 'ha']);
  });
});

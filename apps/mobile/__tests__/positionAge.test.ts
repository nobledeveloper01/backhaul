import { phrases, type Language } from '@backhaul/domain';

import { agoLabel, humanDuration, plural } from '../src/components/PositionAge';

/** The words a screen would have handed it, without a React tree to ask for them. */
const say = (language: Language) => (phrase: keyof ReturnType<typeof phrases>) =>
  phrases(language)[phrase];

const en = say('en');
const yo = say('yo');

test('durations round down, so a gap never sounds worse than it is', () => {
  // Rounding up makes every gap sound worse than it is, and the chip stops
  // being believed — which is the failure mode that matters, because the chip
  // is the only thing standing between a shipper and a phone call.
  expect(humanDuration(30_000, en)).toBe('just now');
  expect(humanDuration(59_000, en)).toBe('just now');
  expect(humanDuration(60_000, en)).toBe('1 min');
  expect(humanDuration(59 * 60_000, en)).toBe('59 min');
  expect(humanDuration(60 * 60_000, en)).toBe('1 h');
  expect(humanDuration(119 * 60_000, en)).toBe('1 h');
  expect(humanDuration(2 * 60 * 60_000, en)).toBe('2 h');
  expect(humanDuration(25 * 60 * 60_000, en)).toBe('1 d');
  expect(humanDuration(72 * 60 * 60_000, en)).toBe('3 d');
});

test('and are written in the language the reader chose', () => {
  // This is the whole reason the words are an argument rather than something
  // the function reaches for. It used to be a plain helper, and a plain helper
  // cannot see a React context — so "45 min ago" rendered underneath four
  // lines of Yorùbá and no test could tell.
  expect(humanDuration(45 * 60_000, yo)).toBe('45 ìṣẹ́jú');
  expect(agoLabel(45 * 60_000, yo)).toBe('45 ìṣẹ́jú sẹ́yìn');
});

test('"just now" never takes "ago"', () => {
  // "just now ago" appeared on the fleet screen once. The check is against the
  // reader's own phrase, not the English one, or it only holds in English.
  expect(agoLabel(30_000, en)).toBe('just now');
  expect(agoLabel(30_000, yo)).toBe('ìṣẹ́jú yìí');
});

test('pluralisation is done once, not at every call site', () => {
  // Got wrong three times in this app — "every 1 minutes", "1 completed trip",
  // "1 hours stopped" — always by writing the number and the noun into the
  // same template literal.
  expect(plural(1, 'hour')).toBe('1 hour');
  expect(plural(2, 'hour')).toBe('2 hours');
  expect(plural(1.0, 'hour')).toBe('1 hour');
  expect(plural(1.5, 'hour')).toBe('1.5 hours');
  expect(plural(0, 'position')).toBe('0 positions');
  expect(plural(1, 'position')).toBe('1 position');
  expect(plural(1, 'entry', 'entries')).toBe('1 entry');
  expect(plural(3, 'entry', 'entries')).toBe('3 entries');
});

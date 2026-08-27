import { humanDuration, plural } from '../src/components/PositionAge';

test('durations round down, so a gap never sounds worse than it is', () => {
  // Rounding up makes every gap sound worse than it is, and the chip stops
  // being believed — which is the failure mode that matters, because the chip
  // is the only thing standing between a shipper and a phone call.
  expect(humanDuration(30_000)).toBe('just now');
  expect(humanDuration(59_000)).toBe('just now');
  expect(humanDuration(60_000)).toBe('1 min');
  expect(humanDuration(59 * 60_000)).toBe('59 min');
  expect(humanDuration(60 * 60_000)).toBe('1 hour');
  expect(humanDuration(119 * 60_000)).toBe('1 hour');
  expect(humanDuration(2 * 60 * 60_000)).toBe('2 hours');
  expect(humanDuration(25 * 60 * 60_000)).toBe('1 day');
  expect(humanDuration(72 * 60 * 60_000)).toBe('3 days');
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

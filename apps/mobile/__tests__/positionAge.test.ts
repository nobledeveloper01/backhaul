import { humanDuration } from '../src/components/PositionAge';

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

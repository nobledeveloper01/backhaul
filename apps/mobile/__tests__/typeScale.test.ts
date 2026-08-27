import { MAX_SCALE, lineHeightAt, type } from '../src/design/tokens';

/**
 * How tall a line actually is, at the reader's own text size.
 *
 * Two things read this: `Text`, to cap what it renders, and `Icon`, to decide
 * where to sit beside a line of it. They have to agree — an icon that assumes
 * a display heading grew to 310% when the heading capped at 150% sits a long
 * way from the words it belongs to, and nothing fails except the look of it.
 */
describe('lineHeightAt', () => {
  test('grows with the reader at default settings', () => {
    expect(lineHeightAt('body', 1)).toBe(type.body.lineHeight);
    expect(lineHeightAt('body', 2)).toBe(type.body.lineHeight * 2);
  });

  test('body and the driver face are never capped', () => {
    // The two variants that carry meaning rather than emphasis. A low-vision
    // driver needs these to grow all the way, and a cap here would be the
    // accessibility setting quietly refused.
    for (const variant of ['body', 'bodyDriver'] as const) {
      expect(MAX_SCALE[variant]).toBeUndefined();
      expect(lineHeightAt(variant, 3.1)).toBeCloseTo(type[variant].lineHeight * 3.1);
    }
  });

  test('and display type stops where it was told to', () => {
    // A 36pt hero at 310% is 112pt and fills a phone. The cap is what keeps
    // the loads on the loads screen.
    expect(lineHeightAt('display', 3.1)).toBe(type.display.lineHeight * 1.5);
  });

  test('a cap never shrinks anything below its own size', () => {
    // `Math.min` and not a bare multiply: a reader who has made text *smaller*
    // must not have a capped variant scaled back up to the cap.
    expect(lineHeightAt('display', 0.8)).toBeCloseTo(type.display.lineHeight * 0.8);
  });

  test('every variant in the scale has an answer about capping', () => {
    // Exhaustive by type, and asserted at runtime too: a variant added to the
    // scale and forgotten here would render uncapped by accident rather than
    // by decision.
    for (const variant of Object.keys(type) as (keyof typeof type)[]) {
      expect(variant in MAX_SCALE).toBe(true);
    }
  });
});

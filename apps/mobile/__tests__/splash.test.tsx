import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Text as RNText } from 'react-native';

import { Splash } from '../src/components/Splash';

/**
 * Lets React flush its effects.
 *
 * `act` needs an async callback to do that, and the bodies here are
 * synchronous — so each awaits a microtask. Also what lets the reduced-motion
 * promise inside the component resolve before the assertions run.
 */
const settle = () => Promise.resolve();

/**
 * The first thing anybody sees.
 *
 * These exist because a splash is almost impossible to check by looking: it is
 * on screen for a second and a half, it is the same colour as the native
 * launch screen it takes over from, and a screenshot lands either side of it.
 * Two of these three assertions come from getting that wrong — the first
 * version left on the frame the animation finished, and the reduced-motion
 * path skipped it entirely.
 */
describe('the splash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('does not leave before the app is ready, however long that takes', async () => {
    const done = jest.fn();
    let tree!: ReturnType<typeof create>;

    await act(async () => {
      tree = create(<Splash ready={false} onDone={done} />);
      await settle();
    });

    // Ten seconds of a slow cold start. It is still there, because the thing
    // it is covering has not finished.
    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await settle();
    });

    expect(done).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
      await settle();
    });
  });

  test('and does not leave the instant it is, either', async () => {
    // The floor. A splash that departs the moment a fast phone is ready is a
    // flash, and a flash reads as a glitch rather than as a start.
    const done = jest.fn();
    let tree!: ReturnType<typeof create>;

    await act(async () => {
      tree = create(<Splash ready onDone={done} />);
      await settle();
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
      await settle();
    });
    expect(done).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await settle();
    });
    expect(done).toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
      await settle();
    });
  });

  test('holds the mark for somebody who asked for no animation', async () => {
    // Reduced motion snaps the arrival to its end; it does not skip the
    // splash. The first version cut the duration to a millisecond and called
    // that "held", which made the whole thing 300 ms for anybody with the
    // setting on — a flash, for the people least well served by one.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const done = jest.fn();
    let tree!: ReturnType<typeof create>;

    await act(async () => {
      tree = create(<Splash ready onDone={done} />);
      await settle();
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
      await settle();
    });
    expect(done).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
      await settle();
    });
  });

  test('says the product name, and nothing about a framework', async () => {
    // The template's launch screen said "Powered by React Native" along the
    // bottom. Nobody holding the phone is served by that.
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Splash ready={false} onDone={jest.fn()} />);
      await settle();
    });

    const words = tree.root
      .findAllByType(RNText)
      .flatMap((node) => (typeof node.props.children === 'string' ? [node.props.children] : []));

    expect(words).toContain('Backhaul');
    expect(words.join(' ')).not.toMatch(/react/i);

    await act(async () => {
      tree.unmount();
      await settle();
    });
  });
});

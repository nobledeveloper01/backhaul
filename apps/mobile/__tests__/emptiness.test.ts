import { emptiness, type Query } from '../src/state/server';

/**
 * Why a list is empty.
 *
 * The whole point is that four of the five answers are not about the reader's
 * data. `query.state === 'ready' ? query.value : []` is one line, obviously
 * correct, and says *nothing here* to somebody whose phone never reached the
 * server — which on the fleet screen read "Nothing needs you" and on the
 * dispute pack read "0% of the trip is covered by tracking".
 */
const READY = (n: number): Query<readonly number[]> => ({
  state: 'ready',
  value: Array.from({ length: n }, (_, i) => i),
});

describe('emptiness', () => {
  test('an unfinished request is not an empty one', () => {
    expect(emptiness({ state: 'loading' }, 0, false)).toBe('loading');
  });

  test('a server that could not be reached is not an empty one', () => {
    expect(emptiness({ state: 'unreachable' }, 0, false)).toBe('unreachable');
  });

  test('and a server that said no is a third thing again', () => {
    expect(
      emptiness(
        {
          state: 'refused',
          failure: { kind: 'refused', status: 403, detail: 'no', code: null },
        },
        0,
        false,
      ),
    ).toBe('refused');
  });

  test('nothing yet and nothing matching are told apart by the filter', () => {
    expect(emptiness(READY(0), 0, false)).toBe('none');
    expect(emptiness(READY(3), 0, true)).toBe('filtered');
  });

  test('and rows mean there is nothing to explain', () => {
    expect(emptiness(READY(3), 3, false)).toBeNull();
    expect(emptiness(READY(3), 1, true)).toBeNull();
  });

  test('the three that are not about the data outrank the two that are', () => {
    // Order matters. A screen that checked `shown === 0` first would report
    // "nothing matching" for a request that never came back, and blame the
    // reader's own filter for the network.
    expect(emptiness({ state: 'loading' }, 0, true)).toBe('loading');
    expect(emptiness({ state: 'unreachable' }, 0, true)).toBe('unreachable');
  });
});

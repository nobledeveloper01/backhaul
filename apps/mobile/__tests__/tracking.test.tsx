import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { useTracking } from '../src/state/tracking';
import { BackhaulApi } from '@backhaul/api';
import * as permissions from '../src/native/permissions';
import { Tracker } from '../src/native/tracker';

/**
 * The loop that is the product, and when it is allowed to run.
 *
 * These are about one rule: **capture never starts without location.** The
 * subsystem exists to prevent a stretch of road nobody can account for, and
 * the worst version of that is a driver who was never told the recording had
 * not begun — so a refusal has to reach the screen rather than the log.
 */
const api = new BackhaulApi('http://127.0.0.1:0', null);

/**
 * Lets the effects settle.
 *
 * `act` has to be given an async callback for React to flush effects, and the
 * bodies here are synchronous — so each one awaits a microtask, which is also
 * what lets the permission promise inside the hook resolve before the tree is
 * read.
 */
const settle = () => Promise.resolve();

function Probe({ tripId, tracking }: { tripId: string | null; tracking: boolean }) {
  const loop = useTracking(api, tripId, tracking, true);
  return <Text>{`${loop.blocker ?? 'none'}|${loop.restricted}`}</Text>;
}

function said(tree: ReturnType<typeof create>): string {
  return (tree.root.findByType(Text).props as { children: string }).children;
}

describe('useTracking', () => {
  const start = jest.spyOn(Tracker.prototype, 'start').mockResolvedValue(undefined);
  const stop = jest.spyOn(Tracker.prototype, 'stop').mockResolvedValue(undefined);
  const tick = jest.spyOn(Tracker.prototype, 'tick');

  /*
    The native module is absent under Jest, and `available` is false because of
    it — the correct answer for a build where the module was never linked, and
    the wrong premise for a test about permissions. Faked present here so these
    tests ask the question they claim to ask; its own case is below.
  */
  /*
    Every tree is unmounted.

    The loop schedules its next turn with `setTimeout`, and a tree left mounted
    holds that timer open — Jest says so, and the same handle on a phone is a
    loop that outlives the screen. Cleaning up here is the test asserting the
    cleanup exists.
  */
  const mounted: ReturnType<typeof create>[] = [];

  const render = async (element: React.ReactElement) => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element);
      await settle();
    });
    mounted.push(tree);
    return tree;
  };

  beforeEach(() => {
    jest.spyOn(Tracker.prototype, 'available', 'get').mockReturnValue(true);
    start.mockClear();
    stop.mockClear();
    tick.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      for (const tree of mounted.splice(0)) tree.unmount();
      await settle();
    });
  });

  test('a phone that cannot record says so before it says anything else', async () => {
    // Precedence, not an accident. A driver holding a handset with no capture
    // module has nothing to allow, and prompting them would be a dialog with
    // no outcome behind it.
    jest.spyOn(Tracker.prototype, 'available', 'get').mockReturnValue(false);
    const ask = jest
      .spyOn(permissions, 'request')
      .mockResolvedValue({ location: 'denied', notifications: 'denied' });

    const tree = await render(<Probe tripId="t1" tracking />);

    expect(said(tree)).toBe('tracking_not_available|false');
    ask.mockRestore();
  });

  test('does not ask for anything when there is no trip to record', async () => {
    // A shipper opening the driver face out of curiosity should not raise a
    // location prompt, and a phone that is not recording should not be paying
    // for a loop.
    const ask = jest.spyOn(permissions, 'request');
    const tree = await render(<Probe tripId={null} tracking={false} />);
    expect(ask).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(said(tree)).toBe('none|false');
    ask.mockRestore();
  });

  test('refuses to start when location is denied, and says so', async () => {
    const ask = jest
      .spyOn(permissions, 'request')
      .mockResolvedValue({ location: 'denied', notifications: 'granted' });

    const tree = await render(<Probe tripId="t1" tracking />);

    expect(start).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    // The phrase, not a sentence and not a silence.
    expect(said(tree)).toBe('location_denied|false');
    ask.mockRestore();
  });

  test('tells blocked apart from denied, because Settings is the only way on', async () => {
    const ask = jest
      .spyOn(permissions, 'request')
      .mockResolvedValue({ location: 'blocked', notifications: 'granted' });

    const tree = await render(<Probe tripId="t1" tracking />);

    expect(said(tree)).toBe('location_blocked|false');
    ask.mockRestore();
  });

  test('starts once location is granted', async () => {
    const ask = jest
      .spyOn(permissions, 'request')
      .mockResolvedValue({ location: 'granted', notifications: 'granted' });
    tick.mockResolvedValue({
      queued: 4,
      health: 'fine',
      oldestWaiting: null,
      sampleIn: 60,
      because: 'moving',
      restrictedByOs: false,
    });

    await render(<Probe tripId="t1" tracking />);

    expect(start).toHaveBeenCalledWith('t1', expect.any(Number));
    ask.mockRestore();
  });

  test('a refused notification does not stop the trip being recorded', async () => {
    // `canTrack` requires location and nothing else. A driver who says no to a
    // notification gets a warning about gaps, not a trip that is not recorded.
    const ask = jest
      .spyOn(permissions, 'request')
      .mockResolvedValue({ location: 'granted', notifications: 'denied' });
    tick.mockResolvedValue({
      queued: 0,
      health: 'fine',
      oldestWaiting: null,
      sampleIn: 60,
      because: 'moving',
      restrictedByOs: false,
    });

    const tree = await render(<Probe tripId="t1" tracking />);

    expect(start).toHaveBeenCalled();
    expect(said(tree)).toBe('notifications_missing|false');
    ask.mockRestore();
  });

  test('stops the native loop when the trip stops being one that is tracked', async () => {
    const ask = jest
      .spyOn(permissions, 'request')
      .mockResolvedValue({ location: 'granted', notifications: 'granted' });
    tick.mockResolvedValue({
      queued: 0,
      health: 'fine',
      oldestWaiting: null,
      sampleIn: 60,
      because: 'moving',
      restrictedByOs: false,
    });

    const tree = await render(<Probe tripId="t1" tracking />);
    await act(async () => {
      tree.update(<Probe tripId="t1" tracking={false} />);
      await settle();
    });

    // Stopping does not delete anything still queued — that is the native
    // module's contract, and it is why a delivered trip can still be uploading.
    expect(stop).toHaveBeenCalled();
    ask.mockRestore();
  });
});

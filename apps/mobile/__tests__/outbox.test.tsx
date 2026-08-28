import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BackhaulApi } from '@backhaul/api';
import { useOutbox } from '../src/state/outbox';
import { unsent, writeDraft, type Draft } from '../src/state/drafts';

/**
 * The sweep that runs when the proof screen is not open.
 *
 * `useDelivery` sends what is in front of the driver. That was all there was:
 * a delivery sealed at a gate uploaded only while somebody was looking at that
 * trip, and a finished trip is precisely the one a driver never opens again.
 * A delivery that sits on a phone is an escrow milestone that never releases.
 */
const AT = new Date('2026-03-04T16:20:00Z');

const draft = (tripId: string, sealed: boolean): Draft => ({
  delivery: {
    tripId,
    at: AT,
    photoIds: ['p1', 'p2'],
    signature: { name: 'Ibrahim Sani', role: 'storekeeper', imageId: 's1' },
    capturedAt: null,
    note: '',
    exception: null,
  },
  sealedAt: sealed ? AT : null,
  acknowledgedAt: null,
});

let seen = 0;

function Probe({ api, online }: { api: BackhaulApi; online: boolean }) {
  const outbox = useOutbox(api, online);
  seen = outbox.waiting;
  return <Text>{String(outbox.waiting)}</Text>;
}

const settle = () => Promise.resolve();

describe('the outbox', () => {
  beforeEach(async () => {
    seen = 0;
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  test('sends a sealed delivery the screen never got to send', async () => {
    await writeDraft(draft('t1', true));

    const api = new BackhaulApi('http://127.0.0.1:1', null, 50);
    const saved = jest
      .spyOn(BackhaulApi.prototype, 'saveDelivery')
      .mockResolvedValue({ ok: true, value: {} as never });
    const sealed = jest
      .spyOn(BackhaulApi.prototype, 'sealDelivery')
      .mockResolvedValue({ ok: true, value: { sealedAt: AT } as never });

    const tree = create(<Probe api={api} online />);
    await act(settle);
    await act(settle);

    expect(saved).toHaveBeenCalledTimes(1);
    expect(sealed).toHaveBeenCalledTimes(1);
    expect(seen).toBe(0);

    // And it is gone from the outbox, because the server countersigned it.
    expect((await unsent()).length).toBe(0);
    tree.unmount();
  });

  test('never seals on the driver’s behalf', async () => {
    // A draft the driver captured and did not close. Sealing is their act —
    // an outbox that finished a delivery for them would be the platform
    // asserting a hand-over happened.
    await writeDraft(draft('t2', false));

    const api = new BackhaulApi('http://127.0.0.1:1', null, 50);
    jest
      .spyOn(BackhaulApi.prototype, 'saveDelivery')
      .mockResolvedValue({ ok: true, value: {} as never });
    const sealed = jest.spyOn(BackhaulApi.prototype, 'sealDelivery');

    const tree = create(<Probe api={api} online />);
    await act(settle);
    await act(settle);

    expect(sealed).not.toHaveBeenCalled();
    tree.unmount();
  });

  test('keeps the draft when the server does not answer', async () => {
    // ADR-0009's rule, one layer up: evidence is not deleted on a hope. The
    // API here points at a port nothing is listening on.
    await writeDraft(draft('t3', true));

    const api = new BackhaulApi('http://127.0.0.1:1', null, 50);
    const tree = create(<Probe api={api} online />);
    await act(settle);
    await act(settle);

    expect((await unsent()).length).toBe(1);
    tree.unmount();
  });

  test('does not try at all while the phone is offline', async () => {
    await writeDraft(draft('t4', true));

    const api = new BackhaulApi('http://127.0.0.1:1', null, 50);
    const saved = jest.spyOn(BackhaulApi.prototype, 'saveDelivery');

    const tree = create(<Probe api={api} online={false} />);
    await act(settle);

    expect(saved).not.toHaveBeenCalled();
    tree.unmount();
  });
});

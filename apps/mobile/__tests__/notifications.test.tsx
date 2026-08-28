import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { useNotifications } from '../src/state/notifications';
import { BackhaulApi } from '../src/api/client';
import * as push from '../src/native/push';

/**
 * Registering this install for notifications.
 *
 * The rules here all fail *silently* when they are wrong, which is why they
 * are tests rather than something to check by looking. A device row holding an
 * invented token looks exactly like one that works: the dispatcher sends to
 * it, records the alert as sent, and `repeatAfterMs` then suppresses the retry
 * — so a shipper is never told about the stall and nothing anywhere reports a
 * failure. See ADR-0013.
 */
const api = new BackhaulApi('http://127.0.0.1:0', 'a-token');
const settle = () => Promise.resolve();

function Probe({ userId }: { userId: string | null }) {
  const state = useNotifications(api, userId);
  return <Text>{`${state.reachable ?? 'working'}|${state.why ?? '-'}`}</Text>;
}

function said(tree: ReturnType<typeof create>): string {
  return (tree.root.findByType(Text).props as { children: string }).children;
}

describe('useNotifications', () => {
  /*
    Installed in `beforeEach`, not once.

    `restoreAllMocks` in the teardown below uninstalls every spy, so a spy
    created at describe level survives exactly one test — after which the real
    `registerDevice` runs, fetches `127.0.0.1:0`, and fails. That made one of
    these assertions pass for entirely the wrong reason before it was noticed:
    "a refused registration is not reachable" was green because the *fetch* had
    failed, not because the server had refused.
  */
  let register!: jest.SpyInstance;
  let forget!: jest.SpyInstance;

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
    register = jest
      .spyOn(BackhaulApi.prototype, 'registerDevice')
      .mockResolvedValue({ ok: true, value: null });
    forget = jest
      .spyOn(BackhaulApi.prototype, 'forgetDevice')
      .mockResolvedValue({ ok: true, value: null });
  });

  afterEach(async () => {
    await act(async () => {
      for (const tree of mounted.splice(0)) tree.unmount();
      await settle();
    });
    jest.restoreAllMocks();
  });

  test('registers nothing when nobody is signed in', async () => {
    // A registration says who to reach. Before anybody has signed in there is
    // no answer to that, and a row written now would point at whoever signs in
    // next.
    const token = jest.spyOn(push, 'pushToken');
    const tree = await render(<Probe userId={null} />);

    expect(token).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(said(tree)).toBe('working|-');
  });

  test('never registers a token it does not have', async () => {
    // The rule this file exists for. No provider linked means no token, and a
    // made-up one is a promise the platform cannot keep.
    jest
      .spyOn(push, 'pushToken')
      .mockResolvedValue({ kind: 'unavailable', why: 'push_not_configured' });

    const tree = await render(<Probe userId="u1" />);

    expect(register).not.toHaveBeenCalled();
    expect(said(tree)).toBe('false|push_not_configured');
  });

  test('and says which kind of "no" it is', async () => {
    // A build with no credentials is nothing the person holding the phone can
    // act on; notifications switched off is. Two situations, two sentences.
    jest.spyOn(push, 'pushToken').mockResolvedValue({ kind: 'unavailable', why: 'push_refused' });

    const tree = await render(<Probe userId="u1" />);
    expect(said(tree)).toBe('false|push_refused');
  });

  test('registers a real token with the platform and the reader\'s own offset', async () => {
    // The offset travels with the registration because quiet hours are the
    // reader's. The dispatcher runs at three in the morning with nobody to ask.
    jest.spyOn(push, 'pushToken').mockResolvedValue({ kind: 'token', value: 'real-token' });
    jest.spyOn(push, 'utcOffsetMinutes').mockReturnValue(60);
    jest.spyOn(push, 'pushPlatform').mockReturnValue('android');

    const tree = await render(<Probe userId="u1" />);

    expect(register).toHaveBeenCalledWith('real-token', 'android', 60);
    expect(said(tree)).toBe('true|-');
  });

  test('a refused registration is not a reachable phone', async () => {
    // The token is real and the server declined to store it. Nothing will
    // arrive, and the screen has to say so rather than describe what would.
    jest.spyOn(push, 'pushToken').mockResolvedValue({ kind: 'token', value: 'real-token' });
    register.mockResolvedValue({
      ok: false,
      failure: { kind: 'refused', status: 401, detail: 'no', code: null },
    });

    const tree = await render(<Probe userId="u1" />);
    expect(said(tree)).toBe('false|push_refused');
  });

  test('withdraws the registration when the person signs out', async () => {
    // A phone is handed between two drivers on alternate weeks in this market.
    // A device row left pointing at whoever signed in first sends one person's
    // trips to the other person's phone.
    jest.spyOn(push, 'pushToken').mockResolvedValue({ kind: 'token', value: 'real-token' });

    const tree = await render(<Probe userId="u1" />);
    await act(async () => {
      tree.update(<Probe userId={null} />);
      await settle();
    });

    expect(forget).toHaveBeenCalledWith('real-token');
  });
});

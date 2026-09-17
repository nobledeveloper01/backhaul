import { useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter } from 'react-native';

import { BackhaulApi, DEFAULT_BASE_URL } from '@backhaul/api';
import {
  NativeOutbox,
  OUTBOX_REFRESH_EVENT,
  type OutboxSpec,
} from '@backhaul/tracking-native';
import { send, unsent } from './drafts';
import { storedToken } from './session';

/**
 * Every sealed delivery this phone is still holding, sent when it can be.
 *
 * `useDelivery` sends what is in front of the driver, and that was all there
 * was: a delivery captured at a gate uploaded only while the proof screen was
 * open. A driver who sealed one and put the phone in their pocket sent nothing
 * until they happened to open that trip again — which on a Lagos–Kano run
 * might be two days, and might be never, because the trip is finished and
 * there is no reason to go back to it.
 *
 * That is not a lost form. `earnings.ts` skips a delivered trip with no sealed
 * proof and the escrow milestone never releases, so a delivery that sits on a
 * phone is a driver who finished the run and is not paid. See ADR-0018.
 *
 * The sweep is **one function, called from three places**: the foreground
 * effect below, the Android headless task and the iOS refresh listener. One
 * place a draft is sent and one place it is acknowledged. The native side
 * only wakes it (ADR-0023); it reads no draft and holds no token.
 */
export interface Outbox {
  /** How many sealed deliveries this phone is still holding. */
  readonly waiting: number;
}

export interface Sweep {
  /** How many were waiting when the sweep began. */
  readonly held: number;
  /** How many are still waiting after it. */
  readonly left: number;
}

/** The native seam, or nothing — Jest, the web console, an unlinked build. */
export type OutboxModule = OutboxSpec | null;

/**
 * Sends everything waiting, in order, and says what is left.
 *
 * In order, not in parallel. A phone with four unsent deliveries is a phone
 * that has been out of signal for days, and firing four requests at the
 * first bar of signal is how none of them completes.
 */
export async function sweepOutbox(
  api: BackhaulApi,
  onCounted?: (held: number) => void,
): Promise<Sweep> {
  const held = await unsent();
  onCounted?.(held.length);

  let left = held.length;
  for (const draft of held) {
    const acknowledged = await send(api, draft);
    if (acknowledged !== null) left -= 1;
  }

  return { held: held.length, left };
}

/**
 * A delivery was just sealed: ask the OS to wake this side when it can.
 *
 * Called from `useDelivery.close`, once, when the draft is written. Nothing
 * is passed but the fact — the native side learns that something is waiting,
 * and nothing about what.
 */
export function wakeForOutbox(native: OutboxModule = NativeOutbox ?? null): void {
  void native?.schedule().catch(() => {
    // A phone that cannot schedule still sweeps on the next foreground; the
    // draft is on disk either way.
  });
}

/**
 * The sweep with no app around it.
 *
 * What Android's periodic job runs (registered as a headless task in
 * `index.js`) — the app is not open, no provider has mounted, and this
 * builds the same client the foreground would from the same stored token.
 * When nothing is left it tells the OS to stop waking the phone; when
 * something is, the job stays and tries again at the next network.
 */
export async function outboxTask(native: OutboxModule = NativeOutbox ?? null): Promise<void> {
  const token = await storedToken();
  if (token === null) {
    // Nobody is signed in, so nothing was ever sealed by anybody. Stop.
    await native?.cancel().catch(() => {});
    return;
  }

  const api = new BackhaulApi(DEFAULT_BASE_URL, token);
  const swept = await sweepOutbox(api);
  if (swept.left === 0) await native?.cancel().catch(() => {});
}

export function useOutbox(
  api: BackhaulApi,
  online: boolean,
  native: OutboxModule = NativeOutbox ?? null,
): Outbox {
  const [waiting, setWaiting] = useState(0);

  /*
    One sweep at a time.

    Two overlapping sweeps would send the same draft twice — harmless on the
    server, which takes a `PUT` and an idempotent seal, and not harmless here:
    the second sweep's answer can land first and write a stale
    acknowledgement over a fresh one.
  */
  const sweeping = useRef(false);

  useEffect(() => {
    let alive = true;

    const sweep = async () => {
      if (!online || sweeping.current) return;
      sweeping.current = true;

      try {
        const swept = await sweepOutbox(api, (held) => {
          if (alive) setWaiting(held);
        });
        if (!alive) return;

        setWaiting(swept.left);
        // A phone with no deliveries costs nothing: the wake is cancelled the
        // moment the last one is acknowledged, from whichever sweep did it.
        if (swept.left === 0 && swept.held > 0) await native?.cancel().catch(() => {});
      } finally {
        sweeping.current = false;
      }
    };

    void sweep();

    // Coming back to the foreground is the moment worth retrying on: it is
    // when a driver has walked out of the yard, and it costs nothing when
    // there is nothing to send.
    const woke = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sweep();
    });

    /*
      iOS wakes this side rather than running anything of its own.

      The refresh task posts one event; the sweep runs inside the task's
      window and `finished` lets the task end. `finished` is called whether
      or not anything was sent, because a task that is not ended is one iOS
      stops granting.
    */
    const refreshed =
      native === null
        ? null
        : new NativeEventEmitter(native).addListener(OUTBOX_REFRESH_EVENT, () => {
            void sweep().finally(() => {
              void native.finished().catch(() => {});
            });
          });

    return () => {
      alive = false;
      woke.remove();
      refreshed?.remove();
    };
  }, [api, online, native]);

  return { waiting };
}

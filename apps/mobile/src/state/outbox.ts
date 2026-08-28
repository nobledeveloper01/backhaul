import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { BackhaulApi } from '@backhaul/api';
import { send, unsent } from './drafts';

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
 * Deliberately **not** a background task. This sweeps when the app is running
 * and when it comes back to the foreground, which is the same shape as every
 * other retry in this app and needs no new native surface. A driver who never
 * opens the app again still has an unsent delivery — and the thing that fixes
 * *that* is the native queue the tracker already uses, which is a different
 * piece of work and is written down rather than pretended.
 */
export interface Outbox {
  /** How many sealed deliveries this phone is still holding. */
  readonly waiting: number;
}

export function useOutbox(api: BackhaulApi, online: boolean): Outbox {
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
        const held = await unsent();
        if (!alive) return;

        setWaiting(held.length);
        if (held.length === 0) return;

        // In order, not in parallel. A phone with four unsent deliveries is a
        // phone that has been out of signal for days, and firing four requests
        // at the first bar of signal is how none of them completes.
        let left = held.length;
        for (const draft of held) {
          if (!alive) return;
          const acknowledged = await send(api, draft);
          if (acknowledged !== null) left -= 1;
        }

        if (alive) setWaiting(left);
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

    return () => {
      alive = false;
      woke.remove();
    };
  }, [api, online]);

  return { waiting };
}

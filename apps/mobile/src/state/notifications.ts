import { useEffect, useRef, useState } from 'react';
import type { Phrase } from '@backhaul/domain';

import { pushPlatform, pushToken, utcOffsetMinutes } from '../native/push';
import type { BackhaulApi } from '@backhaul/api';

/**
 * Whether anything the alert policy decides can actually arrive here.
 *
 * `null` while the answer is still being worked out — the same shape as every
 * other unresolved question in this app, because "we do not know yet" and "no"
 * are different things to render.
 */
export interface Deliverable {
  readonly reachable: boolean | null;
  /** Why not, when not. A phrase key: this is read in four languages. */
  readonly why: Phrase | null;
}

const WORKING: Deliverable = { reachable: null, why: null };

/**
 * Registers this install for notifications, once, per signed-in person.
 *
 * The alerting path was complete except for this: the policy, the dispatcher,
 * the per-person timezone offset, the quiet-hour hold, the overnight digest
 * and the `repeatAfterMs` deduplication were all built and tested, the client
 * had a `registerDevice` method — and nothing called it. So there were no
 * devices, the dispatcher had nobody to tell, and the alerts screen described
 * a delivery that had never happened on any phone.
 *
 * **A token is registered only if it is real.** See ADR-0013: a `Devices` row
 * holding an invented string is a promise the platform cannot keep, and it
 * fails silently in the worst direction — the dispatcher records the alert as
 * sent, `repeatAfterMs` suppresses the retry, and the shipper is never told
 * about the stall.
 *
 * Registration is idempotent server-side and keyed on the token, so running
 * this on every sign-in costs one row write and keeps the timezone offset
 * fresh — which matters, because a driver who crosses into a different offset
 * should not keep somebody else's quiet hours.
 */
export function useNotifications(api: BackhaulApi, userId: string | null): Deliverable {
  const [state, setState] = useState<Deliverable>(WORKING);

  // What was registered, so signing out can withdraw exactly that and no more.
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (userId === null) {
      setState(WORKING);
      return undefined;
    }

    let cancelled = false;

    void pushToken().then(async (found) => {
      if (cancelled) return;

      if (found.kind === 'unavailable') {
        setState({ reachable: false, why: found.why });
        return;
      }

      const sent = await api.registerDevice(
        found.value,
        pushPlatform(),
        utcOffsetMinutes(),
      );
      if (cancelled) return;

      /*
        A refused registration is not a reachable phone.

        The token is real and the server declined to store it — an expired
        session, a server that is down. Either way nothing will arrive, and
        saying so is the whole point of this hook. It is not retried here: a
        silent retry loop against a Nigerian network is somebody's airtime, and
        the next sign-in tries again anyway.
      */
      if (!sent.ok) {
        setState({ reachable: false, why: 'push_refused' });
        return;
      }

      registered.current = found.value;
      setState({ reachable: true, why: null });
    });

    return () => {
      cancelled = true;
    };
  }, [api, userId]);

  /*
    Withdrawn when the person goes.

    A phone is handed between two drivers on alternate weeks in this market. A
    device row left pointing at whoever signed in first sends one person's
    trips to the other person's phone — which the server guards against on
    re-registration, and this closes from the other end for the case where
    nobody signs in after.
  */
  useEffect(() => {
    if (userId !== null) return undefined;

    const token = registered.current;
    if (token === null) return undefined;

    registered.current = null;
    void api.forgetDevice(token);
    return undefined;
  }, [api, userId]);

  return state;
}

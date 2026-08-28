import { useCallback, useEffect, useRef, useState } from 'react';
import { seal, type Delivery } from '@backhaul/domain';

import type { BackhaulApi, DeliveryDraft } from '@backhaul/api';
import { forget, readDraft, writeDraft, type Draft } from './drafts';

/**
 * A delivery, captured on the phone and sent when there is a network.
 *
 * The order is the whole point and it is the reverse of what `ProofScreen`
 * used to do: **write locally, then try the server**. A driver at a market
 * gate in Kano with no signal photographs the goods, takes a signature, and
 * seals the delivery — all of it durable, none of it dependent on a request.
 * The upload follows when it can. See ADR-0018.
 */

export interface Held {
  readonly delivery: Delivery;
  /** When the driver sealed it, by this phone's clock. */
  readonly sealedAt: Date | null;
  /** When the server countersigned. Null while it is still only on this phone. */
  readonly acknowledgedAt: Date | null;
  /** False until storage has answered. Nothing decisive is shown before then. */
  readonly ready: boolean;
}

function toDraftBody(delivery: Delivery): DeliveryDraft {
  return {
    at: delivery.at,
    photoIds: [...delivery.photoIds],
    signatureName: delivery.signature?.name ?? null,
    signatureRole: delivery.signature?.role ?? null,
    signatureImageId: delivery.signature?.imageId ?? null,
    // Omitted rather than nulled when there was no fix. The three are
    // optional on the wire and a null latitude is not a place.
    ...(delivery.capturedAt === null
      ? {}
      : {
          capturedLat: delivery.capturedAt.lat,
          capturedLon: delivery.capturedAt.lon,
          capturedAccuracy: delivery.capturedAt.accuracy,
        }),
    note: delivery.note,
    exceptionKind: delivery.exception?.kind ?? null,
    exceptionQuantity: delivery.exception?.quantity ?? null,
    exceptionNote: delivery.exception?.note ?? null,
  };
}

export interface Capture {
  readonly held: Held;
  /** Records a capture. Local first, then sent if the network allows. */
  readonly save: (next: Delivery) => void;
  /** The driver says it is done. Refuses if `seal()` does. */
  readonly close: () => void;
}

export function useDelivery(
  api: BackhaulApi,
  tripId: string,
  live: boolean,
  initial: Delivery,
): Capture {
  const [held, setHeld] = useState<Held>({
    delivery: initial,
    sealedAt: null,
    acknowledgedAt: null,
    ready: false,
  });

  /*
    `initial` is a fallback, not an input, and it is held in a ref so it cannot
    reach the effect's dependencies.

    It was in them, and a caller who built the object inline — which is the
    obvious way to call this — got a new identity on every render, so the
    effect re-ran, set state, and re-rendered for ever. A hook whose contract
    is "remember to useMemo this or the app hangs" is a hook with a trap in it.
  */
  const fallback = useRef(initial);
  fallback.current = initial;

  /*
    The draft is authoritative and the server's copy is reconciled into it.

    Not the other way round: a phone that has been offline for the whole trip
    has the only copy of this delivery, and a read that came back empty
    overwriting it would delete the evidence. The server can only *add* a
    countersignature.
  */
  useEffect(() => {
    let alive = true;

    void (async () => {
      const stored = await readDraft(tripId);
      if (!alive) return;

      const local: Held = {
        delivery: stored?.delivery ?? fallback.current,
        sealedAt: stored?.sealedAt ?? null,
        acknowledgedAt: stored?.acknowledgedAt ?? null,
        ready: true,
      };
      setHeld(local);

      if (!live) return;

      const answer = await api.delivery(tripId);
      if (!alive || !answer.ok || answer.value === null) return;

      // A server that already holds a sealed delivery has the older claim on
      // this trip, and two sealed proofs for one delivery is something a
      // person looks at rather than something a merge rule decides. The local
      // draft is kept either way — see ADR-0018.
      setHeld((was) => ({
        ...was,
        acknowledgedAt: answer.value?.sealedAt ?? was.acknowledgedAt,
      }));
    })();

    return () => {
      alive = false;
    };
  }, [api, tripId, live]);

  /** Sends what is held, and forgets it only once the server has answered. */
  const push = useCallback(
    async (draft: Draft) => {
      if (!live) return;

      const saved = await api.saveDelivery(tripId, toDraftBody(draft.delivery));
      if (!saved.ok) return;
      if (draft.sealedAt === null) return;

      const sealed = await api.sealDelivery(tripId);
      if (!sealed.ok || sealed.value.sealedAt === null) return;

      const acknowledged = sealed.value.sealedAt;
      setHeld((was) => ({ ...was, acknowledgedAt: acknowledged }));
      await writeDraft({ ...draft, acknowledgedAt: acknowledged });

      // Kept, not deleted. The document is composed from it and a dispute may
      // ask for it months later; the server having a copy is what makes it
      // safe to stop *retrying*, not what makes it safe to throw away.
      void forget;
    },
    [api, tripId, live],
  );

  const save = useCallback(
    (next: Delivery) => {
      setHeld((was) => {
        const draft: Draft = {
          delivery: next,
          sealedAt: was.sealedAt,
          acknowledgedAt: was.acknowledgedAt,
        };
        void writeDraft(draft).then(() => push(draft));
        return { ...was, delivery: next, ready: true };
      });
    },
    [push],
  );

  const close = useCallback(() => {
    setHeld((was) => {
      // The rule, run here rather than asked of the server. It is pure, it is
      // parity-tested, and it needs nothing but the delivery in front of it:
      // two photographs, a signature, a name.
      if (was.sealedAt !== null || !seal(was.delivery).ok) return was;

      const sealedAt = new Date();
      const draft: Draft = {
        delivery: was.delivery,
        sealedAt,
        acknowledgedAt: was.acknowledgedAt,
      };
      void writeDraft(draft).then(() => push(draft));
      return { ...was, sealedAt };
    });
  }, [push]);

  return { held, save, close };
}
